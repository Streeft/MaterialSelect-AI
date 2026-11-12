"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { MapAxis, MapPoint } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { formatNumber, prettyUnit } from "@/lib/format";
import { Section } from "@/components/ui";

const t = ptBR.map;

/** `Densidade 2,7 g/cm³` — one coordinate as it is read aloud and shown in a cell. */
function reading(axis: MapAxis, value: number): string {
  return `${axis.property_name} ${formatNumber(value)} ${prettyUnit(axis.unit)}`.trim();
}

/**
 * The points the map shows, as a table a keyboard can walk (D-213).
 *
 * The figure is one `role="img"` for assistive technology; this is how its
 * points are reached one by one. Only the active row's checkbox is in the tab
 * order (a roving tab stop): ↑/↓ move, Home/End jump, Page ↑/↓ move by ten,
 * Space marks the row — the same selection a box or a lasso makes. The row in
 * focus is ringed on the figure (`onFocusPoint`) and announced with its two
 * coordinates; the row under the pointer on the figure (`hoverId`) is
 * highlighted here, without taking the focus away from where the reader is.
 *
 * Values are the map's own (reading units, D-70); nothing is recomputed.
 */
export function PointList({
  points,
  xAxis,
  yAxis,
  selected,
  hoverId,
  onFocusPoint,
  onToggle,
  recordLabel,
}: {
  points: MapPoint[];
  xAxis: MapAxis;
  yAxis: MapAxis;
  selected: ReadonlySet<number>;
  hoverId: number | null;
  onFocusPoint: (id: number | null) => void;
  onToggle: (id: number) => void;
  recordLabel?: string;
}) {
  const [cursor, setCursor] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const current = Math.min(cursor, Math.max(points.length - 1, 0));

  function focusRow(index: number) {
    const next = Math.max(0, Math.min(points.length - 1, index));
    setCursor(next);
    boxes.current[next]?.focus();
  }

  function handleKey(event: KeyboardEvent<HTMLTableSectionElement>) {
    const moves: Record<string, number> = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      Home: 0,
      End: points.length - 1,
      PageDown: current + 10,
      PageUp: current - 10,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    focusRow(target);
  }

  return (
    <Section id="pontos" title={t.pointsTitle} description={t.pointsHint} headingLevel={2}>
      {points.length === 0 ? (
        <p className="text-support text-ink-muted">{t.pointsEmpty}</p>
      ) : (
        <div className="max-h-[26rem] overflow-auto rounded-md border border-line">
          <table className="w-full border-collapse text-body">
            <caption className="sr-only">{t.pointsCaption(points.length)}</caption>
            <thead className="sticky top-0 z-[1] bg-surface-raised">
              <tr className="text-left text-caption text-ink-muted">
                <th scope="col" className="w-12 px-3 py-2 font-medium">
                  <span className="sr-only">{t.columnSelected}</span>
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {recordLabel ?? ptBR.compare.columnMaterial}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {ptBR.chart.columnClass}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {xAxis.property_name}
                  {prettyUnit(xAxis.unit) ? ` [${prettyUnit(xAxis.unit)}]` : ""}
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  {yAxis.property_name}
                  {prettyUnit(yAxis.unit) ? ` [${prettyUnit(yAxis.unit)}]` : ""}
                </th>
              </tr>
            </thead>
            <tbody onKeyDown={handleKey}>
              {points.map((point, index) => {
                const id = point.material_id;
                const isSelected = selected.has(id);
                return (
                  <tr
                    key={point.record_id ?? id}
                    data-hover={hoverId === id ? "true" : undefined}
                    className={cn(
                      "border-t border-line",
                      isSelected && "bg-primary-container/40",
                      hoverId === id && "bg-surface-container-high",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        ref={(node) => {
                          boxes.current[index] = node;
                        }}
                        type="checkbox"
                        className="h-4 w-4 accent-[rgb(var(--accent))]"
                        aria-label={t.pointSelect(point.material_name)}
                        checked={isSelected}
                        tabIndex={index === current ? 0 : -1}
                        onChange={() => onToggle(id)}
                        onFocus={() => {
                          setCursor(index);
                          onFocusPoint(id);
                          setAnnouncement(
                            t.pointAnnounce(
                              point.material_name,
                              point.class_name,
                              reading(xAxis, point.x),
                              reading(yAxis, point.y),
                            ),
                          );
                        }}
                        onBlur={() => onFocusPoint(null)}
                      />
                    </td>
                    <th scope="row" className="px-3 py-1.5 text-left font-medium text-ink">
                      {point.material_name}
                    </th>
                    <td className="px-3 py-1.5 text-ink-muted">{point.class_name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(point.x)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(point.y)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Section>
  );
}
