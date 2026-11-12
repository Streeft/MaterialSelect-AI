"use client";

import type { ReactNode } from "react";
import type { ChartScale, Goal, IndexOverlay, MapPoint, PerformanceIndex } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Disclosure,
  Input,
  Select,
  SelectOption,
  ToggleChip,
} from "@/components/ui";
import { ExpressionBuilder } from "@/components/expression/ExpressionBuilder";
import { IndexCard, IndexPicker, type IndexDescriptor } from "@/components/selection/IndexCard";

const t = ptBR.map;

export interface CustomizeState {
  universe: "material" | "process";
  displayScale: ChartScale;
  envelopeShape: "hull" | "ellipse";
  showEnvelopes: boolean;
  showIntervals: boolean;
  showLabels: boolean;
  selectedClasses: string[];
  indexMode: string;
  customExpression: string;
  indexGoal: Goal;
  levelMaterialIds: number[];
  levelDraft: string;
}

export interface CustomizeActions {
  onScale: (scale: ChartScale) => void;
  onEnvelopeShape: (shape: "hull" | "ellipse") => void;
  onShowEnvelopes: (value: boolean) => void;
  onShowIntervals: (value: boolean) => void;
  onShowLabels: (value: boolean) => void;
  onClearClasses: () => void;
  onToggleClass: (slug: string) => void;
  onIndexMode: (mode: string) => void;
  onCustomExpression: (expression: string) => void;
  onIndexGoal: (goal: Goal) => void;
  onAddLevelMaterial: (id: number) => void;
  onLevelDraft: (text: string) => void;
  onAddNumericLevel: () => void;
  onRemoveLevel: (materialId: number | null, value: number) => void;
}

/**
 * D-221: three sections of the map's inspector — Aparência, Classes, Índice —
 * from the one "Personalizar o mapa" card they used to share (D-213). Each is
 * its own fold now, with the inspector's heading; `part` says which body.
 */
export function CustomizePanel({
  part,
  state,
  actions,
  classes,
  indices,
  anyAxisIsIndex,
  indexDescriptor,
  overlay,
  hasActiveIndex,
  points,
  movableLine,
}: {
  part: "appearance" | "classes" | "index";
  state: CustomizeState;
  actions: CustomizeActions;
  classes: { slug: string; name: string }[];
  indices: PerformanceIndex[];
  anyAxisIsIndex: boolean;
  indexDescriptor: IndexDescriptor | null;
  overlay: IndexOverlay | null;
  hasActiveIndex: boolean;
  points: MapPoint[];
  /** The movable-line control, already wired by the page. */
  movableLine: ReactNode;
}) {
  const appearance = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h3 className="text-caption font-semibold text-ink-muted">{t.groupScaleEnvelope}</h3>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-caption font-medium text-ink-muted">{t.scale}</span>
            <ButtonGroup label={t.scale}>
              {(["linear", "log"] as ChartScale[]).map((option) => (
                <ButtonGroupItem
                  key={option}
                  selected={state.displayScale === option}
                  label={option === "linear" ? t.linear : t.log}
                  onClick={() => actions.onScale(option)}
                />
              ))}
            </ButtonGroup>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-caption font-medium text-ink-muted">{t.envelope}</span>
            <ButtonGroup label={t.envelope}>
              {(["hull", "ellipse"] as const).map((option) => (
                <ButtonGroupItem
                  key={option}
                  selected={state.envelopeShape === option}
                  label={option === "hull" ? t.convexHull : t.adjustedEllipse}
                  onClick={() => actions.onEnvelopeShape(option)}
                />
              ))}
            </ButtonGroup>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-caption font-semibold text-ink-muted">{t.groupDisplay}</h3>
        <div className="flex flex-col gap-2">
          <Checkbox
            label={t.envelopes}
            checked={state.showEnvelopes}
            onChange={(e) => actions.onShowEnvelopes(e.target.checked)}
          />
          <Checkbox
            label={t.intervals}
            checked={state.showIntervals}
            onChange={(e) => actions.onShowIntervals(e.target.checked)}
          />
          <Checkbox
            label={t.labels}
            checked={state.showLabels}
            onChange={(e) => actions.onShowLabels(e.target.checked)}
          />
        </div>
      </div>

    </div>
  );

  const classChips = (
        <div className="flex flex-wrap gap-2">
          <ToggleChip selected={state.selectedClasses.length === 0} onClick={actions.onClearClasses}>
            {t.allClasses}
          </ToggleChip>
          {classes.map((c) => (
            <ToggleChip
              key={c.slug}
              selected={state.selectedClasses.includes(c.slug)}
              onClick={() => actions.onToggleClass(c.slug)}
            >
              {c.name}
            </ToggleChip>
          ))}
        </div>
  );

  const index = (
      <div className="flex flex-col gap-3">
        <p className="text-support text-ink-muted">{t.indexHint}</p>
        <div className="flex flex-col gap-3">
          {state.universe === "process" ? (
            <Alert tone="info">{t.processIndexWarning}</Alert>
          ) : anyAxisIsIndex ? (
            <Alert tone="info">{t.indexAxisConflict}</Alert>
          ) : (
            <>
              <IndexPicker
                indices={indices}
                value={state.indexMode}
                onChange={actions.onIndexMode}
                customSlot={
                  <div className="flex flex-col gap-3">
                    <ExpressionBuilder
                      label={t.expression}
                      value={state.customExpression}
                      onChange={actions.onCustomExpression}
                    />
                    <Select
                      label={t.goal}
                      value={state.indexGoal}
                      onChange={(e) => actions.onIndexGoal(e.target.value as Goal)}
                    >
                      <SelectOption value="maximize">{t.maximize}</SelectOption>
                      <SelectOption value="minimize">{t.minimize}</SelectOption>
                    </Select>
                  </div>
                }
              />

              {/* The slope shown here is the one the backend computed for these
                  two axes — the card never derives it (ADR 0004). */}
              {indexDescriptor && (
                <IndexCard
                  index={indexDescriptor}
                  dimension={overlay?.dimension}
                  indexLine={
                    overlay
                      ? {
                          available: overlay.available,
                          orientation: overlay.orientation,
                          slope: overlay.slope,
                          unavailableReason: overlay.unavailable_reason,
                        }
                      : null
                  }
                />
              )}

              {hasActiveIndex && (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-end gap-3">
                    <Select
                      label={t.levelThrough}
                      hint={t.levelsHint}
                      className="min-w-0 flex-[1_1_12rem]"
                      value=""
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        if (Number.isInteger(id) && id > 0) actions.onAddLevelMaterial(id);
                      }}
                    >
                      <SelectOption value="">{t.levelNone}</SelectOption>
                      {points
                        .filter(
                          (p) =>
                            p.index_value !== null && !state.levelMaterialIds.includes(p.material_id),
                        )
                        .map((p) => (
                          <SelectOption key={p.material_id} value={String(p.material_id)}>
                            {p.material_name}
                          </SelectOption>
                        ))}
                    </Select>

                    {/* Text with a decimal keypad, not `type="number"`: a
                        pt-BR reader types "2,7" and a number input drops what
                        it cannot parse, without saying so. */}
                    <Input
                      label={t.levelValue}
                      className="w-40"
                      value={state.levelDraft}
                      inputMode="decimal"
                      onChange={(e) => actions.onLevelDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          actions.onAddNumericLevel();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={actions.onAddNumericLevel}
                      disabled={!Number.isFinite(Number(state.levelDraft.replace(",", ".")))}
                    >
                      {t.levelAdd}
                    </Button>
                  </div>

                  {overlay && overlay.levels.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {overlay.levels.map((level) => (
                        <li
                          key={`${level.value}-${level.material_id ?? "n"}`}
                          className="flex flex-wrap items-center gap-2 text-caption text-ink-muted"
                        >
                          <span>
                            M = {formatNumber(level.value)}
                            {level.material_name ? ` (${level.material_name})` : ""} —{" "}
                            {t.superior(level.superior_material_ids.length)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => actions.onRemoveLevel(level.material_id, level.value)}
                            aria-label={`${ptBR.actions.remove}: M = ${formatNumber(level.value)}`}
                          >
                            {ptBR.actions.remove}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {movableLine}
                </div>
              )}
            </>
          )}
        </div>
      </div>
  );

  if (part === "appearance") return appearance;
  if (part === "classes") return classChips;
  return index;
}
