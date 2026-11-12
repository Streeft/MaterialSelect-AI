"use client";

import { fichaText } from "@/lib/i18n-ficha";
import { Card, CardBody } from "@/components/ui";

const t = fichaText.layout;

const LINK =
  "text-body font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/**
 * What hangs off this material, said at the top (D-214): how many processes are
 * registered for it and where the "parecidos" search is, each with a link to its
 * section. They used to sit below the whole property table, so a reader who came
 * for "what can I make this with?" had to scroll a screen and a half to learn
 * there was an answer. The number is the catalogue's own count of linked
 * processes; zero is written as "nenhum cadastrado", which is not "cannot be
 * made" (D-24).
 */
export function SheetQuickLinks({
  processCount,
  onNavigate,
}: {
  processCount: number;
  onNavigate: (id: string) => void;
}) {
  return (
    <section aria-label={t.quickLabel}>
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-body text-ink">
              {processCount > 0 ? t.processesSummary(processCount) : t.processesNone}
            </span>
            <a href="#processos" onClick={() => onNavigate("processos")} className={LINK}>
              {t.goToProcesses}
            </a>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-body text-ink">{t.similarSummary}</span>
            <a href="#semelhantes" onClick={() => onNavigate("semelhantes")} className={LINK}>
              {t.goToSimilar}
            </a>
          </div>
        </CardBody>
      </Card>
    </section>
  );
}
