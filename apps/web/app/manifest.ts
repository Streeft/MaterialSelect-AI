import type { MetadataRoute } from "next";
import { ptBR } from "@/lib/i18n";

/**
 * The web app manifest (D-142): what lets a phone or a desktop browser install
 * MaterialSelect AI as an app. `start_url` is the tool itself, not the public
 * landing page, because someone who installs it wants to resume work.
 *
 * `theme_color` is the brand blue (the home section's `--accent`); the toolbar
 * colour that follows the reader's theme is set separately by `viewport` in the
 * root layout. The maskable icon keeps its mark inside the 80% safe zone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: ptBR.appName,
    short_name: "MaterialSelect",
    description: ptBR.tagline,
    lang: "pt-BR",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#F1EDE5",
    theme_color: "#4567A8",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
