"use client";

import { ptBR } from "@/lib/i18n";
import { countLabel } from "@/lib/format";
import { studyExportUrl, studyFileUrl } from "@/lib/api";
import { flowText } from "@/lib/i18n-flow";
import type { StudySummary } from "@/lib/types";
import {
  Badge,
  Button,
  EmptyState,
  MenuItem,
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
import { SidePeek } from "@/components/ui/SidePeek";
import { useState } from "react";
import { ImportStudyButton } from "./ImportStudyButton";

const t = ptBR.selection;

/**
 * "Meus estudos" (D-85): every saved study with every action it had — exports,
 * the laudo, the AI explanation, run, open, delete.
 *
 * It used to sit under every step, about ten controls per study, below the
 * very form the reader was trying to fill; D-85 folded it into a line at the
 * top. D-220 takes it off the document altogether: one quiet button in the
 * study's head, saying how many there are, opens the list beside the page
 * (`SidePeek`), so the study being written keeps the whole width. Nothing was
 * removed; the Início lists the same studies on the way in.
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="tonal" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t.myStudies(count)}
      </Button>
      <SidePeek open={open} title={t.savedStudies} onClose={() => setOpen(false)}>
      <div className="mb-3">
        <ImportStudyButton />
      </div>
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
                    {s.has_notes && (
                      <Badge tone="neutral" className="ml-2">
                        {flowText.notes.hasNotes}
                      </Badge>
                    )}
                    <div className="mt-1">
                      <ExportButtons
                        urlFor={(format) => studyExportUrl(s.id, format)}
                        label={ptBR.exports.study}
                        extraItems={
                          <MenuItem
                            href={studyFileUrl(s.id)}
                            download
                            hint={flowText.file.exportHint}
                          >
                            {flowText.file.exportItem}
                          </MenuItem>
                        }
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
                      <Button
                        size="sm"
                        onClick={() => {
                          setOpen(false);
                          onRun(s.id);
                        }}
                      >
                        {t.runSaved}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setOpen(false);
                          onLoad(s.id);
                        }}
                      >
                        {t.load}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger-quiet"
                        icon={<IconTrash className="h-4 w-4" />}
                        // D-201: the page's onDelete is an undoable delete (D-130),
                        // so no confirmation: "Desfazer" is the safety net.
                        onClick={() => onDelete(s.id)}
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
      </SidePeek>
    </>
  );
}
