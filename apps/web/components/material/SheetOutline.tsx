"use client";

import { fichaText } from "@/lib/i18n-ficha";

const t = fichaText.layout;

export interface OutlineItem {
  id: string;
  label: string;
}

/**
 * The sheet's table of contents (D-214). Every entry is a real anchor to a
 * section that already carries its id, so it works as a plain link with no
 * script; `onNavigate` only opens the section it points to when it is folded.
 *
 * Wide: a sticky column beside the sections. Narrow: a wrapping row above them.
 * Which of the two is decided by the width of the sheet's own box (container
 * query, `.sheet-layout`), not by the window: the sidebar takes its share of
 * the window from `lg`, so the window width says little about the room left.
 */
export function SheetOutline({
  items,
  onNavigate,
}: {
  items: OutlineItem[];
  onNavigate: (id: string) => void;
}) {
  return (
    <nav aria-label={t.outlineLabel} className="sheet-outline min-w-0">
      <p className="sheet-outline-title text-caption font-semibold uppercase tracking-wide text-ink-subtle">
        {t.outlineTitle}
      </p>
      <ol className="sheet-outline-list">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <a
              href={`#${item.id}`}
              onClick={() => onNavigate(item.id)}
              className="block break-words rounded-control px-2 py-1 text-support text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
