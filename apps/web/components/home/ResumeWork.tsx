"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listNotebooks } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { useRecents } from "@/lib/navMemory";
import { draftKey, parseDraft } from "@/lib/selectionDraft";
import { useMemo, useSyncExternalStore } from "react";
import { Section } from "@/components/ui";

const t = ptBR.home;

function subscribeStorage(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * "Continue de onde parou" (D-222): the last selection, the last map and the
 * latest notebook, from what already exists — the Selection's local draft
 * (D-139), the pages the menu remembers (D-207) and the notebooks list. No
 * endpoint of its own. A card that has nothing behind it is not drawn, and with
 * none the whole block is gone: "Retomar um estudo" and "Vistos recentemente"
 * already speak for the empty case.
 */
export function ResumeWork() {
  const me = useCurrentUser();
  const recents = useRecents();
  const notebooks = useQuery({ queryKey: ["notebooks", false], queryFn: () => listNotebooks(false) });

  // The draft lives in this browser's storage, which the server render cannot see.
  const userId = me.data?.id;
  const rawDraft = useSyncExternalStore(
    subscribeStorage,
    () => (userId === undefined ? null : readStored(draftKey(userId))),
    () => null,
  );
  const draft = useMemo(() => parseDraft(rawDraft), [rawDraft]);

  const map = recents.find((e) => e.href === "/app/mapas" || e.href.startsWith("/app/mapas/"));
  const notebook = [...(notebooks.data ?? [])].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const draftWhen = draft ? formatDate(draft.savedAt) : null;
  const draftName = draft?.data.name.trim() || draft?.data.functionText.trim() || t.resumeDraftFallback;

  if (!draft && !map && !notebook) return null;

  return (
    <Section title={t.resumeTitle} description={t.resumeHint}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {draft && (
          <li>
            <Link
              href="/app/selecao"
              data-interactive="true"
              className="msds-card flex h-full min-w-0 flex-col gap-1 p-4"
            >
              <span className="text-caption font-semibold text-brand-700">{t.resumeDraft}</span>
              <span className="break-words text-body font-medium text-ink">{draftName}</span>
              {draftWhen && <span className="text-support text-ink-muted">{t.resumeDraftSaved(draftWhen)}</span>}
              <span className="text-caption text-accent">{t.resumeDraftOpen}</span>
            </Link>
          </li>
        )}
        {map && (
          <li>
            <Link
              href={map.href}
              data-interactive="true"
              className="msds-card flex h-full min-w-0 flex-col gap-1 p-4"
            >
              <span className="text-caption font-semibold text-brand-700">{t.resumeMap}</span>
              <span className="break-words text-body font-medium text-ink">{map.label}</span>
              <span className="text-support text-ink-muted">{t.resumeMapHint}</span>
              <span className="text-caption text-accent">{t.resumeMapOpen}</span>
            </Link>
          </li>
        )}
        {notebook && (
          <li>
            <Link
              href={`/app/cadernos/${notebook.id}`}
              data-interactive="true"
              className="msds-card flex h-full min-w-0 flex-col gap-1 p-4"
            >
              <span className="text-caption font-semibold text-brand-700">{t.resumeNotebook}</span>
              <span className="break-words text-body font-medium text-ink">
                {notebook.emoji} {notebook.title}
              </span>
              <span className="text-support text-ink-muted">{t.resumeNotebookSources(notebook.source_count)}</span>
              <span className="text-caption text-accent">{t.resumeNotebookOpen}</span>
            </Link>
          </li>
        )}
      </ul>
    </Section>
  );
}
