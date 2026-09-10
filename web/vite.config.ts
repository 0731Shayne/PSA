import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "../backend/static",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/@ant-design/icons") || id.includes("/node_modules/@ant-design/icons-svg")) return "icons-vendor";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react-vendor";
          if (/node_modules\/(react-router|react-router-dom)\//.test(id)) return "router-vendor";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8101",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
