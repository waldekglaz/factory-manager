import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.{js,ts}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(new URL(import.meta.url).pathname)),
    },
  },
});
