import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "harness"),
  publicDir: path.resolve(import.meta.dirname, "../shared/fixtures"),
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "../shared"),
    },
  },
  server: {
    port: 4177,
    strictPort: true,
  },
});
