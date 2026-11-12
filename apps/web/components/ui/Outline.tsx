"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { IconChevronDown } from "./icons";

const t = ptBR.ds;

/** Fired by the outline before it jumps, so a folded section opens first. */
export const OPEN_SECTION_EVENT = "msai:open-section";

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
    if (typeof IntersectionObserver === "undefined") return;
    const targets = ids
      .split(" ")
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // The first section, in page order, that is in the reading band.
        const first = targets.find((el) => visible.has(el.id));
        if (first) setActive(first.id);
      },
      // The reading band: the top third of the window, under the app bar.
      { rootMargin: "-64px 0px -66% 0px" },
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
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
