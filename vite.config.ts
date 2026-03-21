import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.BUILD_TARGET === "electron" ? "./" : "/",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-charts": ["recharts"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
  },
  // Vite has built-in web worker support via:
  //   new Worker(new URL('./workers/myWorker.ts', import.meta.url), { type: 'module' })
  // No special config needed; workers are automatically bundled.
  worker: {
    format: "es",
  },
  server: {
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
