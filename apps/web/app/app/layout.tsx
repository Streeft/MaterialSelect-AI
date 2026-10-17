import { AuthGate } from "@/components/auth/AuthGate";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { GlobalSearchButton } from "@/components/layout/GlobalSearch";
import { RouteTransition } from "@/components/layout/RouteTransition";
import { AnnouncerProvider } from "@/components/ui/Announcer";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { ptBR } from "@/lib/i18n";

/**
 * The authenticated app shell: everything that used to live directly under
 * the root layout's <body>, now scoped to /app so `/` (the public vitrine,
 * Task 6) never sees AuthGate or the sidebar. AuthGate has to be
 * here, not at the root: it is what gates access, and leaving it at the root
 * would keep the vitrine behind login.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <SnackbarProvider>
      <AnnouncerProvider>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-fg"
        >
          {ptBR.ui.skipToContent}
        </a>
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* D-129: M3's "search app bar" — global search is the one function that
              is always reachable, so it sits above the content on every screen. */}
          <div className="sticky top-0 z-20 border-b border-line-divider bg-page/90 px-4 py-2 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
            <div className="mx-auto w-full max-w-screen-2xl">
              <GlobalSearchButton />
            </div>
          </div>
          {/* D-80: 1536 px, not 1152. A data screen at 1920 left a third of the
              window blank beside a map squeezed to 1100 px; prose keeps its
              own measure through `max-w-prose` where it appears. */}
          <main
            id="conteudo"
            tabIndex={-1}
            className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6 lg:px-8"
          >
            <RouteTransition>{children}</RouteTransition>
          </main>
        </div>
      </div>
      <BottomNav />
      </AnnouncerProvider>
      </SnackbarProvider>
    </AuthGate>
  );
}
