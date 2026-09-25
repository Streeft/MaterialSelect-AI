"use client";

import { ptBR } from "@/lib/i18n";
import { countLabel } from "@/lib/format";
import { studyExportUrl } from "@/lib/api";
import type { StudySummary } from "@/lib/types";
import {
  Button,
  Disclosure,
  EmptyState,
  TBody,
  Table,
  TableScroll,
  Td,
  Tr,
} from "@/components/ui";
import { ExportButtons } from "@/components/ExportButtons";
import { IconTrash } from "@/components/ui/icons";
import { EngineeringReportLink } from "@/components/EngineeringReportLink";
import { StudyExplanation } from "@/components/ai/StudyExplanation";

const t = ptBR.selection;

/**
 * "Meus estudos" (D-85): every saved study with every action it had — exports,
 * the laudo, the AI explanation, run, open, delete — collapsed behind one line
 * at the top of the wizard.
 *
 * It used to sit under every step, about ten controls per study, below the
 * very form the reader was trying to fill. Nothing was removed; it moved out of
 * the way and says how many studies it holds, so it is still found.
 */
export function SavedStudiesPanel({
  studies,
  onRun,
  onLoad,
  onDelete,
}: {
  studies: StudySummary[] | undefined;
  onRun: (id: number) => void;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const count = studies?.length ?? 0;
  return (
    <Disclosure summary={t.myStudies(count)}>
      {count === 0 ? (
        <EmptyState title={t.noStudies} />
      ) : (
        <TableScroll label={t.savedStudies}>
          <Table>
            <TBody>
              {(studies ?? []).map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <span className="font-medium text-ink">{s.name}</span>
                    <div className="mt-1">
                      <ExportButtons
                        urlFor={(format) => studyExportUrl(s.id, format)}
                        label={ptBR.exports.study}
                      />
                    </div>
                    <div className="mt-2">
                      <EngineeringReportLink studyId={s.id} />
                    </div>
                    <StudyExplanation studyId={s.id} />
                  </Td>
                  <Td className="align-top text-2xs text-ink-subtle">
                    {countLabel(s.constraint_count, ptBR.home.constraintOne, ptBR.home.constraintMany)}{" "}
                    · {countLabel(s.criterion_count, ptBR.home.criterionOne, ptBR.home.criterionMany)}
                  </Td>
                  <Td className="align-top">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" onClick={() => onRun(s.id)}>
                        {t.runSaved}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => onLoad(s.id)}>
                        {t.load}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-quiet"
                        icon={<IconTrash className="h-4 w-4" />}
                        onClick={() => {
                          if (window.confirm(t.deleteConfirm)) onDelete(s.id);
                        }}
                      >
                        {t.delete}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      )}
    </Disclosure>
  );
}
