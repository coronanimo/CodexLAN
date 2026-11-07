import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@lan": fileURLToPath(new URL("../shared", import.meta.url)),
      "@products": fileURLToPath(new URL("../products", import.meta.url)),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: process.env.LAN_API_ORIGIN || "http://127.0.0.1:8689" } },
    fs: { allow: [".", "../shared", "../products"].map((path) => fileURLToPath(new URL(path, import.meta.url))) },
  },
  build: {
    outDir: "../dist/web-preview", emptyOutDir: false,
    rolldownOptions: { input: {
      workbench: fileURLToPath(new URL("index.html", import.meta.url)),
      fixtures: fileURLToPath(new URL("fixtures.html", import.meta.url)),
    } },
  },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
});
