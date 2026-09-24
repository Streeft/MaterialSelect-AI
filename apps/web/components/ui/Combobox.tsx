"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { matchesQuery } from "@/lib/search";
import { IconChevronDown } from "./icons";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Extra words that should find this option (a symbol, a slug, a class). */
  keywords?: string[];
  /** A second, quieter line — the class of a material, the unit of a property. */
  description?: string;
  disabled?: boolean;
}

const GAP = 4;
const MARGIN = 8;
const MAX_HEIGHT = 280;

/**
 * A text field that filters a list as you type (D-85) — the ARIA 1.2 editable
 * combobox with list autocomplete.
 *
 * Why not a `<select>`: with a few dozen properties a select is a scroll hunt,
 * and the research this redesign rests on is blunt that students search rather
 * than browse. Why not `<datalist>`: it matches the typed text against the
 * label with the browser's own rules (no accent folding, so "modulo" never
 * finds "Módulo"), it gives back a label rather than the slug the payload needs,
 * and it looks and behaves differently in every browser.
 *
 * The list is portaled for the same reason the Popover is: the cards this sits
 * in clip their overflow, and a list cut off at the card's edge is a list the
 * reader cannot finish reading.
 *
 * `clearOnSelect` turns it into an "add" field (Comparar): choosing reports the
 * value and empties the text, ready for the next one.
 */
export function Combobox({
  label,
  hint,
  error,
  options,
  value,
  onChange,
  placeholder,
  noMatchText,
  clearOnSelect = false,
  id,
  required,
  disabled,
  className,
  "aria-label": ariaLabel,
}: {
  label?: string;
  hint?: string;
  error?: string;
  options: ComboboxOption[];
  /** The chosen option's value; "" for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  noMatchText?: (query: string) => string;
  clearOnSelect?: boolean;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const listId = `${inputId}-list`;
  const hintId = hint || error ? `${inputId}-hint` : undefined;

  const selected = options.find((o) => o.value === value) ?? null;
  // The typed search, only meaningful while the reader is typing; otherwise the
  // field shows the chosen option's label, derived from `value` so a parent
  // that changes it (a loaded study, an example) is reflected at once.
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const shown = editing ? query : clearOnSelect ? "" : (selected?.label ?? "");

  const filtered = useMemo(() => {
    // Opening an untouched field shows everything: the text there is the
    // current choice, not a search.
    const q = editing ? query : "";
    return options.filter((o) => matchesQuery(q, o.label, o.description, ...(o.keywords ?? [])));
  }, [options, query, editing]);

  const place = useCallback(() => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      top: rect.bottom + GAP,
      left: Math.max(MARGIN, rect.left),
      width: Math.max(rect.width, 200),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => place();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (inputRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, place]);

  function close() {
    setOpen(false);
    setEditing(false);
    setQuery("");
  }

  function choose(option: ComboboxOption) {
    if (option.disabled) return;
    onChange(option.value);
    setOpen(false);
    setEditing(false);
    setQuery("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) setOpen(true);
        setActive((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActive(Math.max(filtered.length - 1, 0));
        }
        break;
      case "Enter": {
        const option = filtered[active];
        if (open && option) {
          event.preventDefault();
          choose(option);
        }
        break;
      }
      case "Escape":
        if (open) {
          event.preventDefault();
          close();
        }
        break;
      case "Tab":
        if (open) close();
        break;
    }
  }

  const activeOption = open ? filtered[active] : undefined;
  const optionId = (index: number) => `${listId}-${index}`;

  const list =
    open && position && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label ?? ariaLabel}
            style={{ top: position.top, left: position.left, width: position.width, maxHeight: MAX_HEIGHT }}
            className="msds-command-list fixed z-50 overflow-y-auto rounded-card border border-edge bg-surface-raised shadow-overlay"
          >
            {filtered.length === 0 ? (
              <li role="presentation" className="msds-command-empty">
                {(noMatchText ?? ptBR.ui.comboboxNoMatch)(query)}
              </li>
            ) : (
              filtered.map((option, index) => (
                <li
                  key={option.value}
                  id={optionId(index)}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  // `mousedown` + preventDefault keeps focus in the field, so the
                  // blur that would close the list never races the click.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "msds-command-item flex-col items-start gap-0.5",
                    index === active && "bg-brand-50",
                    option.disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span className="text-sm">{option.label}</span>
                  {option.description ? (
                    <span className="text-2xs text-ink-subtle">{option.description}</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div className={cn("msds-field", className)}>
      {label ? (
        <label htmlFor={inputId} className="msds-field-label">
          {label}
          {required ? (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <div className="msds-select-wrap">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={activeOption ? optionId(active) : undefined}
          aria-describedby={hintId}
          aria-invalid={Boolean(error) || undefined}
          aria-label={label ? undefined : ariaLabel}
          required={required}
          disabled={disabled}
          placeholder={placeholder ?? ptBR.ui.comboboxPlaceholder}
          value={shown}
          onChange={(event) => {
            setQuery(event.target.value);
            setEditing(true);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => {
            setOpen(true);
            setActive(Math.max(0, filtered.findIndex((o) => o.value === value)));
          }}
          onClick={() => setOpen(true)}
          onBlur={() => {
            // A click on an option is handled on mousedown (focus stays), so a
            // real blur means the reader left: restore the chosen label.
            if (open) close();
          }}
          onKeyDown={onKeyDown}
          className="msds-control msds-select"
        />
        <span className="msds-select-chevron" aria-hidden="true">
          <IconChevronDown />
        </span>
      </div>
      {error ? (
        <p id={hintId} role="alert" className="msds-field-hint msds-field-hint-error">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="msds-field-hint">
          {hint}
        </p>
      ) : null}
      {list}
    </div>
  );
}
