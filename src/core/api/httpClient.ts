import { env } from '@/core/config/env';

/**
 * Single HTTP entry point for every module.
 *
 * Security notes (see architecture doc §6, §9, §10):
 *  - The client NEVER sends a tenantId. The backend derives the tenant from the
 *    authenticated user (CurrentUser -> CurrentTenant).
 *  - Every request carries a correlation id so logs/traces can be stitched together.
 *  - 401 => the short access token ran out: get a new one with the refresh cookie and repeat the call once.
 *           Only if that fails too (12-hour limit reached, signed out elsewhere) is the user signed out.
 *  - 403 => authenticated but not allowed; surfaced to the caller as an ApiError.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Internal: this call is the repeat after renewing the token. */
  retried?: boolean;
}

const TOKEN_KEY = 'ayush360.accessToken';

let unauthorizedHandler: (() => void) | null = null;

export const tokenStore = {
  get: (): string | null => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

/**
 * Why the user was sent to the sign-in page (shown there once): session expired, inactivity, ...
 * Kept per browser tab.
 */
const NOTICE_KEY = 'ayush360.signOutNotice';
export const signOutNotice = {
  set: (message: string) => {
    try {
      sessionStorage.setItem(NOTICE_KEY, message);
    } catch {
      /* storage blocked: the notice is only a nicety */
    }
  },
  take: (): string | null => {
    try {
      const message = sessionStorage.getItem(NOTICE_KEY);
      sessionStorage.removeItem(NOTICE_KEY);
      return message;
    } catch {
      return null;
    }
  },
};

// Calls that must never trigger a token renewal themselves.
const NO_RENEW_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout'];

let renewing: Promise<boolean> | null = null;

/**
 * Gets a new access token using the refresh cookie (HttpOnly, sent by the browser to /api/auth only).
 * Only one renewal runs at a time, across all open tabs too: the server replaces the cookie on every renewal and
 * treats a second use of the old one as theft (signs the user out everywhere), so two at once must never happen.
 */
export function renewSession(): Promise<boolean> {
  // The plain mock backend has no refresh cookie; its demo tokens don't expire.
  if (env.useMockApi && !env.useRealAuth) return Promise.resolve(false);
  if (!renewing) {
    const run = async (): Promise<boolean> => {
      try {
        const res = await apiRequest<{ accessToken: string }>('/auth/refresh', { method: 'POST' });
        tokenStore.set(res.accessToken);
        return true;
      } catch {
        return false;
      }
    };
    renewing = (async () => {
      try {
        return typeof navigator !== 'undefined' && navigator.locks
          ? await navigator.locks.request('ayush360-renew-session', run)
          : await run();
      } finally {
        renewing = null;
      }
    })();
  }
  return renewing;
}

/** Registered by the AuthProvider so a 401 anywhere logs the user out. */
export function onUnauthorized(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

function newCorrelationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildPath(path: string, query?: RequestOptions['query']): string {
  if (!query) return path;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.append(k, String(v));
  });
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const fullPath = buildPath(path, options.query);
  const token = tokenStore.get();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Correlation-ID': newCorrelationId(),
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let status: number;
  let payload: unknown;

  // Sign-in can use the real Identity API while everything else still runs on the mock.
  const useMock = env.useMockApi && !(env.useRealAuth && path.startsWith('/auth/'));

  if (useMock) {
    // Loaded lazily so the mock backend is not bundled when VITE_USE_MOCK_API=false.
    const { handleMockRequest } = await import('@/mock/mockServer');
    const res = await handleMockRequest({ method, path: fullPath, body: options.body, headers });
    status = res.status;
    payload = res.body;
  } else {
    let res: Response;
    try {
      res = await fetch(`${env.apiBaseUrl}${fullPath}`, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // API down, network lost, CORS, etc.: the browser only says "Failed to fetch".
      throw new ApiError(0, 'Cannot reach the server. Check your internet connection and try again.');
    }
    status = res.status;
    const text = await res.text();
    payload = text ? safeJson(text) : undefined;
  }

  if (status === 401) {
    // Access token expired (they last 30 minutes): renew quietly and repeat the call once. The server rejected the
    // first attempt before doing anything, so repeating a save is safe.
    if (token && !options.retried && !NO_RENEW_PATHS.includes(path) && (await renewSession())) {
      return apiRequest<T>(path, { ...options, retried: true });
    }
    if (token && !NO_RENEW_PATHS.includes(path)) signOutNotice.set('Your session has expired. Please sign in again.');
    unauthorizedHandler?.();
    throw new ApiError(401, 'Your session has expired. Please sign in again.');
  }
  if (status === 403) {
    throw new ApiError(403, 'You do not have permission to perform this action.', payload);
  }
  if (status < 200 || status >= 300) {
    const message =
      (payload as { message?: string; title?: string } | undefined)?.message ??
      (payload as { title?: string } | undefined)?.title ??
      'Something went wrong. Please try again.';
    throw new ApiError(status, message, payload);
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const http = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    apiRequest<T>(path, { method: 'GET', query, signal }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
};
