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
      // Real backends (used when VITE_USE_MOCK_API=false, and for sign-in when VITE_USE_REAL_AUTH=true):
      //   /api/auth/*  -> Identity API (login, refresh, logout, me)
      //   /api/*       -> HMS API (Front Desk and other modules)
      // '/api/auth' must stay first so it wins over '/api'.
      proxy: {
        '/api/auth': {
          target: env.VITE_IDENTITY_API_TARGET || 'http://localhost:5077',
          changeOrigin: true,
          secure: false,
        },
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:5041',
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
