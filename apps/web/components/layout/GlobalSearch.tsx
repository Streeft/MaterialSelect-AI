"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { listMaterials, listNotebooks, listProcesses, listStudies } from "@/lib/api";
import { useCanEditCatalog } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { matchesQuery } from "@/lib/search";
import { useFocusTrap } from "@/components/ui/focusTrap";
import {
  IconBook,
  IconClose,
  IconFilter,
  IconGear,
  IconHome,
  IconNotebook,
  IconSearch,
} from "@/components/ui/icons";
import { GROUPS, visibleGroups, type NavItem } from "./AppSidebar";

type IconComponent = NavItem["icon"];

const t = ptBR.palette;

/** Per group, so one long list (the catalogue) cannot push the others off screen. */
const PER_GROUP = 6;

/** Leading icon per group (M3 search: suggestions carry an icon that names their kind). */
const GROUP_ICON = {
  [t.groupPages]: IconHome,
  [t.groupMaterials]: IconBook,
  [t.groupProcesses]: IconGear,
  [t.groupNotebooks]: IconNotebook,
  [t.groupStudies]: IconFilter,
} as const;

interface Entry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  href: string;
  /** A screen carries its own glyph from the rail; the other kinds use their group's. */
  icon?: IconComponent;
}

/** Typing into a field must keep "/" as a character; everywhere else it opens the search. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * The global search (D-129) — Ctrl/Cmd+K or "/" from anywhere in the app.
 *
 * It only *navigates*: a screen, a material, a process, a notebook or a saved
 * study. It computes nothing and never shows a property value, so the
 * methodology rules (no numbers outside the backend, absence never as 0) have
 * nothing to bite on here.
 *
 * The lists are fetched when the dialog first opens, through the same query
 * keys the screens use, so a reader who already visited the catalogue pays
 * nothing. Matching ignores case and accents (`lib/search.ts`).
 *
 * ARIA 1.2 combobox: focus stays in the input and `aria-activedescendant`
 * names the highlighted option, so a screen reader hears each result as the
 * arrows move without focus leaving the field.
 */
export function GlobalSearchButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      } else if (event.key === "/" && !mod && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K /"
        className={cn(
          "msds-btn msds-btn-secondary msds-btn-md w-full max-w-xl justify-start gap-2 !rounded-full text-ink-muted",
          className,
        )}
      >
        <IconSearch aria-hidden className="h-4 w-4 shrink-0" />
        <span className="msds-btn-label flex-1 text-left">{t.open}</span>
        <kbd className="msds-kbd">{t.shortcut}</kbd>
      </button>
      {open ? <SearchDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const canEditCatalog = useCanEditCatalog();

  useFocusTrap(true, panelRef, onClose);
  // The trap focuses the panel (so a reader hears its name); the field is where
  // typing happens, so hand focus on right after.
  useEffect(() => inputRef.current?.focus(), []);

  const materials = useQuery({ queryKey: ["materials", ""], queryFn: () => listMaterials() });
  const processes = useQuery({ queryKey: ["processes"], queryFn: listProcesses });
  const notebooks = useQuery({ queryKey: ["notebooks"], queryFn: listNotebooks });
  const studies = useQuery({ queryKey: ["studies"], queryFn: listStudies });
  const loading = [materials, processes, notebooks, studies].some((q) => q.isLoading);

  const entries = useMemo<Entry[]>(() => {
    const pages: Entry[] = [
      { id: "home", group: t.groupPages, label: ptBR.nav.home, href: "/app", icon: IconHome },
    ];
    for (const group of visibleGroups(GROUPS, canEditCatalog)) {
      for (const item of group.items) {
        pages.push({
          id: `p:${item.href}`,
          group: t.groupPages,
          label: item.label,
          hint: group.label,
          href: item.href,
          icon: item.icon,
        });
      }
    }
    return [
      ...pages,
      ...(materials.data ?? []).map((m) => ({
        id: `m:${m.id}`,
        group: t.groupMaterials,
        label: m.name,
        hint: m.class_name,
        href: `/app/materiais/${m.id}`,
      })),
      ...(processes.data ?? []).map((p) => ({
        id: `r:${p.slug}`,
        group: t.groupProcesses,
        label: p.name,
        href: `/app/processos/${p.slug}`,
      })),
      ...(notebooks.data ?? []).map((n) => ({
        id: `n:${n.id}`,
        group: t.groupNotebooks,
        label: n.title,
        href: `/app/cadernos/${n.id}`,
      })),
      ...(studies.data ?? []).map((s) => ({
        id: `s:${s.id}`,
        group: t.groupStudies,
        label: s.name,
        href: `/app/selecao?estudo=${s.id}`,
      })),
    ];
  }, [canEditCatalog, materials.data, processes.data, notebooks.data, studies.data]);

  const results = useMemo(() => {
    const kept = entries.filter((e) => matchesQuery(query, e.label, e.hint));
    // With no query show only the screens: a list of every material is not a
    // suggestion, it is the catalogue.
    const pool = query.trim() ? kept : kept.filter((e) => e.group === t.groupPages);
    const taken = new Map<string, number>();
    return pool.filter((e) => {
      const n = taken.get(e.group) ?? 0;
      taken.set(e.group, n + 1);
      return query.trim() ? n < PER_GROUP : true;
    });
  }, [entries, query]);

  const current = Math.min(active, Math.max(results.length - 1, 0));

  function go(entry: Entry | undefined) {
    if (!entry) return;
    onClose();
    router.push(entry.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[current]);
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView?.({ block: "nearest" });
  }, [current, listId]);

  let lastGroup = "";
  // A portal: the bar this is opened from has `backdrop-filter`, which makes it the
  // containing block of every `position: fixed` descendant — the dialog would be laid
  // out inside a 56 px strip, with the scrim covering only that.
  return createPortal(
    <div
      className="msds-dialog-backdrop max-sm:p-0"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        tabIndex={-1}
        className="msds-command max-sm:h-full max-sm:max-w-none max-sm:rounded-none sm:self-start sm:mt-[10vh]"
        onKeyDown={onKeyDown}
      >
        <div className="msds-command-input-row">
          <IconSearch aria-hidden className="h-5 w-5 shrink-0" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={results.length ? `${listId}-${current}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            className="msds-command-input"
            placeholder={t.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
          />
          {query ? (
            <button
              type="button"
              aria-label={t.clear}
              className="chart-icon-btn"
              onClick={() => {
                setQuery("");
                setActive(0);
                inputRef.current?.focus();
              }}
            >
              <IconClose aria-hidden className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <ul id={listId} role="listbox" aria-label={t.title} className="msds-command-list">
          {results.map((entry, index) => {
            const header = entry.group !== lastGroup;
            lastGroup = entry.group;
            return (
              <li key={entry.id} role="presentation">
                {header ? (
                  <p className="px-2.5 pb-1 pt-2 text-caption font-medium text-ink-subtle">
                    {entry.group}
                  </p>
                ) : null}
                <div
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === current}
                  className={cn("msds-command-item", index === current && "bg-brand-50")}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(entry)}
                >
                  {(() => {
                    const Icon = entry.icon ?? GROUP_ICON[entry.group as keyof typeof GROUP_ICON];
                    return Icon ? <Icon aria-hidden className="h-4 w-4 shrink-0 text-ink-subtle" /> : null;
                  })()}
                  <span className="truncate">{entry.label}</span>
                  {entry.hint ? <span className="msds-command-cls">{entry.hint}</span> : null}
                </div>
              </li>
            );
          })}
          {results.length === 0 ? (
            <li role="presentation" className="msds-command-empty">
              {loading && query.trim() ? t.loading : t.empty}
            </li>
          ) : null}
        </ul>
        <p className="border-t border-edge-subtle px-4 py-2 text-caption text-ink-subtle">
          {t.hint}
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {t.results(results.length)}
        </p>
      </div>
    </div>,
    document.body,
  );
}
