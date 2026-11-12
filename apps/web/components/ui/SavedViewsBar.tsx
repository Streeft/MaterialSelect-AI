"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import type { SavedView, SavedViewKind } from "@/lib/types";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Input } from "./Field";
import { MenuButton, MenuItem } from "./Menu";
import { IconPlus } from "./icons";

const t = ptBR.ds;

export type ListViewKind = Exclude<SavedViewKind, "layout">;

export const VIEW_KIND_LABEL: Record<ListViewKind, string> = {
  table: t.kindTable,
  gallery: t.kindGallery,
  list: t.kindList,
};

/**
 * D-209: the tabs of a database screen — Notion's and Airtable's view bar in
 * M3's tab look. "Todos" is the screen with nothing saved; each other tab is a
 * view in the reader's account, with its kind (Tabela, Galeria, Lista) and its
 * filters. Choosing a tab only *reports* the choice; the screen applies the
 * filters and asks the server, as before.
 *
 * Buttons with `aria-pressed`, not an ARIA tablist: the content below is the
 * same list re-read, not a separate panel per tab, and a tablist promises a
 * panel the screen does not have.
 */
export function SavedViewsBar({
  views,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  dirty = false,
  onSaveChanges,
  kinds = ["table", "gallery", "list"],
  className,
}: {
  views: readonly SavedView[];
  /** `null` is "Todos". */
  activeId: number | null;
  onSelect: (view: SavedView | null) => void;
  onCreate: (kind: ListViewKind) => void;
  onRename: (view: SavedView, name: string) => void;
  onDelete: (view: SavedView) => void;
  /** The screen's filters no longer match the active view's. */
  dirty?: boolean;
  onSaveChanges?: () => void;
  kinds?: readonly ListViewKind[];
  className?: string;
}) {
  const [renaming, setRenaming] = useState<SavedView | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-2", className)}>
      <div role="group" aria-label={t.views} className="ds-views">
        <button
          type="button"
          aria-pressed={activeId === null}
          className="ds-view-tab m3-state"
          onClick={() => onSelect(null)}
        >
          {t.allView}
        </button>
        {views.map((view) => (
          <span key={view.id} className="ds-view-item">
            <button
              type="button"
              aria-pressed={activeId === view.id}
              className="ds-view-tab m3-state"
              onClick={() => onSelect(view)}
            >
              <span className="truncate">{view.name}</span>
              <span className="sr-only"> ({VIEW_KIND_LABEL[view.kind as ListViewKind] ?? view.kind})</span>
            </button>
            {activeId === view.id ? (
              <MenuButton label={t.viewActions(view.name)} iconOnly icon={<span aria-hidden>⋯</span>}>
                <MenuItem
                  onSelect={() => {
                    setDraft(view.name);
                    setRenaming(view);
                  }}
                >
                  {t.renameView}
                </MenuItem>
                <MenuItem onSelect={() => onDelete(view)}>{t.deleteView}</MenuItem>
              </MenuButton>
            ) : null}
          </span>
        ))}
        <MenuButton label={t.newViewMenu} icon={<IconPlus className="h-4 w-4" aria-hidden />}>
          {kinds.map((kind) => (
            <MenuItem key={kind} onSelect={() => onCreate(kind)}>
              {VIEW_KIND_LABEL[kind]}
            </MenuItem>
          ))}
        </MenuButton>
      </div>

      {dirty && onSaveChanges && activeId !== null ? (
        <span className="flex items-center gap-2">
          <span className="text-caption text-ink-muted">{t.viewChanged}</span>
          <Button size="sm" variant="tonal" onClick={onSaveChanges}>
            {t.saveChanges}
          </Button>
        </span>
      ) : null}

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t.renameTitle}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setRenaming(null)}>
              {t.cancel}
            </Button>
            <Button
              size="sm"
              variant="tonal"
              disabled={!draft.trim()}
              onClick={() => {
                if (renaming && draft.trim()) onRename(renaming, draft.trim());
                setRenaming(null);
              }}
            >
              {t.save}
            </Button>
          </>
        }
      >
        <Input
          label={t.nameLabel}
          value={draft}
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
        />
      </Dialog>
    </div>
  );
}
