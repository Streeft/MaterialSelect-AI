import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppHeader } from "@/components/layout/AppHeader";
import { LimitationNotice } from "@/components/LimitationNotice";
import { ptBR } from "@/lib/i18n";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: ptBR.appName,
  description: ptBR.tagline,
};

/**
 * Inter, self-hosted by Next at build time and exposed as a CSS variable that
 * tailwind.config.ts reads.
 *
 * `next/font` is what makes the webfont affordable: the file is served from this
 * origin (no request to a third party at runtime, no extra DNS on a slow link)
 * and the `@font-face` is inlined in the head, so there is no layout shift to
 * swap into. What it does cost is a fetch at *build* time — the CI now needs the
 * network for `next build`, not only for `npm ci`.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The bootstrap script writes data-theme before React sees the document, so
    // the server markup and the client's first render disagree by design.
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Blocking on purpose: a theme applied after first paint is a white
            flash for every reader who chose the dark one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <div className="flex min-h-screen flex-col">
            {/* First stop of the tab order on every page: eight navigation
                links are eight keystrokes between the reader and the content. */}
            <a
              href="#conteudo"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-fg"
            >
              {ptBR.ui.skipToContent}
            </a>
            <AppHeader />
            <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
              {children}
            </main>
            <footer className="border-t border-edge bg-surface-raised">
              <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
                <p className="text-xs text-warning-fg">⚠️ {ptBR.demoWarning}</p>
                <LimitationNotice variant="footer" />
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
