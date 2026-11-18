import { defineConfig, loadEnv, type Plugin } from "vite";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const demoBankFile = "question-bank.jsonl";
const bankPath = path.resolve(__dirname, "../backend/data/probability_questions.jsonl");

const staticQuestionBank: Plugin = {
  name: "static-demo-question-bank",
  apply: (_, { mode }) => loadEnv(mode, __dirname, "VITE_").VITE_STATIC_PREVIEW === "true",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: demoBankFile, source: readFileSync(bankPath) });
  },
  configureServer(server) {
    server.middlewares.use(`${server.config.base}${demoBankFile}`, (_req, res) => {
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.end(readFileSync(bankPath));
    });
  },
};

export default defineConfig({
  plugins: [tailwindcss(), react(), staticQuestionBank],
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
