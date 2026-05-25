import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendOrigin = env.VITE_DEV_BACKEND_ORIGIN || env.BACKEND_ORIGIN || 'http://localhost:5001';
  const proxyHeaders = env.BACKEND_PROXY_SECRET
    ? { 'x-nexcon-proxy-secret': env.BACKEND_PROXY_SECRET }
    : undefined;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "firebase/messaging": path.resolve(__dirname, "./src/lib/firebaseMessagingWebShim.ts"),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
          secure: true,
          headers: proxyHeaders,
        },
      },
    },
  };
})
