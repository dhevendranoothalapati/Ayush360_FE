/** Typed access to Vite environment variables. */
export const env = {
  useMockApi: (import.meta.env.VITE_USE_MOCK_API ?? 'true') !== 'false',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  appName: 'Ayush360',
};
