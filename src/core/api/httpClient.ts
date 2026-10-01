import { env } from '@/core/config/env';

/**
 * Single HTTP entry point for every module.
 *
 * Security notes (see architecture doc §6, §9, §10):
 *  - The client NEVER sends a tenantId. The backend derives the tenant from the
 *    authenticated user (CurrentUser -> CurrentTenant).
 *  - Every request carries a correlation id so logs/traces can be stitched together.
 *  - 401 => session is invalid, the app signs the user out.
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
}

const TOKEN_KEY = 'ayush360.accessToken';

let unauthorizedHandler: (() => void) | null = null;

export const tokenStore = {
  get: (): string | null => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

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

  if (env.useMockApi) {
    // Loaded lazily so the mock backend is not bundled when VITE_USE_MOCK_API=false.
    const { handleMockRequest } = await import('@/mock/mockServer');
    const res = await handleMockRequest({ method, path: fullPath, body: options.body, headers });
    status = res.status;
    payload = res.body;
  } else {
    const res = await fetch(`${env.apiBaseUrl}${fullPath}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
    status = res.status;
    const text = await res.text();
    payload = text ? safeJson(text) : undefined;
  }

  if (status === 401) {
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
