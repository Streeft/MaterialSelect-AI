import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Playwright owns e2e/**/*.spec.ts (npm run test:e2e); Vitest's default
    // include pattern matches *.spec.ts too and collides with Playwright's
    // own test() global if it collects them here.
    exclude: ["**/node_modules/**", "e2e/**"],
    server: {
      deps: {
        inline: ["@material/material-color-utilities"],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
