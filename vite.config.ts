import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // `npm run dev:share` listens on all network addresses so colleagues on the same
      // network / VPN (e.g. Tailscale 100.x.x.x) can open the app. Any host name is allowed
      // so temporary tunnels work too. For testing only — not a production setting.
      allowedHosts: true,
      // When VITE_USE_MOCK_API=false, /api calls are forwarded to the ASP.NET Core backend.
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'https://localhost:5001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      port: 4173,
      allowedHosts: true,
    },
  };
});
