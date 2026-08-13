import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

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
