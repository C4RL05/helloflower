import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 800, // three.js is inherently large
  },
  server: {
    host: true,
    open: true,
  },
});
