import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { LimitationNotice } from "@/components/LimitationNotice";
import { ptBR } from "@/lib/i18n";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: ptBR.appName,
  description: ptBR.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The bootstrap script writes data-theme before React sees the document, so
    // the server markup and the client's first render disagree by design.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* Blocking on purpose: a theme applied after first paint is a white
            flash for every reader who chose the dark one. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <header className="border-b border-slate-200 bg-white">
              <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
                <Link href="/" className="font-semibold text-brand-700">
                  {ptBR.appName}
                </Link>
                <nav className="flex gap-4 text-sm">
                  <Link href="/" className="text-slate-600 hover:text-brand-600">
                    {ptBR.nav.home}
                  </Link>
                  <Link href="/catalogo" className="text-slate-600 hover:text-brand-600">
                    {ptBR.nav.catalog}
                  </Link>
                  <Link href="/selecao" className="text-slate-600 hover:text-brand-600">
                    {ptBR.nav.selection}
                  </Link>
                  <Link href="/mapas" className="text-slate-600 hover:text-brand-600">
                    {ptBR.nav.maps}
                  </Link>
                  <Link href="/comparar" className="text-slate-600 hover:text-brand-600">
                    {ptBR.nav.compare}
                  </Link>
                  <Link href="/importar" className="text-slate-600 hover:text-brand-600">
                    {ptBR.nav.imports}
                  </Link>
                  <Link href="/admin/classes" className="text-slate-600 hover:text-brand-600">
                    {ptBR.nav.classes}
                  </Link>
                  <Link href="/admin/propriedades" className="text-slate-600 hover:text-brand-600">
                    {ptBR.nav.properties}
                  </Link>
                </nav>
              </div>
            </header>
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
            <footer className="border-t border-slate-200 bg-white">
              <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
                <p className="text-xs text-amber-700">⚠️ {ptBR.demoWarning}</p>
                <LimitationNotice variant="footer" />
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
