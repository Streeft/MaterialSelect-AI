"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { IconChevronDown } from "./icons";

const t = ptBR.ds;

/** Fired by the outline before it jumps, so a folded section opens first. */
export const OPEN_SECTION_EVENT = "msai:open-section";

/** Where reading happens: a little under the app bar (and the sections' scroll margin). */
const READING_LINE = 120;

export interface OutlineItem {
  /** The section's `id` — the anchor the link goes to. */
  id: string;
  label: string;
}

/**
 * D-214: the side index of a long page — Notion's table of contents.
 *
 * A list of links to the page's sections, with the one being read marked
 * (`aria-current="location"`), which follows the scroll. From `lg` it sits in
 * the page's side column and stays in view (`.ds-doc-grid`); narrower, it is a
 * wrapped row of links above the content, so a phone reader of a 13 000 px
 * sheet can still jump to "Curvas" without scrolling past everything.
 *
 * A link to a folded `DocSection` opens it first (`OPEN_SECTION_EVENT`): an
 * index that lands on a closed heading would be a jump to nothing.
 */
export function Outline({ items, className }: { items: readonly OutlineItem[]; className?: string }) {
  const [active, setActive] = useState<string | null>(null);
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
      // The section being read is the last one whose heading has passed the
      // reading line under the app bar. At the very end of the page the last
      // sections can never reach that line: there, the last one on screen is.
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
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);

  if (items.length === 0) return null;

  return (
    <nav aria-label={t.outline} className={cn("ds-outline", className)}>
      <p aria-hidden className="ds-outline-title text-caption font-medium text-ink-muted">
        {t.outline}
      </p>
      <ol className="ds-outline-list">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              className="ds-outline-link m3-state touch-target text-body"
              onClick={() => {
                setActive(item.id);
                window.dispatchEvent(new CustomEvent(OPEN_SECTION_EVENT, { detail: item.id }));
              }}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * D-214: a section of a document page that folds — Notion's toggle heading.
 *
 * The heading holds a button (`aria-expanded`), the WAI disclosure pattern;
 * the heading stays a heading, so the outline a screen reader walks keeps
 * every section whether it is open or not. Folded, the body is `hidden`, not
 * unmounted: what it fetched stays, and opening it does not ask again.
 *
 * The open state is the page's, for this visit: nothing is stored.
 */
export function DocSection({
  id,
  title,
  description,
  actions,
  defaultOpen = true,
  className,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  useEffect(() => {
    const openIfMine = (event: Event) => {
      if ((event as CustomEvent<string>).detail === id) setOpen(true);
    };
    const openOnHash = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    window.addEventListener(OPEN_SECTION_EVENT, openIfMine);
    window.addEventListener("hashchange", openOnHash);
    return () => {
      window.removeEventListener(OPEN_SECTION_EVENT, openIfMine);
      window.removeEventListener("hashchange", openOnHash);
    };
  }, [id]);

  return (
    <section id={id} className={cn("ds-doc-section flex min-w-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-title text-ink">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={bodyId}
              className="ds-toggle-heading m3-state touch-target"
              onClick={() => setOpen((v) => !v)}
            >
              <IconChevronDown
                aria-hidden
                className={cn("ds-toggle-chevron h-4 w-4", !open && "-rotate-90")}
              />
              <span>{title}</span>
            </button>
          </h2>
          {description && open ? (
            <p className="mt-0.5 max-w-prose text-body text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions && open ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div id={bodyId} hidden={!open} className="flex min-w-0 flex-col gap-3">
        {children}
      </div>
    </section>
  );
}
