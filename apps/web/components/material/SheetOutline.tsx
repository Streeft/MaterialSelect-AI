"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fichaText } from "@/lib/i18n-ficha";

const t = fichaText.layout;

/** Where reading happens: a little under the app bar and the sections' scroll margin. */
const READING_LINE = 120;
/** How long a clicked entry keeps the mark while the jump and the opening settle. */
const PIN_MS = 1500;

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
 *
 * D-215: the entry being read is marked (`aria-current="location"`) and follows
 * the scroll — the last section whose heading has passed the reading line, or,
 * at the very end of the page, where the last sections can never reach that
 * line, the last one on screen. One measure per frame while scrolling.
 */
export function SheetOutline({
  items,
  onNavigate,
  label = t.outlineLabel,
  title = t.outlineTitle,
}: {
  items: OutlineItem[];
  onNavigate: (id: string) => void;
  /** The landmark's name; another page than the material sheet names its own. */
  label?: string;
  title?: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  // A jump the reader asked for wins over the measure while the page settles:
  // a short section near the end can never reach the reading line, and the
  // entry just clicked would otherwise hand the mark back to the one above.
  const pinnedUntil = useRef(0);
  const ids = items.map((item) => item.id).join(" ");

  useEffect(() => {
    const targets = ids
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (performance.now() < pinnedUntil.current) return;
      const atEnd =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const line = atEnd ? window.innerHeight - 1 : READING_LINE;
      let current: HTMLElement | undefined;
      for (const el of targets) {
        if (el.getBoundingClientRect().top <= line) current = el;
      }
      setActive(current?.id ?? null);
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);

  return (
    <nav aria-label={label} className="sheet-outline min-w-0">
      <p className="sheet-outline-title text-caption font-semibold uppercase tracking-wide text-ink-subtle">
        {title}
      </p>
      <ol className="sheet-outline-list">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              onClick={() => {
                pinnedUntil.current = performance.now() + PIN_MS;
                setActive(item.id);
                onNavigate(item.id);
              }}
              className={cn(
                "block break-words rounded-control px-2 py-1 text-support text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                active === item.id && "font-semibold text-brand-700",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
