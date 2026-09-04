import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Next 16 blocks cross-origin requests to `/_next/*` dev resources by
  // default, and it counts `127.0.0.1` as a different origin from `localhost`.
  // The Playwright suite serves and browses on `127.0.0.1:3011`
  // (playwright.config.ts), so without this the dev client runtime and HMR are
  // refused, the page never hydrates, and every spec dies staring at the
  // server-rendered "Verificando sessão…" — with *no* failed request to point
  // at, because the blocked resource is what would have issued the requests.
  // Development only; it has no effect on `next build`/`next start`.
  allowedDevOrigins: ["127.0.0.1"],

  // `@materialselect/shared-types` (packages/shared-types) ships its TypeScript
  // source directly, not a pre-built dist — Next needs to run it through its own
  // compiler like any first-party file (D-16/M4: this is what replaced the
  // manual mirror in apps/web/lib/types.ts).
  transpilePackages: ["@materialselect/shared-types"],

  // The Playwright suite builds and serves its own instance of this app
  // (`e2e/playwright.config.ts`) so it can run alongside `npm run dev` without
  // the corruption a build and a dev server sharing one `.next` already caused
  // once. `PLAYWRIGHT_E2E` is set only by that config, never by a developer.
  distDir: process.env.PLAYWRIGHT_E2E ? ".next-e2e" : ".next",

  // `react-plotly.js` hard-codes `require("plotly.js/dist/plotly")` — the
  // complete Plotly build, 4.5 MB of it, for the five trace types these figures
  // use. The alias points that request at `lib/plotly-custom.ts`, which
  // registers exactly those five. Doing it here rather than forking
  // `react-plotly.js` keeps the dependency stock and upgradable.
  //
  // **Client bundle only.** Every figure is loaded through `next/dynamic` with
  // `ssr: false`, so the server never needs Plotly at all; aliasing it there too
  // rewrites a module inside the server graph for no gain and breaks the dev
  // server's runtime with "Cannot read properties of undefined (reading
  // 'call')" — a failure that does not reproduce in `next build`, so it only
  // shows up when someone opens the application.
  // Turbopack became the default bundler in Next 16, which refuses to build
  // when it finds a `webpack` key and no `turbopack` one — loudly, which is the
  // right call: silently ignoring the alias below would have shipped the 4.5 MB
  // Plotly build. `npm run dev` and `npm run build` therefore pass `--webpack`
  // explicitly, and this block is the safety net for anyone who drops that flag.
  //
  // Both bundlers do apply the alias. They differ in how they split chunks, and
  // the number this project defends is the largest chunk (PROJECT_CONTEXT.md
  // §12), measured on Next 16 with everything else held constant:
  //
  //   webpack    largest chunk 980 KB · total JS 2856 KB
  //   turbopack  largest chunk 1136 KB (+16%) · total JS 2556 KB (−10%)
  //
  // Staying on webpack keeps that headline measurement valid, and keeps the
  // client-only aliasing below, which Turbopack's `resolveAlias` cannot express
  // — see the note in the `webpack` key about the dev-server failure that does
  // not reproduce in `next build`. Moving to Turbopack is a real option, but it
  // is a bundler migration with its own measurement, not a line in a security
  // patch.
  turbopack: {
    resolveAlias: {
      "plotly.js/dist/plotly": "./lib/plotly-custom.ts",
    },
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        "plotly.js/dist/plotly": path.resolve(here, "lib/plotly-custom.ts"),
      };
    }
    return config;
  },
};

export default nextConfig;
