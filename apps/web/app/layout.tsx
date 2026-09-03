import type { Metadata } from "next";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SectionTheme } from "@/components/layout/SectionTheme";
import { ptBR } from "@/lib/i18n";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: ptBR.appName,
  description: ptBR.tagline,
};

/**
 * Load fonts from next/font/google: self-hosted at build time, no third-party
 * request at runtime, CSS `@font-face` inlined. Trade-off: costs a fetch at CI
 * build time, but every reader gets zero network delay and zero layout shift.
 */
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The bootstrap script writes data-theme before React sees the document, so
    // the server markup and the client's first render disagree by design.
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Blocking on purpose: a theme applied after first paint is a white
            flash for every reader who chose the dark one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <SectionTheme />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
