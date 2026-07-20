import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    strictPort: true,
    proxy: {
      // Direct connection to the Python/FastAPI AG-UI backend (no Node runtime).
      // Same-origin from the browser's view; strip the /agui prefix on the way.
      "/agui": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/agui/, ""),
      },
    },
  },
});
