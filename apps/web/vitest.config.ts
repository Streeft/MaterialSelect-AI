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
    // Vitest resolves node_modules through Vite's SSR pipeline, which favours
    // the "node" export condition. lit-html ships a separate `node/` build
    // behind that condition with `isServer` hardcoded true — which silently
    // disables @material/web's aria-delegation mixin (it early-returns on
    // isServer) and produces a "Fechar" aria-label that axe then flags as
    // prohibited on the host's implicit role. The "browser" condition picks
    // the same build Next.js ships to the client, matching what was already
    // verified live in the preview browser.
    conditions: ["browser"],
  },
});
