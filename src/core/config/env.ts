/** Typed access to Vite environment variables. */
export const env = {
  useMockApi: (import.meta.env.VITE_USE_MOCK_API ?? 'true') !== 'false',
  /**
   * true = sign in through the real Identity API (/api/auth/*) even while the rest of the app still uses the mock.
   * The mock then accepts the real access token (it reads the hospital, user and permissions from it).
   */
  useRealAuth: (import.meta.env.VITE_USE_REAL_AUTH ?? 'false') === 'true',
  /** Sign out after this many minutes without mouse/keyboard activity (shared hospital PCs). 0 = never. */
  idleTimeoutMinutes: Math.max(0, Number(import.meta.env.VITE_IDLE_TIMEOUT_MINUTES ?? 15) || 0),
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  appName: 'Ayush360',
};
