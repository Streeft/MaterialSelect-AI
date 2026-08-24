import { test as base, expect } from "@playwright/test";

/**
 * Every route but `/entrar` sits behind `AuthGate` now (A5), and the suite
 * has no Google OAuth client to run a real login with in CI. Instead,
 * `scripts/e2e_server.py`'s seed step writes one fixed session server-side
 * (see `_seed_e2e_session` in `app/db/seed.py`), keyed by this same token —
 * this fixture just hands the browser that cookie before the first
 * `page.goto`, so every spec starts already logged in without any bypass
 * route exposed by the API itself.
 */
export const E2E_SESSION_TOKEN = "e2e-fixed-session-token-nao-use-em-producao";

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addCookies([
      {
        name: "msai_session",
        value: E2E_SESSION_TOKEN,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    await use(context);
  },
});

export { expect };
