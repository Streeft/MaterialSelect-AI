"use client";

import { useState, type ReactNode } from "react";
import { Block, Button, useReorder } from "@/components/ui";
import { dashboardText as d } from "@/lib/i18n-dashboard";
import { useSavedViews } from "@/lib/savedViews";
import type { SavedViewScope } from "@/lib/types";

export interface OverviewBlock {
  id: string;
  name: string;
  node: ReactNode;
}

/**
 * D-209: the dashboard's overview as movable blocks — Notion's page of blocks
 * on M3 cards. The reader reorders (drag or Alt + ↑/↓) and hides blocks; the
 * order and the hidden set are one `layout` row of their saved views, so the
 * dashboard comes back the same on another device.
 *
 * Only the arrangement is stored. What each block shows is the server's, read
 * with the page's filters as before.
 */
export function OverviewBlocks({ blocks }: { blocks: readonly OverviewBlock[] }) {
  return (
    <LayoutBlocks
      scope="painel"
      blocks={blocks}
      label={d.blocks.label}
      hint={d.blocks.hint}
      resetLabel={d.blocks.reset}
    />
  );
}

/**
 * D-232b (F6): the same movable blocks for any screen whose arrangement is kept
 * in the account — the dashboard (D-209) and the Início. A block whose content
 * renders nothing (a "Retomar" with nothing to resume) keeps its place and says
 * so in one line (`emptyLabel`, written by the CSS on the empty body): hiding
 * it would make Alt+↓ move a block past something the reader cannot see.
 */
export function LayoutBlocks({
  scope,
  blocks,
  label,
  hint,
  resetLabel,
  emptyLabel,
}: {
  scope: SavedViewScope;
  blocks: readonly OverviewBlock[];
  label: string;
  hint: string;
  resetLabel: string;
  /** What a block whose content renders nothing says, in one line. */
  emptyLabel?: (name: string) => string;
}) {
  const saved = useSavedViews(scope);
  const defaults = blocks.map((block) => block.id);
  const stored = saved.layout?.config;
  // A local copy answers at once; the account catches up behind it.
  const [local, setLocal] = useState<{ order: string[]; hidden: string[] } | null>(null);
  const order = normalise(local?.order ?? stored?.blocks ?? defaults, defaults);
  const hidden = local?.hidden ?? stored?.hidden ?? [];

  function persist(next: { order: string[]; hidden: string[] }) {
    setLocal(next);
    const config = { blocks: next.order, hidden: next.hidden };
    if (saved.layout) {
      saved.update.mutate({ id: saved.layout.id, patch: { config } });
    } else {
      saved.create.mutate({ name: "Layout", kind: "layout", config });
    }
  }

  const byId = new Map(blocks.map((block) => [block.id, block]));
  const ordered = order.map((id) => byId.get(id)).filter((b): b is OverviewBlock => Boolean(b));
  const { handleProps, itemProps } = useReorder({
    items: ordered,
    onReorder: (next) => persist({ order: next.map((b) => b.id), hidden }),
    nameOf: (block) => block.name,
  });
  const customised =
    hidden.length > 0 || order.some((id, index) => id !== defaults[index]);

  return (
    <section aria-label={label} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-ink-muted">{hint}</p>
        {customised ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => persist({ order: defaults, hidden: [] })}
          >
            {resetLabel}
          </Button>
        ) : null}
      </div>
      {ordered.map((block, index) => {
        const isHidden = hidden.includes(block.id);
        return (
          <Block
            key={block.id}
            name={block.name}
            handle={handleProps(index)}
            item={itemProps(index)}
            hidden={isHidden}
            onToggleHidden={() =>
              persist({
                order,
                hidden: isHidden ? hidden.filter((id) => id !== block.id) : [...hidden, block.id],
              })
            }
          >
            {isHidden ? (
              <span className="text-body text-ink-muted">{block.name}</span>
            ) : (
              <div
                className="ds-block-body flex flex-col gap-4"
                data-empty={emptyLabel ? emptyLabel(block.name) : undefined}
              >
                {block.node}
              </div>
            )}
          </Block>
        );
      })}
    </section>
  );
}

/** The stored order, minus blocks that no longer exist, plus new ones at the end. */
function normalise(order: readonly string[], defaults: readonly string[]): string[] {
  const known = order.filter((id) => defaults.includes(id));
  return [...known, ...defaults.filter((id) => !known.includes(id))];
}
