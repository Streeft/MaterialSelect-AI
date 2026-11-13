"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMaterials } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { foldName } from "@/lib/compareClassics";
import { Textarea } from "@/components/ui";

const t = ptBR.notebooks.slash;

interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  /** What replaces the "/word" typed; `null` switches to the sheet search. */
  insert: string | null;
}

const COMMANDS: readonly SlashCommand[] = [
  { id: "titulo", label: t.heading, hint: "## ", insert: "## " },
  { id: "lista", label: t.list, hint: "- ", insert: "- " },
  { id: "numerada", label: t.numbered, hint: "1. ", insert: "1. " },
  { id: "citacao", label: t.quote, hint: "> ", insert: "> " },
  {
    id: "tabela",
    label: t.table,
    hint: "| … | … |",
    insert: `| ${t.column} | ${t.column} |\n| --- | --- |\n|  |  |\n`,
  },
  { id: "divisor", label: t.divider, hint: "---", insert: "---\n" },
  { id: "ficha", label: t.sheet, hint: t.sheetHint, insert: null },
];

const SHOWN_SHEETS = 8;

/**
 * D-235b: a note's text with Notion's "/" — typed at the start of a line or
 * after a space, it opens a short list of blocks to insert (heading, list,
 * quote, a table skeleton, a divider) and "Ficha de material", which turns
 * the list into a search of the catalogue and inserts a link to the sheet.
 *
 * Only text goes in: markdown the note already keeps, and a link whose number
 * is the material's id — never a property value. The list is a real listbox
 * tied to the field (`aria-activedescendant`), so arrows, Enter and Escape
 * work from the keyboard and a screen reader hears the option in focus.
 */
export function SlashTextarea({
  label,
  value,
  onChange,
  rows = 8,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  // Where the "/" is, and whether the list is commands or a sheet search.
  const [open, setOpen] = useState<{ at: number; mode: "commands" | "sheet" } | null>(null);
  const [active, setActive] = useState(0);
  const [caret, setCaret] = useState(0);
  // Where the caret goes once the inserted text is on screen (set in the same
  // commit, so a keystroke typed right after lands after the insertion).
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const position = pendingCaret.current;
    if (position === null || !field.current) return;
    pendingCaret.current = null;
    field.current.focus();
    field.current.setSelectionRange(position, position);
  });

  const query = open ? foldName(value.slice(open.at + 1, caret)) : "";
  const materials = useQuery({
    queryKey: ["materials", ""],
    queryFn: () => listMaterials(),
    enabled: open?.mode === "sheet",
  });

  const options: { id: string; label: string; hint?: string; pick: () => void }[] = !open
    ? []
    : open.mode === "commands"
      ? COMMANDS.filter((c) => foldName(c.label).includes(query) || c.id.includes(query)).map(
          (c) => ({
            id: c.id,
            label: c.label,
            hint: c.hint,
            pick: () => (c.insert === null ? toSheetSearch() : replaceTrigger(c.insert)),
          }),
        )
      : (materials.data ?? [])
          .filter((m) => foldName(m.name).includes(query))
          .slice(0, SHOWN_SHEETS)
          .map((m) => ({
            id: `m${m.id}`,
            label: m.name,
            hint: m.class_name,
            pick: () => replaceTrigger(`[${m.name}](/app/materiais/${m.id})`),
          }));
  const current = options[Math.min(active, Math.max(options.length - 1, 0))];

  function replaceTrigger(text: string) {
    if (!open) return;
    const next = value.slice(0, open.at) + text + value.slice(caret);
    const position = open.at + text.length;
    pendingCaret.current = position;
    onChange(next);
    setCaret(position);
    setOpen(null);
    setActive(0);
  }

  function toSheetSearch() {
    if (!open) return;
    // The "/word" becomes "/" again; what is typed now searches the catalogue.
    const next = value.slice(0, open.at + 1) + value.slice(caret);
    pendingCaret.current = open.at + 1;
    onChange(next);
    setCaret(open.at + 1);
    setOpen({ at: open.at, mode: "sheet" });
    setActive(0);
  }

  function handleChange(next: string, position: number) {
    onChange(next);
    setCaret(position);
    const typed = next.slice(position - 1, position);
    const before = position >= 2 ? next.slice(position - 2, position - 1) : "";
    if (!open && typed === "/" && (position === 1 || /\s/.test(before))) {
      setOpen({ at: position - 1, mode: "commands" });
      setActive(0);
      return;
    }
    if (open) {
      const word = next.slice(open.at, position);
      // Leaving the "/word" (deleting the slash, a space or a new line) closes the list.
      if (position <= open.at || !word.startsWith("/") || /[\n]/.test(word) || (open.mode === "commands" && /\s/.test(word))) {
        setOpen(null);
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setOpen(null);
    } else if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (event.key === "ArrowUp" && options.length > 0) {
      event.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (event.key === "Enter" && current) {
      event.preventDefault();
      current.pick();
    }
  }

  return (
    <div className="relative flex flex-col gap-1">
      <Textarea
        ref={field}
        label={label}
        hint={t.fieldHint}
        rows={rows}
        value={value}
        // A textarea keeps its textbox role (a combobox role is not allowed on
        // it); the list is still announced through the active option.
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && current ? `${listId}-${current.id}` : undefined}
        onChange={(event) => handleChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(null)}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={open.mode === "commands" ? t.menuLabel : t.sheetLabel}
          className="z-10 flex max-h-64 flex-col overflow-y-auto rounded-control border border-line bg-panel p-1 shadow-overlay"
        >
          {options.length === 0 ? (
            <li role="option" aria-selected={false} aria-disabled className="px-3 py-2 text-caption text-ink-muted">
              {open.mode === "sheet" && materials.isPending ? t.searching : t.nothing}
            </li>
          ) : (
            options.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={option === current}
                // Pointer: pick without the field losing focus first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  option.pick();
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer items-baseline justify-between gap-3 rounded-control px-3 py-2 text-body text-ink",
                  option === current && "bg-brand-50",
                )}
              >
                <span>{option.label}</span>
                {option.hint ? <span className="text-caption text-ink-muted">{option.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
