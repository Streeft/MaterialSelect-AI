"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, getCurveValue } from "@/lib/api";
import type { Curve, CurveSeriesValue, CurveValue } from "@/lib/types";
import { fichaText } from "@/lib/i18n-ficha";
import { formatNumber, prettyUnit } from "@/lib/format";
import { seriesName } from "@/components/charts/CurveChart";
import { useAnnounce } from "@/components/ui/Announcer";
import {
  Button,
  DataQualityBadge,
  Input,
  MissingValue,
  RowHeader,
  Select,
  SelectOption,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { ptBR } from "@/lib/i18n";

const t = fichaText.curveValue;
const curves = ptBR.curves;

/** pt-BR typing: "20,5" is 20.5. Anything else that is not a finite number is refused. */
function parseTyped(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** What the address carries of a reading, as written there (D-175). */
export interface CurveValueLink {
  at: string | null;
  unit: string | null;
}

/** The value and unit of a reading, as the address will carry them. */
export interface AppliedReading {
  at: string;
  unit: string;
}

/** A piece of a link, cut to what a sentence can quote. */
function quotable(raw: string): string {
  return raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
}

/**
 * What a link says about the reading, checked before anything is asked. A value
 * that is not a number, or a unit the axis does not accept, is refused with a
 * sentence and never repaired: reading 0,1 in a unit the sender did not mean
 * would hand over a number that answers another question.
 */
function readLink(link: CurveValueLink | undefined, curve: Curve) {
  const defaultUnit = curve.x_axis.unit;
  const none = { applied: null, text: "", unit: defaultUnit, notice: null, clean: false };
  if (!link || (link.at === null && link.unit === null)) return none;
  const unitOk =
    link.unit === null || curve.x_axis.accepted_units.some((option) => option.unit === link.unit);
  if (link.at === null) return { ...none, clean: true };
  const at = parseTyped(link.at);
  if (at === null) return { ...none, notice: t.linkInvalidAt(quotable(link.at)), clean: true };
  const text = String(at).replace(".", ",");
  if (!unitOk) {
    return { ...none, text, notice: t.linkInvalidUnit(quotable(link.unit ?? "")), clean: true };
  }
  const unit = link.unit ?? defaultUnit;
  return { applied: { at, unit }, text, unit, notice: null, clean: false };
}

/**
 * Reading one value off a curve (TM4-b, D-110).
 *
 * The screen sends a question — the x, its unit, and the units the figure is
 * already read in — and writes down the answer. **Nothing is computed here**: the
 * backend converts with `units.py`, finds the point the source declared exactly
 * at that x (never interpolating, extrapolating or taking the nearest) and
 * writes the absence itself. A series with no point there shows the backend's
 * sentence and the "Ausente" badge, never a blank, a dash or a zero (D-24).
 *
 * A trajectory (`path_kind = "path"`, a hysteresis loop) has no single y per x,
 * so the form is not offered: the reason is written instead (D-118).
 *
 * D-175: the reading that was made lives in the address too. `link` is what the
 * address carried when the reader opened, and `onApplied` tells the page the
 * reading to write (or `null`, to take a refused one off). The question is the
 * query's key, so a link restores the answer without a second path.
 */
export function CurveValueReader({
  curve,
  link,
  onApplied,
}: {
  curve: Curve;
  link?: CurveValueLink;
  onApplied?: (reading: AppliedReading | null) => void;
}) {
  if (curve.path_kind === "path") {
    return (
      <div className="well flex flex-col gap-1" data-curve-value="path">
        <h4 className="text-body font-semibold text-ink">{t.pathTitle}</h4>
        <p className="max-w-prose text-support text-ink-muted">{t.pathReason}</p>
      </div>
    );
  }
  // A different curve is a different question: start from a clean form.
  return <Reader key={curve.id} curve={curve} link={link} onApplied={onApplied} />;
}

function Reader({
  curve,
  link,
  onApplied,
}: {
  curve: Curve;
  link?: CurveValueLink;
  onApplied?: (reading: AppliedReading | null) => void;
}) {
  const announce = useAnnounce();
  const xLabel = curve.x_axis.title ?? curve.x_axis.quantity_label;
  // The address is read once, when the reader opens; after that the form is the
  // state and the address only follows it.
  const [fromLink] = useState(() => readLink(link, curve));
  const [text, setText] = useState(fromLink.text);
  const [unit, setUnit] = useState(fromLink.unit);
  const [typingError, setTypingError] = useState<string | null>(fromLink.notice);
  const [applied, setApplied] = useState<{ at: number; unit: string } | null>(fromLink.applied);

  // What the link carried that could not be used comes off the address, once.
  const cleaned = useRef(false);
  useEffect(() => {
    if (cleaned.current || !fromLink.clean) return;
    cleaned.current = true;
    onApplied?.(null);
  }, [fromLink.clean, onApplied]);

  const read = useQuery({
    queryKey: [
      "curve-value",
      curve.material_id,
      curve.id,
      applied?.at,
      applied?.unit,
      curve.y_axis.unit,
      curve.parameter?.unit,
    ],
    queryFn: () =>
      getCurveValue(curve.material_id, curve.id, {
        at: applied!.at,
        atUnit: applied!.unit,
        // The figure's own reading units, so the answer sits beside the plot in
        // the same unit instead of in the canonical one.
        y: curve.y_axis.unit,
        parameter: curve.parameter?.unit,
      }),
    enabled: applied !== null,
    // A refused reading is said once, not asked three times.
    retry: false,
  });

  useEffect(() => {
    if (!read.data) return;
    announce(t.announce(read.data.found_count, read.data.series.length, atText(read.data)));
  }, [read.data, announce]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const at = parseTyped(text);
    if (at === null) {
      setTypingError(t.invalidNumber);
      return;
    }
    setTypingError(null);
    setApplied({ at, unit });
    onApplied?.({ at: String(at), unit });
  }

  const units = curve.x_axis.accepted_units;

  return (
    <form
      onSubmit={submit}
      noValidate
      className="well flex min-w-0 flex-col gap-3"
      data-curve-value="form"
      aria-labelledby={`curve-value-${curve.id}-title`}
    >
      <div>
        <h4 id={`curve-value-${curve.id}-title`} className="text-body font-semibold text-ink">
          {t.title}
        </h4>
        <p className="max-w-prose text-support text-ink-muted">{t.hint(xLabel)}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          label={t.fieldAt(xLabel)}
          value={text}
          inputMode="decimal"
          autoComplete="off"
          error={typingError ?? undefined}
          onChange={(event) => setText(event.target.value)}
          className="w-44"
        />
        {units.length > 1 ? (
          <Select label={t.fieldUnit} value={unit} onChange={(event) => setUnit(event.target.value)}>
            {units.map((option) => (
              <SelectOption key={option.unit} value={option.unit}>
                {option.label}
              </SelectOption>
            ))}
          </Select>
        ) : (
          <span className="pb-2 text-body text-ink">
            {units[0]?.label ?? prettyUnit(curve.x_axis.unit)}
          </span>
        )}
        <Button type="submit" variant="secondary" size="sm" loading={read.isFetching}>
          {read.isFetching ? t.reading : t.submit}
        </Button>
      </div>

      {read.isError && applied !== null ? (
        <p role="alert" className="max-w-prose text-support text-danger-fg">
          <span className="font-semibold">{t.error}</span>{" "}
          {read.error instanceof ApiError ? read.error.message : null}
        </p>
      ) : null}
      {read.data ? <ReadingResult curve={curve} result={read.data} /> : null}
    </form>
  );
}

function atText(result: CurveValue): string {
  return result.at_unit_label
    ? `${formatNumber(result.at)} ${result.at_unit_label}`
    : formatNumber(result.at);
}

function ReadingResult({ curve, result }: { curve: Curve; result: CurveValue }) {
  const at = atText(result);
  const original = (value: number | null, unit: string) =>
    value === null
      ? null
      : unit === "dimensionless"
        ? formatNumber(value)
        : `${formatNumber(value)} ${prettyUnit(unit)}`;
  const nameOf = (row: CurveSeriesValue, fallback: number) => {
    const index = curve.series.findIndex((series) => series.id === row.series_id);
    const series = curve.series[index];
    return series ? seriesName(curve, series, index) : curves.seriesFallback(fallback + 1);
  };
  const withUnit = (value: number) =>
    result.y_unit_label ? `${formatNumber(value)} ${result.y_unit_label}` : formatNumber(value);

  return (
    <div className="flex min-w-0 flex-col gap-2" data-curve-value="result">
      <p className="text-support text-ink">
        {t.foundCount(result.found_count, result.series.length, at)}
      </p>
      <TableScroll label={t.resultCaption(result.title, at)}>
        <Table>
          <TableCaption>{t.resultCaption(result.title, at)}</TableCaption>
          <THead>
            <Tr>
              <Th>{t.columnSeries}</Th>
              <Th numeric>{t.columnValue(result.y_quantity_label, result.y_unit_label)}</Th>
              <Th numeric>{curves.columnBand}</Th>
              <Th>{curves.columnOriginal}</Th>
            </Tr>
          </THead>
          <TBody>
            {result.series.map((row, index) => (
              <Tr key={row.series_id} data-found={row.found ? "" : undefined}>
                <RowHeader>{nameOf(row, index)}</RowHeader>
                {row.found && row.y !== null ? (
                  <>
                    <Td numeric>{withUnit(row.y)}</Td>
                    <Td numeric>
                      {row.y_min !== null && row.y_max !== null
                        ? `${formatNumber(row.y_min)} – ${withUnit(row.y_max)}`
                        : curves.noBand}
                    </Td>
                    <Td>
                      {`${original(row.x_original, curve.x_axis.original_unit) ?? ""} × ${
                        original(row.y_original, curve.y_axis.original_unit) ?? ""
                      }`}
                    </Td>
                  </>
                ) : (
                  // Absence is a state with a label and the backend's sentence:
                  // the whole row says it, so no cell is left blank.
                  <Td colSpan={3}>
                    <span className="flex flex-wrap items-center gap-2">
                      <MissingValue />
                      <span>{row.absence ?? curves.noBand}</span>
                    </span>
                  </Td>
                )}
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableScroll>
      <div className="flex flex-col gap-1 text-caption text-ink-muted">
        <p>
          <span className="font-semibold">{t.ruleLabel}:</span> {result.rule}
        </p>
        <p className="flex flex-wrap items-center gap-2">
          <span>{curves.source(result.source_label)}</span>
          {result.citation ? <span>{curves.citation(result.citation)}</span> : null}
        </p>
        <p className="flex flex-wrap items-center gap-2">
          <span>{t.quality}:</span>
          <DataQualityBadge state={curve.data_quality} />
        </p>
      </div>
    </div>
  );
}
