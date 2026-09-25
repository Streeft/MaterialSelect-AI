"use client";

import type { NotebookAnswer, NotebookCitation } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { Alert, CitationChip, RichText } from "@/components/ui";

const t = ptBR.notebooks;

/** Where in its source a passage sits: section and pages, when known. */
export function citationLocator(citation: NotebookCitation): string | null {
  const parts: string[] = [];
  if (citation.heading) parts.push(citation.heading);
  if (citation.page_start !== null) parts.push(t.pages(citation.page_start, citation.page_end));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * An answer as the backend checked it: paragraphs, each ending in the chips of
 * the passages it rests on. Nothing here decides what is grounded — the
 * numbers were checked on the server, and a paragraph that failed is not in
 * `paragraphs` at all. What this does is say so: `withheld` becomes a written
 * notice, never a silent gap.
 */
export function AnswerView({
  answer,
  liveSourceIds,
}: {
  answer: NotebookAnswer;
  /** Sources still in the notebook; a citation to any other says it is gone. */
  liveSourceIds: ReadonlySet<number>;
}) {
  const byNumber = new Map(answer.citations.map((c) => [c.number, c]));
  return (
    <div className="flex flex-col gap-3">
      {answer.not_found && answer.paragraphs.length === 0 ? (
        <p className="text-ink-muted">{t.notFound}</p>
      ) : null}
      {answer.paragraphs.map((paragraph, index) => (
        <RichText
          key={index}
          text={paragraph.text}
          trailing={paragraph.citations.map((number) => {
            const citation = byNumber.get(number);
            if (!citation) return null;
            const gone = !liveSourceIds.has(citation.source_id);
            return (
              <CitationChip
                key={number}
                number={number}
                label={t.citation(number, citation.source_title)}
                title={citation.source_title}
                locator={gone ? t.citationGone : citationLocator(citation)}
              >
                {citation.excerpt}
              </CitationChip>
            );
          })}
        />
      ))}
      {answer.withheld.length > 0 ? (
        <Alert tone="warning" title={t.withheldTitle}>
          {answer.withheld.join(" ")}
        </Alert>
      ) : null}
    </div>
  );
}
