"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyRecords, quickSearch, type QuickSearchHit } from "@/lib/api";
import { useCanEditCatalog } from "@/lib/billing";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { encodeIdList } from "@/lib/idList";
import { isPinned, togglePinned, usePinned, useRecents } from "@/lib/navMemory";
import { useTitleOverride } from "@/lib/pageTitle";
import { matchesQuery } from "@/lib/search";
import { openShortcutsHelp } from "@/lib/shortcuts";
import { applyPreference, readPreference, resolveTheme } from "@/lib/theme";
import { useFocusTrap } from "@/components/ui/focusTrap";
import {
  IconBook,
  IconClock,
  IconClose,
  IconCompare,
  IconFilter,
  IconGear,
  IconHome,
  IconInfo,
  IconMoon,
  IconNotebook,
  IconPin,
  IconPlus,
  IconScatter,
  IconSearch,
} from "@/components/ui/icons";
import { MY_RECORDS_KEY } from "@/components/my-records/FavoriteButton";
import { GROUPS, HOME, routeTitle, visibleGroups, type NavItem } from "./AppSidebar";

type IconComponent = NavItem["icon"];

const t = ptBR.palette;

/** Per kind, asked of the server and kept on screen. */
const PER_GROUP = 6;
/** How long typing must pause before the server is asked (D-207). */
export const SEARCH_DEBOUNCE_MS = 150;

/** Leading icon per group (M3 search: suggestions carry an icon that names their kind). */
const GROUP_ICON: Record<string, IconComponent> = {
  [t.groupPages]: IconHome,
  [t.groupMaterials]: IconBook,
  [t.groupProcesses]: IconGear,
  [t.groupNotebooks]: IconNotebook,
  [t.groupStudies]: IconFilter,
  [t.groupRecents]: IconClock,
};

const KIND_GROUP: Record<QuickSearchHit["kind"], string> = {
  material: t.groupMaterials,
  process: t.groupProcesses,
  notebook: t.groupNotebooks,
  study: t.groupStudies,
};

interface Entry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: IconComponent;
  /** Words the entry also answers to, besides its label. */
  keywords?: string;
  /** Navigate here, or… */
  href?: string;
  /** …do this. Exactly one of the two. `false` means "could not": the palette stays open. */
  run?: () => unknown;
}

function hrefFor(hit: QuickSearchHit): string {
  switch (hit.kind) {
    case "material":
      return `/app/materiais/${hit.id}`;
    case "process":
      return `/app/processos/${hit.slug ?? hit.id}`;
    case "notebook":
      return `/app/cadernos/${hit.id}`;
    case "study":
      return `/app/selecao?estudo=${hit.id}`;
  }
}

/** Typing into a field must keep "/" as a character; everywhere else it opens the search. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * The command palette (D-129, D-207) — Ctrl/Cmd+K or "/" from anywhere in the app.
 *
 * It navigates (a screen, a material, a process, a notebook, a saved study, a
 * page visited recently) and runs a few actions (new selection, the E × ρ map,
 * compare the favourites, switch theme, pin this page, see the shortcuts). It
 * computes nothing and never shows a property value, so the methodology rules
 * (no numbers outside the backend, absence never as 0) have nothing to bite on.
 *
 * Records come from `GET /api/search` (D-207): asked only after typing pauses,
 * a few per kind, already ranked by the server — "aço" lists the steels before
 * "Argamassa … Traço". The palette used to download the whole catalogue on
 * opening and match by "contains".
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
        <kbd className="msds-kbd kbd-hint">{t.shortcut}</kbd>
      </button>
      {open ? <SearchDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const canEditCatalog = useCanEditCatalog();
  const recents = useRecents();
  const pinned = usePinned();
  const currentTitle = useTitleOverride(pathname) ?? routeTitle(pathname);

  useFocusTrap(true, panelRef, onClose);
  // The trap focuses the panel (so a reader hears its name); the field is where
  // typing happens, so hand focus on right after.
  useEffect(() => inputRef.current?.focus(), []);

  const typed = query.trim();
  const debounced = useDebouncedValue(typed, SEARCH_DEBOUNCE_MS);
  const search = useQuery({
    queryKey: ["quick-search", debounced],
    queryFn: ({ signal }) => quickSearch(debounced, PER_GROUP, signal),
    enabled: debounced.length > 0,
    staleTime: 30_000,
  });
  // Results for an older query are not offered for the one on screen.
  const fresh = debounced === typed;
  const searching = typed.length > 0 && (!fresh || search.isPending);

  const actions = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      {
        id: "a:new-selection",
        group: t.groupActions,
        label: t.actionNewSelection,
        icon: IconPlus,
        keywords: ptBR.nav.selection,
        href: "/app/selecao",
      },
      {
        id: "a:map-e-rho",
        group: t.groupActions,
        label: t.actionMapEDensity,
        icon: IconScatter,
        keywords: `${ptBR.nav.maps} modulo young densidade rigidez`,
        href: "/app/mapas?x=densidade&y=modulo_young",
      },
      {
        id: "a:compare-favorites",
        group: t.groupActions,
        label: t.actionCompareFavorites,
        icon: IconCompare,
        keywords: ptBR.nav.compare,
        run: async () => {
          const records = await queryClient.fetchQuery({
            queryKey: MY_RECORDS_KEY,
            queryFn: getMyRecords,
          });
          const ids = records.favorites
            .map((bookmark) => bookmark.material?.id)
            .filter((id): id is number => typeof id === "number");
          if (ids.length === 0) {
            setNotice(t.noFavorites);
            return false;
          }
          router.push(`/app/comparar?materiais=${encodeIdList(ids)}`);
        },
      },
      {
        id: "a:theme",
        group: t.groupActions,
        label: t.actionToggleTheme,
        icon: IconMoon,
        keywords: ptBR.ui.theme.label,
        run: () => {
          const now = resolveTheme(readPreference());
          applyPreference(now === "dark" ? "light" : "dark");
        },
      },
      {
        id: "a:shortcuts",
        group: t.groupActions,
        label: t.actionShortcuts,
        icon: IconInfo,
        // After the palette has closed: two dialogs at once would fight over focus.
        run: () => {
          window.setTimeout(openShortcutsHelp, 0);
        },
      },
    ];
    if (currentTitle && pathname !== HOME.href) {
      const pinnedNow = isPinned(pinned, pathname);
      list.push({
        id: "a:pin",
        group: t.groupActions,
        label: pinnedNow ? t.actionUnpin : t.actionPin,
        hint: currentTitle,
        icon: IconPin,
        run: () => togglePinned({ href: pathname, label: currentTitle }),
      });
    }
    return list;
  }, [currentTitle, pathname, pinned, queryClient, router]);

  const pages = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      { id: "home", group: t.groupPages, label: t.goTo(HOME.label), keywords: HOME.label, href: HOME.href, icon: IconHome },
    ];
    for (const group of visibleGroups(GROUPS, canEditCatalog)) {
      for (const item of group.items) {
        list.push({
          id: `p:${item.href}`,
          group: t.groupPages,
          label: t.goTo(item.label),
          keywords: item.label,
          hint: group.label,
          href: item.href,
          icon: item.icon,
        });
      }
    }
    return list;
  }, [canEditCatalog]);

  const results = useMemo<Entry[]>(() => {
    if (!typed) {
      const recent: Entry[] = recents
        .filter((entry) => entry.href !== pathname)
        .slice(0, 5)
        .map((entry) => ({
          id: `r:${entry.href}`,
          group: t.groupRecents,
          label: entry.label,
          href: entry.href,
        }));
      return [...recent, ...actions, ...pages];
    }
    // Actions and screens match by their own words; the label "Ir para …" is
    // not what the reader is typing.
    const local = [...actions, ...pages].filter((e) =>
      matchesQuery(typed, e.keywords ?? e.label, e.label, e.hint),
    );
    const remote: Entry[] = fresh
      ? (search.data?.items ?? []).map((hit) => ({
          id: `${hit.kind}:${hit.id}`,
          group: KIND_GROUP[hit.kind],
          label: hit.name,
          hint: hit.class_name ?? undefined,
          href: hrefFor(hit),
        }))
      : [];
    // Records first when the reader typed: a name is usually what they are after.
    const order: string[] = [t.groupMaterials, t.groupProcesses, t.groupNotebooks, t.groupStudies];
    remote.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
    return [...remote, ...local];
  }, [actions, fresh, pages, pathname, recents, search.data, typed]);

  const current = Math.min(active, Math.max(results.length - 1, 0));

  async function choose(entry: Entry | undefined) {
    if (!entry) return;
    if (entry.href) {
      onClose();
      router.push(entry.href);
      return;
    }
    const outcome = await entry.run?.();
    // An action that could not go anywhere says why and keeps the palette open.
    if (outcome !== false) onClose();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + results.length) % results.length);
    } else if (event.key === "Home" || event.key === "End") {
      if (results.length === 0) return;
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : results.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      void choose(results[current]);
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-${current}`)?.scrollIntoView?.({ block: "nearest" });
  }, [current, listId]);

  const searchFailed = typed.length > 0 && fresh && search.isError;
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
            aria-busy={searching || undefined}
            autoComplete="off"
            spellCheck={false}
            className="msds-command-input"
            placeholder={t.placeholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setNotice(null);
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
        {notice ? (
          <p role="status" className="border-b border-edge-subtle px-4 py-2 text-sm text-ink-muted">
            {notice}
          </p>
        ) : null}
        <ul id={listId} role="listbox" aria-label={t.title} className="msds-command-list">
          {searching ? (
            <li role="presentation" className="px-2.5 py-2 text-caption text-ink-subtle">
              {t.loading}
            </li>
          ) : null}
          {searchFailed ? (
            <li role="presentation" className="px-2.5 py-2 text-caption text-ink-subtle">
              {t.error}
            </li>
          ) : null}
          {results.map((entry, index) => {
            const header = entry.group !== lastGroup;
            lastGroup = entry.group;
            const Icon = entry.icon ?? GROUP_ICON[entry.group];
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
                  onClick={() => void choose(entry)}
                >
                  {Icon ? <Icon aria-hidden className="h-4 w-4 shrink-0 text-ink-subtle" /> : null}
                  <span className="truncate">{entry.label}</span>
                  {entry.hint ? <span className="msds-command-cls">{entry.hint}</span> : null}
                </div>
              </li>
            );
          })}
          {results.length === 0 && !searching && !searchFailed ? (
            <li role="presentation" className="msds-command-empty">
              {t.empty}
            </li>
          ) : null}
        </ul>
        <p className="border-t border-edge-subtle px-4 py-2 text-caption text-ink-subtle">
          {t.hint}
        </p>
        <p className="sr-only" role="status" aria-live="polite">
          {searching ? t.loading : t.results(results.length)}
        </p>
      </div>
    </div>,
    document.body,
  );
}
