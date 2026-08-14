import path from "node:path";
import os from "node:os";
import { defineConfig, devices } from "@playwright/test";
import { E2E_SESSION_TOKEN } from "./e2e/session";

/**
 * End-to-end suite (Fase 7 / A4): the flows a component test cannot reach —
 * importar → selecionar → visualizar → exportar as one continuous session in
 * a real browser, against a real backend and a real (throwaway) database.
 *
 * This spins up its own API and web server rather than reusing a developer's
 * `npm run dev` / `uvicorn --reload`, on different ports and a different
 * `.next` build directory (`distDir` in `next.config.mjs`), so running the
 * suite never touches — and cannot corrupt — whatever is already running.
 */

const API_PORT = 8811;
const WEB_PORT = 3011;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

const apiDir = path.resolve(__dirname, "../api");
// Local dev runs this against the project's own `.venv` (Windows layout); CI
// has no venv — `setup-python` puts the right interpreter on PATH directly —
// so the workflow overrides this with `E2E_API_PYTHON=python`.
const apiPython =
  process.env.E2E_API_PYTHON ?? path.join(apiDir, ".venv", "Scripts", "python.exe");
const e2eRoot = path.join(os.tmpdir(), "materialselect-e2e");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One shared backend and one shared (rebuilt-per-run) database: tests run
  // in sequence within a file, and the suite has one spec file today. Worker
  // parallelism across files would mean two workers racing to reset the same
  // sqlite file — not worth building for a suite this size yet.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  // The golden path walks four routes end to end against `next dev`, which
  // compiles each one on first visit — a heavy route like `/mapas` (the full
  // Plotly bundle) alone can take several seconds. The default 30s budget is
  // tuned for compiled apps, not this; a shared CI runner is slower still.
  timeout: 120_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `"${apiPython}" scripts/e2e_server.py`,
      cwd: apiDir,
      url: `${API_URL}/api/health`,
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: `sqlite:///${path.join(e2eRoot, "e2e.db")}`,
        UPLOAD_DIR: path.join(e2eRoot, "uploads"),
        CORS_ORIGINS: WEB_URL,
        AI_PROVIDER: "mock",
        E2E_API_PORT: String(API_PORT),
        // Login is Google-only (A5) and CI has no OAuth client to run a real
        // flow with — the seed step writes a fixed session under this token
        // instead (see `app/db/seed.py`), and `e2e/session.ts` injects it as
        // the `msai_session` cookie before each spec's first navigation.
        ENVIRONMENT: "development",
        E2E_SESSION_TOKEN,
      },
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      cwd: __dirname,
      url: WEB_URL,
      timeout: 90_000,
      reuseExistingServer: false,
      env: {
        PLAYWRIGHT_E2E: "1",
        NEXT_PUBLIC_API_URL: API_URL,
      },
    },
  ],
});
