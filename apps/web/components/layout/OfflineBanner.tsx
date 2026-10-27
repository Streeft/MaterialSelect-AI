"use client";

import { ptBR } from "@/lib/i18n";
import { useOnline } from "@/lib/useOnline";

/**
 * The strip under the search bar while the browser is offline (D-168). It says
 * what stops working and where the readable part lives; it does not hide the
 * screen, because the screen may still hold what was loaded before the
 * connection dropped. `/offline.html` is a plain anchor, not a `Link`: it is a
 * static file outside the app's router (D-152).
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  const t = ptBR.offline;
  return (
    <div
      role="status"
      className="border-b border-line-divider bg-warning-soft px-4 py-2 text-support text-warning-fg sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex w-full max-w-screen-2xl flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{t.banner}</span>
        <span>{t.detail}</span>
        <a href="/offline.html" className="font-medium underline underline-offset-2">
          {t.savedSheets}
        </a>
      </div>
    </div>
  );
}
