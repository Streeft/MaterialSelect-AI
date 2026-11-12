"use client";

import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { Button } from "./Button";

const t = ptBR.ds;

/**
 * D-215: a list's pages — "anterior", where the reader is, "próxima".
 *
 * Numbers in pt-BR, and the range in words ("51–100 de 678") so a reader
 * knows how much is left without counting pages. Nothing is computed beyond
 * that arithmetic: what is on each page is the server's answer. Hidden when
 * everything fits on one page.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  rangeLabel,
  className,
}: {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  /** "51–100 de 678", written by the screen in its own nouns. */
  rangeLabel: (from: number, to: number, total: number) => string;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const current = Math.min(Math.max(1, page), pages);
  const from = (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  return (
    <nav
      aria-label={t.pagination}
      className={cn("flex min-w-0 flex-wrap items-center justify-between gap-2", className)}
    >
      <span className="min-w-0 break-words text-caption tabular-nums text-ink-muted">
        {rangeLabel(from, to, total)}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={current <= 1}
          onClick={() => onPage(current - 1)}
        >
          {t.previousPage}
        </Button>
        <span aria-current="page" className="text-caption tabular-nums text-ink">
          {t.pageOf(current, pages)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={current >= pages}
          onClick={() => onPage(current + 1)}
        >
          {t.nextPage}
        </Button>
      </span>
    </nav>
  );
}
