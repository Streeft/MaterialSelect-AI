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
  title,
  onTitleChange,
  properties,
  primaryAction,
  menu,
  className,
  children,
}: {
  /** A glyph or a badge before the title. Decorative. */
  icon?: ReactNode;
  title: string;
  /** Present: the title is editable in place. */
  onTitleChange?: (title: string) => void;
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
        <div className="flex flex-wrap items-start gap-3">
          {icon ? (
            <span aria-hidden className="ds-doc-icon">
              {icon}
            </span>
          ) : null}
          <h1 id={titleId} className="min-w-0 flex-1 basis-48 text-display text-ink">
            {onTitleChange ? (
              // Keyed by the title: one changed elsewhere (a save that
              // normalised it) remounts the field with the new draft.
              <EditableTitle key={title} value={title} onCommit={onTitleChange} />
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

function EditableTitle({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
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
      aria-label={t.titleLabel}
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
