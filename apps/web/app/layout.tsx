import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { ptBR } from "@/lib/i18n";

export const metadata: Metadata = {
  title: ptBR.appName,
  description: ptBR.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
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
                </nav>
              </div>
            </header>
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
            <footer className="border-t border-slate-200 bg-white">
              <div className="mx-auto max-w-6xl px-4 py-3 text-xs text-amber-700">
                ⚠️ {ptBR.demoWarning}
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
