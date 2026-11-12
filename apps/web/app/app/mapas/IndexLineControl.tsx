"use client";

import { useId } from "react";
import type { IndexLineOut } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import { Alert, Button } from "@/components/ui";

const t = ptBR.map;

/**
 * The movable index line (D-213): the keyboard's way to do what the
 * "Mover linha" cursor does on the figure. The slider walks the levels the
 * backend offers (`steps`, from the smallest to the largest defined value),
 * never a level made up here; the line, its two sides and the counts are the
 * backend's answer for the level chosen (ADR 0004).
 */
export function IndexLineControl({
  active,
  line,
  loading,
  error,
  onActivate,
  onRemove,
  onStep,
  onSelectBetter,
}: {
  active: boolean;
  line: IndexLineOut | undefined;
  loading: boolean;
  error: boolean;
  onActivate: () => void;
  onRemove: () => void;
  onStep: (value: number) => void;
  onSelectBetter: (ids: number[]) => void;
}) {
  const sliderId = useId();
  if (!active) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-support text-ink-muted">{t.lineHint}</p>
        <div>
          <Button size="sm" variant="secondary" onClick={onActivate}>
            {t.lineAdd}
          </Button>
        </div>
      </div>
    );
  }

  const steps = line?.steps ?? [];
  const position = line?.step_index ?? 0;
  const value = line?.value ?? null;
  const unit = line ? prettyUnit(line.dimension) : "";
  const valueText = value !== null ? `${t.lineValue(formatNumber(value))} ${unit}`.trim() : "";

  return (
    <div className="flex flex-col gap-2" aria-busy={loading || undefined}>
      <h4 className="text-body font-semibold text-ink">{t.lineTitle}</h4>
      <p className="text-support text-ink-muted">{t.lineHint}</p>
      {steps.length > 1 ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={sliderId} className="text-caption font-medium text-ink-muted">
            {t.lineSlider}
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={steps.length - 1}
            step={1}
            value={position}
            aria-valuetext={valueText}
            className="w-full accent-[rgb(var(--accent))]"
            onChange={(event) => {
              const next = steps[Number(event.target.value)];
              if (next !== undefined) onStep(next);
            }}
          />
        </div>
      ) : null}
      {value !== null ? (
        <p className="font-mono text-caption text-ink">{valueText}</p>
      ) : null}
      {error ? <Alert tone="danger">{t.lineError}</Alert> : null}
      {line && !line.available && line.unavailable_reason ? (
        <Alert tone="info">{line.unavailable_reason}</Alert>
      ) : null}
      {line && line.available ? (
        <div role="status" aria-live="polite">
          <ul className="flex flex-col gap-0.5 text-caption text-ink-muted">
            <li>{t.lineBetter(line.better_ids.length)}</li>
            <li>{t.lineWorse(line.worse_ids.length)}</li>
            {line.undefined_ids.length > 0 ? (
              <li>{t.lineUndefined(line.undefined_ids.length)}</li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {loading ? <p className="text-caption text-ink-muted">{t.lineLoading}</p> : null}
      <div className="flex flex-wrap gap-2">
        {line && line.available && line.better_ids.length > 0 ? (
          <Button size="sm" variant="secondary" onClick={() => onSelectBetter(line.better_ids)}>
            {t.lineUseBetter}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onRemove}>
          {t.lineRemove}
        </Button>
      </div>
    </div>
  );
}
