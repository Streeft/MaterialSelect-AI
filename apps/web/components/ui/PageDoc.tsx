"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { MenuButton } from "./Menu";

const t = ptBR.ds;

/**
 * D-206: a page that reads as a document — Notion's page head in M3 terms.
 *
 * An icon, the title, a line of properties under it (usually a
 * `PropertyList`), the page's one visible action, and everything else in a
 * "⋯" menu. That last part is the point: a sheet with six buttons in its header
 * had five that competed with the one that mattered (D-91: one `primary`).
 *
 * The title can be edited in place (`onTitleChange`): it is then a real
 * `<input>` styled as the heading, named "Título", committed on blur or Enter
 * and restored on Escape. The `<h1>` stays the page's heading either way, so
 * the outline a screen reader walks does not change shape when editing is on.
 *
 * Breadcrumb or eyebrow is the caller's: `PageHeader` for a section page, a
 * `Breadcrumb` above this for a detail page (D-205).
 */
export function PageDoc({
  icon,
  eyebrow,
  title,
  onTitleChange,
  titleLabel,
  titlePlaceholder,
  headingLabel,
  properties,
  primaryAction,
  menu,
  className,
  children,
}: {
  /** A glyph or a badge before the title. Decorative. */
  icon?: ReactNode;
  /** D-220: the section line above the title, for a page that is a section and a document at once. */
  eyebrow?: ReactNode;
  title: string;
  /** Present: the title is editable in place. */
  onTitleChange?: (title: string) => void;
  /** D-220: the editable title's name, when "Título" is not what it is ("Nome do estudo"). */
  titleLabel?: string;
  /**
   * D-220: shown while the title is empty ("Estudo sem título"). With it the
   * title is a live field — every keystroke reaches `onTitleChange`, and empty
   * is a real state (a study with no name yet), not a typo to restore.
   */
  titlePlaceholder?: string;
  /**
   * D-220: the heading's name when the title is a field that may be empty —
   * the section the document is ("Seleção de materiais"). The field keeps its
   * own name; the outline never shows a heading with no words.
   */
  headingLabel?: string;
  /** The line under the title: a `PropertyList`, badges, a description. */
  properties?: ReactNode;
  /** The page's one visible action. */
  primaryAction?: ReactNode;
  /** `MenuItem`s for "⋯". */
  menu?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <article aria-labelledby={titleId} className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-col gap-3">
        {eyebrow ? (
          <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">{eyebrow}</span>
        ) : null}
        <div className="flex flex-wrap items-start gap-3">
          {icon ? (
            <span aria-hidden className="ds-doc-icon">
              {icon}
            </span>
          ) : null}
          <h1 id={titleId} aria-label={headingLabel} className="min-w-0 flex-1 basis-48 text-display text-ink">
            {onTitleChange ? (
              // Keyed by the title: one changed elsewhere (a save that
              // normalised it) remounts the field with the new draft.
              titlePlaceholder !== undefined ? (
                // D-220: a title that may be empty is the record's own field
                // (a study's name), so it follows each keystroke like any field
                // of the form — the draft and the save read it as it is typed.
                <textarea
                  aria-label={titleLabel ?? t.titleLabel}
                  placeholder={titlePlaceholder}
                  rows={1}
                  value={title}
                  onChange={(event) => onTitleChange(event.target.value.replace(/\n/g, " "))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      (event.target as HTMLTextAreaElement).blur();
                    }
                  }}
                  className="ds-doc-title-input"
                />
              ) : (
                <EditableTitle
                  key={title}
                  value={title}
                  onCommit={onTitleChange}
                  label={titleLabel}
                />
              )
            ) : (
              title
            )}
          </h1>
          {primaryAction || menu ? (
            <div className="flex shrink-0 items-center gap-2">
              {primaryAction}
              {menu ? (
                <MenuButton label={t.moreActions} iconOnly icon={<span aria-hidden>⋯</span>}>
                  {menu}
                </MenuButton>
              ) : null}
            </div>
          ) : null}
        </div>
        {properties ? <div className="min-w-0">{properties}</div> : null}
      </header>
      {children}
    </article>
  );
}

function EditableTitle({
  value,
  onCommit,
  label,
}: {
  value: string;
  onCommit: (value: string) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState(value);

  function commit() {
    const next = draft.trim();
    if (!next) {
      setDraft(value);
      return;
    }
    if (next !== value) onCommit(next);
  }

  // A textarea, not an input: a long title wraps like the heading it stands
  // for, where an input would cut it on a phone (the widths suite caught that).
  // Enter still commits; the title never takes a line break.
  return (
    <textarea
      aria-label={label ?? t.titleLabel}
      rows={1}
      value={draft}
      onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          (event.target as HTMLTextAreaElement).blur();
        } else if (event.key === "Escape") {
          setDraft(value);
        }
      }}
      className="ds-doc-title-input"
    />
  );
}
