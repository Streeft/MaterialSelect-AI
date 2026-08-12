"use client";

import { useState } from "react";
import { ptBR } from "@/lib/i18n";
import { studyLaudoUrl } from "@/lib/api";
import { ButtonLink, Field, Input } from "@/components/ui";

const t = ptBR.exports;

/**
 * Link to the engineering report (laudo) for one saved study.
 *
 * The responsible-engineer name is declared, free text — never validated,
 * never computed — so it travels as a query parameter the link rebuilds on
 * every keystroke rather than as form state the API has to accept a POST for.
 * Like the printable selection report, this always opens inline: the tab it
 * opens is what the user prints to PDF.
 */
export function EngineeringReportLink({ studyId }: { studyId: number }) {
  const [responsible, setResponsible] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={t.laudoResponsibleLabel} className="w-56">
        <Input
          value={responsible}
          onChange={(e) => setResponsible(e.target.value)}
          placeholder={t.laudoResponsiblePlaceholder}
          maxLength={160}
        />
      </Field>
      <ButtonLink
        href={studyLaudoUrl(studyId, responsible)}
        size="sm"
        target="_blank"
        rel="noopener noreferrer"
        title={t.htmlTitle}
      >
        {t.laudoButton}
      </ButtonLink>
    </div>
  );
}
