"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { describeApiError } from "@/lib/errors";
import { ptBR } from "@/lib/i18n";
import { IconButton } from "./Button";
import { IconPencil } from "./icons";
import { useAnnounce } from "./Announcer";

const t = ptBR.editable;

/**
 * A cell that edits in place (D-238): the text, and a pencil beside it; the
 * pencil turns the cell into a field. Enter or leaving the field saves, Esc
 * gives the old text back. The server decides: while it answers the field
 * stays, and a refusal (a duplicate name, a blank one) is written under it in
 * the server's own words — the cell never shows a value the server did not keep.
 *
 * Nothing is computed here: the text goes as typed (trimmed), and what is shown
 * after is the caller's data, refetched.
 */
export function EditableText({
  value,
  label,
  itemName,
  onSave,
  multiline = false,
  maxLength,
  required = false,
  validate,
  empty,
  className,
  children,
}: {
  value: string;
  /** What the text is ("Nome", "Descrição") — part of the pencil's and the field's names. */
  label: string;
  /** Whose text it is, so "Editar nome: Metais" can be told from the next row's. */
  itemName: string;
  onSave: (next: string) => Promise<unknown>;
  multiline?: boolean;
  maxLength?: number;
  required?: boolean;
  /** A check the screen can make before asking (an empty name); the server still decides. */
  validate?: (next: string) => string | undefined;
  /** Written when there is no text (D-24: absence is said, never left blank). */
  empty?: string;
  className?: string;
  /** How the text reads when not editing (defaults to the value). */
  children?: ReactNode;
}) {
  const announce = useAnnounce();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const pencil = useRef<HTMLButtonElement>(null);
  const editing = draft !== null;

  useLayoutEffect(() => {
    if (editing) {
      field.current?.focus();
      field.current?.select();
    }
  }, [editing]);

  function close() {
    setDraft(null);
    setError(null);
    // Give focus back to the pencil, or the reader is dropped at the top of the page.
    requestAnimationFrame(() => pencil.current?.focus());
  }

  async function commit() {
    if (draft === null || saving) return;
    const next = draft.trim();
    if (next === value.trim()) {
      close();
      return;
    }
    const problem = required && !next ? t.required(label) : validate?.(next);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setSaving(false);
      announce(t.saved(label, itemName));
      close();
    } catch (err) {
      setSaving(false);
      setError(describeApiError(err, t.failed));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Enter" && (!multiline || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void commit();
    }
  }

  if (editing) {
    const fieldLabel = t.fieldLabel(label, itemName);
    const errorId = error ? `${fieldLabel}-erro`.replace(/\s+/g, "-") : undefined;
    const shared = {
      ref: field,
      value: draft,
      maxLength,
      "aria-label": fieldLabel,
      "aria-invalid": Boolean(error) || undefined,
      "aria-describedby": errorId,
      "aria-busy": saving || undefined,
      onChange: (e: { target: { value: string } }) => {
        setDraft(e.target.value);
        setError(null);
      },
      onKeyDown,
      onBlur: () => void commit(),
      className: "msds-control w-full",
    };
    return (
      <span className={cn("flex min-w-0 flex-col gap-1", className)}>
        {multiline ? <textarea rows={2} {...shared} /> : <input type="text" {...shared} />}
        {error ? (
          <span id={errorId} role="alert" className="text-caption text-danger-fg">
            {error}
          </span>
        ) : (
          <span className="text-caption text-ink-muted">{multiline ? t.hintMultiline : t.hint}</span>
        )}
      </span>
    );
  }

  return (
    <span className={cn("ds-editable flex min-w-0 items-start gap-1", className)}>
      <span className={cn("min-w-0 break-words", !value && "italic text-ink-subtle")}>
        {value ? (children ?? value) : (empty ?? t.empty)}
      </span>
      <IconButton
        ref={pencil}
        size="sm"
        label={t.edit(label, itemName)}
        icon={<IconPencil />}
        onClick={() => setDraft(value)}
        className="ds-edit-pencil"
      />
    </span>
  );
}
