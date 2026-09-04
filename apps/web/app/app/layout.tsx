import { AuthGate } from "@/components/auth/AuthGate";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { LimitationNotice } from "@/components/LimitationNotice";
import { ptBR } from "@/lib/i18n";

/**
 * The authenticated app shell: everything that used to live directly under
 * the root layout's <body>, now scoped to /app so `/` (the public vitrine,
 * Task 6) never sees AuthGate or the sidebar. AuthGate itself has to be
 * here, not just AppSidebar/LimitationNotice — the patch's own README only
 * mentions moving the latter two, but AuthGate is what actually gates
 * access; leaving it at the root would keep the vitrine behind login.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-fg"
        >
          {ptBR.ui.skipToContent}
        </a>
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
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
      </div>
      <BottomNav />
    </AuthGate>
  );
}
