"use client";

import { forwardRef } from "react";
import type { ReleaseDiffItem, ReleaseFieldChange, ReleaseRecordSide, ReleaseValueSide } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  describeChange,
  fieldText,
  originalText,
  readingText,
  recordName,
  sideHasNumber,
  sideText,
} from "@/lib/releaseDiff";
import {
  Alert,
  Badge,
  EmptyState,
  MissingValue,
  RowHeader,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
  type BadgeTone,
} from "@/components/ui";

const t = ptBR.releases;

/** The nature of a change, in a tone — and always in words, never colour alone. */
const KIND_TONE: Record<string, BadgeTone> = {
  texto: "neutral",
  ausencia: "info",
  forma: "info",
  valor: "warning",
  escrita_da_fonte: "neutral",
  metadado: "neutral",
};

/**
 * "Só a escrita da fonte" is the quiet kind: the physical value did not change,
 * only the way the source wrote it. It gets its own tag, a dashed outline and a
 * muted row, so it is never read as a change of value — and never hidden either.
 */
export function ChangeKindTag({ kind, label }: { kind: string; label?: string }) {
  const writing = kind === "escrita_da_fonte";
  return (
    <Badge
      tone={KIND_TONE[kind] ?? "neutral"}
      title={t.kindHints[kind]}
      className={writing ? "border border-dashed border-line" : undefined}
    >
      {t.kindTags[kind] ?? label ?? kind}
    </Badge>
  );
}

function SideCell({ side }: { side: ReleaseValueSide | null }) {
  const asRead = readingText(side?.reading ?? null);
  const asWritten = originalText(side?.original ?? null);
  if (!sideHasNumber(side)) {
    // No number: the state is written out. A source-declared absence also
    // carries the quality badge, so it reads the same as everywhere else (D-24).
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {side?.state === "ausente" ? <MissingValue /> : null}
        <span className="italic text-ink-muted">{sideText(side)}</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{asRead}</span>
      {asWritten !== null && asWritten !== asRead ? (
        <span className="text-caption text-ink-subtle">{t.asWritten(asWritten)}</span>
      ) : null}
    </span>
  );
}

function TextCell({ text }: { text: string | null }) {
  return text === null || text === "" ? (
    <span className="italic text-ink-muted">{t.notInformed}</span>
  ) : (
    <span>{fieldText(text)}</span>
  );
}

function ChangeRow({ change }: { change: ReleaseFieldChange }) {
  const writing = change.kind === "escrita_da_fonte";
  return (
    <Tr className={writing ? "bg-well/60 text-ink-muted" : undefined} data-change-kind={change.kind}>
      <RowHeader>
        <span>{change.label}</span>
        {change.reading_unit_label ? (
          <span className="block text-caption font-normal text-ink-subtle">
            {change.reading_unit_label}
          </span>
        ) : null}
      </RowHeader>
      <Td>
        <div className="flex flex-col items-start gap-1">
          <ChangeKindTag kind={change.kind} label={change.kind_label} />
          {writing ? <span className="text-caption">{t.sourceWritingHint}</span> : null}
          <span className="max-w-prose text-support text-ink-muted">{describeChange(change)}</span>
        </div>
      </Td>
      <Td>
        {change.kind === "texto" ? <TextCell text={change.before_text} /> : <SideCell side={change.before} />}
      </Td>
      <Td>
        {change.kind === "texto" ? <TextCell text={change.after_text} /> : <SideCell side={change.after} />}
      </Td>
    </Tr>
  );
}

function RecordSide({ title, side }: { title: string; side: ReleaseRecordSide | null }) {
  return (
    <div className="well flex min-w-0 flex-col gap-0.5">
      <p className="text-caption font-semibold text-ink-subtle">{title}</p>
      {side === null ? (
        <p className="italic text-ink-muted">{t.notInRelease}</p>
      ) : (
        <>
          <p className="font-medium text-ink">{side.name}</p>
          <p className="text-support text-ink-muted">
            {side.class_name}
            {side.subclass ? ` · ${side.subclass}` : ""}
          </p>
          <p className="text-caption text-ink-subtle">
            {side.external_gruid ? t.detailGruid(side.external_gruid) : `GRUID: ${t.notInformed}`}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * One record of the comparison (D-108): where it exists, and every field that
 * differs — field, before, after, with the nature of the change. A property
 * that went from declared-absent to a number, or back, is written in words;
 * a change that is only how the source wrote the same value is marked as such.
 * The numbers arrive converted; nothing here compares or converts.
 */
export const ReleaseRecordDetail = forwardRef<HTMLHeadingElement, { item: ReleaseDiffItem }>(
  function ReleaseRecordDetail({ item }, headingRef) {
    const name = recordName(item);
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h3
            ref={headingRef}
            tabIndex={-1}
            id="release-detail-title"
            className="text-base font-semibold text-ink outline-none"
          >
            {name}
          </h3>
          <p className="text-support text-ink-muted">
            <span className="font-mono">
              {t.detailIdentity(item.external_table, item.external_record_id)}
            </span>
            {" · "}
            {item.status_label}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <RecordSide title={t.baseSide} side={item.base} />
          <RecordSide title={t.targetSide} side={item.target} />
        </div>
        {item.raw_record_changed ? (
          <Alert tone="info">{item.change_count === 0 ? t.rawChanged : t.rawChangedWith}</Alert>
        ) : null}
        {item.changes.length === 0 ? (
          <EmptyState title={t.noChangesInRecord} />
        ) : (
          <TableScroll label={t.changesCaption(name)}>
            <Table>
              <TableCaption>{t.changesCaption(name)}</TableCaption>
              <THead>
                <Tr>
                  <Th>{t.columnField}</Th>
                  <Th>{t.columnNature}</Th>
                  <Th>{t.columnBefore}</Th>
                  <Th>{t.columnAfter}</Th>
                </Tr>
              </THead>
              <TBody>
                {item.changes.map((change) => (
                  <ChangeRow key={change.field} change={change} />
                ))}
              </TBody>
            </Table>
          </TableScroll>
        )}
      </div>
    );
  },
);
