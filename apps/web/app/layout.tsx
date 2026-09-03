import type { Metadata } from "next";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AuthGate } from "@/components/auth/AuthGate";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { LimitationNotice } from "@/components/LimitationNotice";
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
        <Providers>
          <AuthGate>
            {/* A column below `lg` (slim bar, then content) and a row above it
                (rail beside content). The rail is the first child either way, so
                the DOM order and the reading order agree in both. */}
            <div className="flex min-h-screen flex-col lg:flex-row">
              {/* First stop of the tab order on every page: eight navigation
                  links are eight keystrokes between the reader and the content. */}
              <a
                href="#conteudo"
                className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-fg"
              >
                {ptBR.ui.skipToContent}
              </a>
              <AppSidebar />
              {/* `min-w-0` is load-bearing: without it a wide table inside a flex
                  child refuses to shrink and pushes the whole page sideways. */}
              <div className="flex min-w-0 flex-1 flex-col">
                <main
                  id="conteudo"
                  tabIndex={-1}
                  className="mx-auto w-full max-w-6xl flex-1 px-4 py-6"
                >
                  {children}
                </main>
                <footer className="border-t border-edge bg-surface-raised">
                  <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
                    <p className="text-xs text-warning-fg">⚠️ {ptBR.demoWarning}</p>
                    <LimitationNotice variant="footer" />
                  </div>
                </footer>
              </div>
            </div>
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
