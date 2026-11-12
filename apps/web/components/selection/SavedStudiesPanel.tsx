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
 * top. D-221 takes it off the document altogether: one quiet button in the
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
        // D-221: a list of cards, not a table — the panel is 28rem wide, and a
        // three-column row squeezed the counts into one word per line.
        <ul aria-label={t.savedStudies} className="flex flex-col gap-3">
          {(studies ?? []).map((s) => (
            <li key={s.id} className="well flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 break-words font-medium text-ink">{s.name}</span>
                {s.has_notes && <Badge tone="neutral">{flowText.notes.hasNotes}</Badge>}
              </div>
              <p className="text-caption text-ink-muted">
                {countLabel(s.constraint_count, ptBR.home.constraintOne, ptBR.home.constraintMany)} ·{" "}
                {countLabel(s.criterion_count, ptBR.home.criterionOne, ptBR.home.criterionMany)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
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
                <ExportButtons
                  urlFor={(format) => studyExportUrl(s.id, format)}
                  label={ptBR.exports.study}
                  extraItems={
                    <MenuItem href={studyFileUrl(s.id)} download hint={flowText.file.exportHint}>
                      {flowText.file.exportItem}
                    </MenuItem>
                  }
                />
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
              <EngineeringReportLink studyId={s.id} />
              <StudyExplanation studyId={s.id} />
            </li>
          ))}
        </ul>
      )}
      </SidePeek>
    </>
  );
}
