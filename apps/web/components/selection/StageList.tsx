"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getPropertyMap } from "@/lib/api";
import type {
  ChartAxisIn,
  ChartStageIn,
  ConstraintGroupIn,
  Goal,
  MaterialClass,
  Process,
  ProcessAttribute,
  ProcessClass,
  PropertyDefinition,
  SelectionUniverse,
  StageIn,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Badge,
  type BadgeTone,
  Button,
  CONTROL,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  IconButton,
  Input,
  Select,
  SelectOption,
  useWiring,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { prettyUnit } from "@/lib/format";
import {
  ConstraintEditor,
  type ConstraintGroupState,
  emptyGroup,
  nextEditorId,
  toConstraintPayload,
} from "./ConstraintEditor";
import { AshbyMap, type BoxSelection } from "@/components/charts/AshbyMap";

const t = ptBR.selection;

/**
 * One stage as the editor holds it (P0-1).
 *
 * A discriminated union rather than one shape with both halves optional: a
 * stage is one kind of question, and the backend rejects a payload that
 * carries the other kind's fields. Making that unrepresentable here means the
 * screen cannot build one.
 */
export type StageState =
  | {
      id: string;
      kind: "limit";
      label: string;
      enabled: boolean;
      group: ConstraintGroupState;
    }
  | {
      id: string;
      kind: "tree";
      label: string;
      enabled: boolean;
      classSlugs: string[];
      includeDescendants: boolean;
    }
  | {
      id: string;
      kind: "process";
      label: string;
      enabled: boolean;
      processSlugs: string[];
      processClassSlugs: string[];
      includeDescendants: boolean;
    }
  | {
      id: string;
      kind: "material";
      label: string;
      enabled: boolean;
      materialClassSlugs: string[];
      includeDescendants: boolean;
    }
  | {
      id: string;
      kind: "chart";
      label: string;
      enabled: boolean;
      x: ChartAxisState;
      y: ChartAxisState;
      indexExpression: string;
      indexGoal: Goal;
      /** The level, as typed. Empty is "no line", which is not a level of 0. */
      indexLevel: string;
    };

/**
 * One axis of a chart stage, as the editor holds it (P1-2).
 *
 * `mode` is explicit rather than inferred from which of the two fields is
 * filled: a reader who types an expression, changes their mind and picks a
 * property would otherwise leave both set, which the backend refuses. Holding
 * the choice means the screen cannot build that payload.
 *
 * The bounds are **strings**, because a number input's empty state is what
 * carries "no bound" — and `Number("")` is `0`, which is a bound. Parsing
 * happens once, in `toStagePayload`, where the empty string becomes `null`.
 */
export interface ChartAxisState {
  mode: "property" | "expression";
  propertySlug: string;
  expression: string;
  min: string;
  max: string;
}

function emptyChartAxis(): ChartAxisState {
  return { mode: "property", propertySlug: "", expression: "", min: "", max: "" };
}

export function emptyLimitStage(): StageState {
  return {
    id: nextEditorId("stage"),
    kind: "limit",
    label: "",
    enabled: true,
    group: emptyGroup(nextEditorId("group")),
  };
}

export function emptyTreeStage(): StageState {
  return {
    id: nextEditorId("stage"),
    kind: "tree",
    label: "",
    enabled: true,
    classSlugs: [],
    includeDescendants: true,
  };
}

export function emptyProcessStage(): StageState {
  return {
    id: nextEditorId("stage"),
    kind: "process",
    label: "",
    enabled: true,
    processSlugs: [],
    processClassSlugs: [],
    includeDescendants: true,
  };
}

export function emptyMaterialStage(): StageState {
  return {
    id: nextEditorId("stage"),
    kind: "material",
    label: "",
    enabled: true,
    materialClassSlugs: [],
    includeDescendants: true,
  };
}

export function emptyChartStage(): StageState {
  return {
    id: nextEditorId("stage"),
    kind: "chart",
    label: "",
    enabled: true,
    x: emptyChartAxis(),
    y: emptyChartAxis(),
    indexExpression: "",
    indexGoal: "maximize",
    indexLevel: "",
  };
}

/**
 * A typed bound as the API takes it: a number, or `null` for "no bound".
 *
 * Blank is null and never 0 — that is the whole reason the state holds strings.
 * A value that is not a number at all is also null rather than `NaN`: `NaN`
 * compares false against everything, so it would reject the entire catalogue
 * without a word, and the schema refuses it anyway.
 *
 * Supports comma as decimal separator (pt-BR locale) via `.replace(",", ".")`.
 */
export function toBound(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function toAxisPayload(axis: ChartAxisState) {
  return {
    property_slug: axis.mode === "property" ? axis.propertySlug || null : null,
    expression: axis.mode === "expression" ? axis.expression.trim() || null : null,
    min_value: toBound(axis.min),
    max_value: toBound(axis.max),
  };
}

/** The plane as the API takes it — the line only when it has both halves. */
export function toChartPayload(stage: Extract<StageState, { kind: "chart" }>): ChartStageIn {
  const expression = stage.indexExpression.trim();
  const level = toBound(stage.indexLevel);
  // Neither half alone is sent: the backend refuses the pair broken, and a
  // half-written line is the reader having stopped in the middle rather than
  // having asked for something.
  const line = expression && level !== null;
  return {
    x: toAxisPayload(stage.x),
    y: toAxisPayload(stage.y),
    index_expression: line ? expression : null,
    index_goal: stage.indexGoal,
    index_level: line ? level : null,
  };
}

/**
 * A stored bound back into the editor's string field.
 *
 * `null` is an empty field and never "0": the column is nullable precisely so
 * that an absent limit and a limit of zero stay different things, and reopening
 * a saved study is exactly where that distinction would be lost.
 */
export function boundToField(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * One stored axis back into editor state — the inverse of `toAxisPayload`.
 *
 * Lives here rather than in the page for the reason `fromConstraintPayload`
 * lives beside `toConstraintPayload`: the two directions have to agree, and
 * they only stay in agreement while they are read together.
 */
export function chartAxisFromPayload(axis: ChartAxisIn | null | undefined): ChartAxisState {
  return {
    // Which mode it was is unambiguous, because the backend refuses an axis
    // that names both.
    mode: axis?.expression ? "expression" : "property",
    propertySlug: axis?.property_slug ?? "",
    expression: axis?.expression ?? "",
    min: boundToField(axis?.min_value),
    max: boundToField(axis?.max_value),
  };
}

/** The pipeline as the API takes it. An empty label is "not named", not `""`. */
export function toStagePayload(stage: StageState): StageIn {
  const common = {
    label: stage.label.trim() || null,
    enabled: stage.enabled,
  };
  if (stage.kind === "tree") {
    return {
      ...common,
      kind: "tree",
      class_slugs: stage.classSlugs,
      include_descendants: stage.includeDescendants,
    };
  }
  if (stage.kind === "material") {
    return {
      ...common,
      kind: "material",
      material_class_slugs: stage.materialClassSlugs,
      include_descendants: stage.includeDescendants,
    };
  }
  if (stage.kind === "process") {
    return {
      ...common,
      kind: "process",
      process_slugs: stage.processSlugs,
      process_class_slugs: stage.processClassSlugs,
      include_descendants: stage.includeDescendants,
    };
  }
  if (stage.kind === "chart") {
    return { ...common, kind: "chart", chart: toChartPayload(stage) };
  }
  return { ...common, kind: "limit", root_group: toConstraintPayload(stage.group) };
}

/** How many constraints the whole pipeline carries — a tree stage has none. */
export function countStageConstraints(stages: StageState[]): number {
  const inGroup = (g: ConstraintGroupIn): number =>
    g.constraints.length + g.groups.reduce((n, child) => n + inGroup(child), 0);
  return stages.reduce(
    (n, stage) => n + (stage.kind === "limit" ? inGroup(toConstraintPayload(stage.group)) : 0),
    0,
  );
}

/** True when the pipeline is the plain single limit stage the page starts on. */
export function isSingleLimitStage(stages: StageState[]): boolean {
  const only = stages[0];
  return stages.length === 1 && only !== undefined && only.kind === "limit";
}

interface Props {
  stages: StageState[];
  properties: PropertyDefinition[];
  /** The process attribute catalogue (P0-4) — what a limit stage selects on in a
   * process study. Empty while it loads, or if none is catalogued. */
  processAttributes?: ProcessAttribute[];
  classes: MaterialClass[];
  /** The process universe (P0-2). Empty while it loads, or if none is catalogued. */
  processes?: Process[];
  processClasses?: ProcessClass[];
  /**
   * Which universe the study returns (P0-3). It decides two things the reader
   * would otherwise have to know by heart: which cross stage can be added, and
   * which taxonomy a tree stage lists — a tree stage always walks the study's
   * **own** universe.
   */
  universe?: SelectionUniverse;
  onChange: (stages: StageState[]) => void;
}

export function StageList({
  stages,
  properties,
  processAttributes = [],
  classes,
  processes = [],
  processClasses = [],
  universe = "material",
  onChange,
}: Props) {
  const isProcessStudy = universe === "process";
  // A tree stage selects folders of the study's own universe.
  const ownFolders = isProcessStudy ? processClasses : classes;
  const replace = (index: number, next: StageState) =>
    onChange(stages.map((s, i) => (i === index ? next : s)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    const moved = stages[index];
    const displaced = stages[target];
    if (moved === undefined || displaced === undefined) return;
    const next = [...stages];
    next[index] = displaced;
    next[target] = moved;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      {stages.map((stage, index) => (
        <Card key={stage.id}>
          <CardHeader
            headingLevel={3}
            title={stage.label.trim() || t.stageNumber(index + 1, stage.kind)}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STAGE_TONES[stage.kind]}>{STAGE_BADGES[stage.kind]}</Badge>
                {/* IconButton, not a Button with an aria-label: an arrow
                    glyph is not a name, and this is the primitive the design
                    system gives an icon-only control so the accessible name
                    cannot be forgotten. */}
                <IconButton
                  size="sm"
                  label={t.stageMoveUp(index + 1)}
                  icon={<span aria-hidden>↑</span>}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                />
                <IconButton
                  size="sm"
                  label={t.stageMoveDown(index + 1)}
                  icon={<span aria-hidden>↓</span>}
                  disabled={index === stages.length - 1}
                  onClick={() => move(index, 1)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  // The last stage stays: a pipeline with nothing in it is not
                  // a state the screen should be able to reach, and the backend
                  // rejects an empty `stages` list for the same reason.
                  disabled={stages.length === 1}
                  onClick={() => onChange(stages.filter((_, i) => i !== index))}
                >
                  {t.stageRemove}
                </Button>
              </div>
            }
          />
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-4">
              <Input
                label={t.stageLabel}
                className="min-w-[14rem] flex-1"
                value={stage.label}
                placeholder={t.stageLabelPlaceholder}
                onChange={(e) => replace(index, { ...stage, label: e.target.value })}
              />
              <Checkbox
                label={t.stageEnabled}
                checked={stage.enabled}
                onChange={(e) => replace(index, { ...stage, enabled: e.target.checked })}
                hint={t.stageEnabledHint}
              />
            </div>

            {stage.kind === "limit" && (
              <ConstraintEditor
                root={stage.group}
                // A limit stage names attributes of the study's **own** universe
                // (P0-4), the same rule a tree stage follows for folders — and
                // `in_class` inside it compares the record's own class, so the
                // folder list follows the universe too.
                properties={isProcessStudy ? processAttributes : properties}
                classes={ownFolders}
                universe={universe}
                onChange={(group) => replace(index, { ...stage, group })}
              />
            )}
            {stage.kind === "tree" && (
              <TreeStageFields
                stage={stage}
                classes={ownFolders}
                label={isProcessStudy ? t.stageProcessClasses : t.stageClasses}
                onChange={(next) => replace(index, next)}
              />
            )}
            {stage.kind === "material" && (
              <MaterialStageFields
                stage={stage}
                classes={classes}
                onChange={(next) => replace(index, next)}
              />
            )}
            {stage.kind === "process" && (
              <ProcessStageFields
                stage={stage}
                processes={processes}
                processClasses={processClasses}
                onChange={(next) => replace(index, next)}
              />
            )}
            {stage.kind === "chart" && (
              <ChartStageFields
                stage={stage}
                // The plane plots attributes of the study's **own** universe,
                // the same rule a limit stage follows (P0-4): offering a
                // material property on a process study's plane would be a 404
                // waiting to happen.
                properties={isProcessStudy ? processAttributes : properties}
                universe={universe}
                onChange={(next) => replace(index, next)}
              />
            )}
          </CardBody>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onChange([...stages, emptyLimitStage()])}>
          + {t.stageAddLimit}
        </Button>
        <Button size="sm" onClick={() => onChange([...stages, emptyTreeStage()])}>
          + {t.stageAddTree}
        </Button>
        {/* Offered in both universes: a process has had magnitudes since P0-4,
            so a region of one of its planes selects the same way. */}
        <Button size="sm" onClick={() => onChange([...stages, emptyChartStage()])}>
          + {t.stageAddChart}
        </Button>
        {/* One cross stage per universe, and only the one that applies: the
            backend refuses the other, so offering it would be a button whose
            only outcome is an error message. */}
        {isProcessStudy ? (
          <Button size="sm" onClick={() => onChange([...stages, emptyMaterialStage()])}>
            + {t.stageAddMaterial}
          </Button>
        ) : (
          <Button size="sm" onClick={() => onChange([...stages, emptyProcessStage()])}>
            + {t.stageAddProcess}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Badge text and tone per stage kind (P0-2).
 *
 * Tables and not nested ternaries: with three kinds a ternary maps the third to
 * whichever branch is the fallback, so the card would be labelled wrong instead
 * of visibly unlabelled — and the type checker would not notice.
 */
const STAGE_BADGES: Record<StageState["kind"], string> = {
  limit: t.stageKindLimit,
  tree: t.stageKindTree,
  process: t.stageKindProcess,
  material: t.stageKindMaterial,
  chart: t.stageKindChart,
};

// Identity tones, not status ones: "success"/"warning" carry meaning elsewhere
// in this interface, and a stage kind is not an outcome.
const STAGE_TONES: Record<StageState["kind"], BadgeTone> = {
  limit: "neutral",
  tree: "info",
  process: "brand",
  material: "info",
  chart: "brand",
};

/**
 * A multiple-choice list of slugs, wired through the design system's `Field`.
 *
 * `Field` and not a hand-rolled `<label>` wrapping the control: a label that
 * wraps both the caption and the hint makes the accessible name the two of them
 * concatenated, so the control announces its own help text as part of its name.
 * `Field` gives the caption as the name and the hint as `aria-describedby`,
 * which is also what every other control on this screen does.
 */
function SlugMultiSelect({
  label,
  hint,
  options,
  selected,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { slug: string; name: string }[];
  selected: string[];
  onChange: (slugs: string[]) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <MultiSelect selected={selected} onChange={onChange} options={options} />
    </Field>
  );
}

function MultiSelect({
  id,
  options,
  selected,
  onChange,
}: {
  id?: string;
  options: { slug: string; name: string }[];
  selected: string[];
  onChange: (slugs: string[]) => void;
}) {
  const w = useWiring(id);
  return (
    <select
      id={w.id}
      multiple
      aria-describedby={w.describedBy}
      aria-invalid={w.invalid || undefined}
      className={cn(CONTROL, "h-32")}
      value={selected}
      onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
    >
      {options.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

function MaterialStageFields({
  stage,
  classes,
  onChange,
}: {
  stage: Extract<StageState, { kind: "material" }>;
  classes: MaterialClass[];
  onChange: (stage: StageState) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t.stageMaterialsHint}</p>

      <SlugMultiSelect
        label={t.stageMaterialClasses}
        hint={t.stageClassesHint}
        options={classes}
        selected={stage.materialClassSlugs}
        onChange={(materialClassSlugs) => onChange({ ...stage, materialClassSlugs })}
      />

      <Checkbox
        label={t.stageIncludeDescendants}
        checked={stage.includeDescendants}
        onChange={(e) => onChange({ ...stage, includeDescendants: e.target.checked })}
        hint={t.stageIncludeDescendantsHint}
      />

      {/* Absence written out, never an empty control the reader has to read into. */}
      {stage.materialClassSlugs.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.stageNoMaterialClasses}</p>
      ) : (
        <p className="text-sm text-fg-muted">{t.stageMaterialWarning}</p>
      )}
    </div>
  );
}

function ProcessStageFields({
  stage,
  processes,
  processClasses,
  onChange,
}: {
  stage: Extract<StageState, { kind: "process" }>;
  processes: Process[];
  processClasses: ProcessClass[];
  onChange: (stage: StageState) => void;
}) {
  const nothingPicked =
    stage.processSlugs.length === 0 && stage.processClassSlugs.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t.stageProcessesHint}</p>

      <div className="flex flex-wrap gap-4">
        <div className="min-w-[14rem] flex-1">
          <SlugMultiSelect
            label={t.stageProcessClasses}
            hint={t.stageClassesHint}
            options={processClasses}
            selected={stage.processClassSlugs}
            onChange={(processClassSlugs) => onChange({ ...stage, processClassSlugs })}
          />
        </div>
        <div className="min-w-[14rem] flex-1">
          <SlugMultiSelect
            label={t.stageProcesses}
            hint={t.stageClassesHint}
            options={processes}
            selected={stage.processSlugs}
            onChange={(processSlugs) => onChange({ ...stage, processSlugs })}
          />
        </div>
      </div>

      <Checkbox
        label={t.stageIncludeProcessDescendants}
        checked={stage.includeDescendants}
        onChange={(e) => onChange({ ...stage, includeDescendants: e.target.checked })}
        hint={t.stageIncludeProcessDescendantsHint}
      />

      {/* Absence written out, never an empty control the reader has to read into. */}
      {nothingPicked ? (
        <p className="text-sm text-fg-muted">{t.stageNoProcesses}</p>
      ) : (
        <p className="text-sm text-fg-muted">{t.stageProcessWarning}</p>
      )}
    </div>
  );
}

/**
 * The chart stage's editor: the plane, the box and the line (P1-2).
 *
 * Two things here are deliberate and would be easy to "fix" into a bug.
 *
 * **The bounds have no unit picker**, unlike a constraint's threshold three
 * cards up. A threshold is typed by a reader who chooses the unit; these numbers
 * are read off an axis the chart already draws in canonical units, so a picker
 * would offer a conversion nothing performs. The hint names the unit instead.
 *
 * **Blank is not zero.** Each bound is held as a string precisely so the empty
 * field can mean "no bound"; `Number("")` is `0`, which is a bound, and a box
 * that silently acquired a floor at zero would narrow a selection the reader
 * never narrowed.
 */
function ChartStageFields({
  stage,
  properties,
  universe = "material",
  onChange,
}: {
  stage: Extract<StageState, { kind: "chart" }>;
  properties: { slug: string; name: string; canonical_unit?: string | null }[];
  universe?: SelectionUniverse;
  onChange: (stage: StageState) => void;
}) {
  const [showMap, setShowMap] = useState(false);

  const hasBox =
    stage.x.min !== "" || stage.x.max !== "" || stage.y.min !== "" || stage.y.max !== "";
  const hasLine = stage.indexExpression.trim() !== "" && stage.indexLevel.trim() !== "";
  const axesChosen = [stage.x, stage.y].every((axis) =>
    axis.mode === "property" ? axis.propertySlug !== "" : axis.expression.trim() !== "",
  );

  const canPlotMap =
    stage.x.mode === "property" &&
    stage.x.propertySlug !== "" &&
    stage.y.mode === "property" &&
    stage.y.propertySlug !== "";

  const mapQuery = useQuery({
    queryKey: ["stage-chart-map", universe, stage.x.propertySlug, stage.y.propertySlug],
    queryFn: () =>
      getPropertyMap({
        universe,
        x: stage.x.propertySlug,
        y: stage.y.propertySlug,
        x_index: null,
        y_index: null,
        scale: "log",
        envelope_shape: "ellipse",
        class_slugs: [],
        material_ids: null,
        include_envelopes: true,
        index: null,
        index_levels: [],
        index_level_material_ids: [],
      }),
    enabled: canPlotMap && showMap,
  });

  const currentBox = useMemo<BoxSelection | null>(() => {
    const xMin = toBound(stage.x.min);
    const xMax = toBound(stage.x.max);
    const yMin = toBound(stage.y.min);
    const yMax = toBound(stage.y.max);
    if (xMin === null && xMax === null && yMin === null && yMax === null) {
      return null;
    }
    return { xMin, xMax, yMin, yMax };
  }, [stage.x.min, stage.x.max, stage.y.min, stage.y.max]);

  const handleSelectBox = (box: BoxSelection | null) => {
    if (!box) {
      onChange({
        ...stage,
        x: { ...stage.x, min: "", max: "" },
        y: { ...stage.y, min: "", max: "" },
      });
      return;
    }
    onChange({
      ...stage,
      x: {
        ...stage.x,
        min: box.xMin !== null ? String(box.xMin) : "",
        max: box.xMax !== null ? String(box.xMax) : "",
      },
      y: {
        ...stage.y,
        min: box.yMin !== null ? String(box.yMin) : "",
        max: box.yMax !== null ? String(box.yMax) : "",
      },
    });
  };

  const handleClearBox = () => {
    onChange({
      ...stage,
      x: { ...stage.x, min: "", max: "" },
      y: { ...stage.y, min: "", max: "" },
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-muted">{t.stageChartHint}</p>

      <div className="flex flex-wrap gap-4">
        <ChartAxisFields
          axis={stage.x}
          label={t.stageChartAxisX}
          properties={properties}
          onChange={(x) => onChange({ ...stage, x })}
        />
        <ChartAxisFields
          axis={stage.y}
          label={t.stageChartAxisY}
          properties={properties}
          onChange={(y) => onChange({ ...stage, y })}
        />
      </div>

      {hasBox && (\n        <div>\n          <Button variant=\"secondary\" size=\"sm\" onClick={handleClearBox}>\n            {t.stageChartClearBox}\n          </Button>\n        </div>\n      )}

      {canPlotMap && (
        <div className="flex flex-col gap-2 rounded-card border border-edge p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-fg">{t.stageKindChart}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowMap((prev) => !prev)}
            >
              {showMap ? t.stageChartHideMap : t.stageChartShowMap}
            </Button>
          </div>
          {showMap && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-ink-muted">{t.stageChartInteractiveHint}</p>
              {mapQuery.isLoading && (
                <p className="text-xs text-ink-muted">{ptBR.ui.loading}</p>
              )}
              {mapQuery.data && (
                <AshbyMap
                  map={mapQuery.data}
                  recordLabel={universe === "process" ? ptBR.map.columnProcess : undefined}
                  enableBoxSelect
                  selectionBox={currentBox}
                  onSelectBox={handleSelectBox}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-card border border-edge p-3">
        <p className="text-sm font-medium text-fg">{t.stageChartLine}</p>
        <p className="text-sm text-fg-muted">{t.stageChartLineHint}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label={t.stageChartExpression}
            className="min-w-[14rem] flex-1"
            value={stage.indexExpression}
            placeholder={t.stageChartExpressionPlaceholder}
            onChange={(e) => onChange({ ...stage, indexExpression: e.target.value })}
          />
          <Input
            label={t.stageChartLevel}
            className="w-40"
            inputMode="decimal"
            value={stage.indexLevel}
            onChange={(e) => onChange({ ...stage, indexLevel: e.target.value })}
          />
          <Select
            label={t.stageChartGoal}
            className="w-52"
            value={stage.indexGoal}
            onChange={(e) => onChange({ ...stage, indexGoal: e.target.value as Goal })}
          >
            <SelectOption value="maximize">{t.stageChartGoalMaximize}</SelectOption>
            <SelectOption value="minimize">{t.stageChartGoalMinimize}</SelectOption>
          </Select>
        </div>
      </div>

      {/* Absence written out, never an empty control the reader has to read
          into — and the plottability rule stated, because it is the one rule
          this stage has that no other stage has. */}
      {!axesChosen ? (
        <p className="text-sm text-fg-muted">{t.stageChartNoAxes}</p>
      ) : !hasBox && !hasLine ? (
        <p className="text-sm text-fg-muted">{t.stageChartPlottableOnly}</p>
      ) : (
        <p className="text-sm text-fg-muted">{t.stageChartWarning}</p>
      )}

      {/* Said before the run, not after: an inverted box returns nothing and
          looks like an answer, which is the bug this whole stage's checks
          exist to prevent. The backend refuses it too. */}
      {invertedAxis(stage) !== null && (
        <p className="text-sm text-danger-fg">{t.stageChartInvertedBox(invertedAxis(stage)!)}</p>
      )}
    </div>
  );
}

/** Which axis has its minimum above its maximum, if either does. */
function invertedAxis(stage: Extract<StageState, { kind: "chart" }>): string | null {
  const pairs: [ChartAxisState, string][] = [
    [stage.x, "X"],
    [stage.y, "Y"],
  ];
  for (const [axis, name] of pairs) {
    const min = toBound(axis.min);
    const max = toBound(axis.max);
    if (min !== null && max !== null && min > max) return name;
  }
  return null;
}

function ChartAxisFields({
  axis,
  label,
  properties,
  onChange,
}: {
  axis: ChartAxisState;
  label: string;
  properties: { slug: string; name: string; canonical_unit?: string | null }[];
  onChange: (axis: ChartAxisState) => void;
}) {
  const chosen = properties.find((p) => p.slug === axis.propertySlug);
  // The unit is named only when it is known: inventing "na unidade canônica do
  // eixo" for an axis nobody has chosen yet would be a hint about nothing.
  const boundsHint =
    axis.mode === "property" && chosen?.canonical_unit
      ? t.stageChartBoundsHint(prettyUnit(chosen.canonical_unit))
      : t.stageChartBoundsHintPlain;

  return (
    <div className="flex min-w-[18rem] flex-1 flex-col gap-3 rounded-card border border-edge p-3">
      <p className="text-sm font-medium text-fg">{label}</p>

      <Select
        label={t.stageChartAxisKind}
        value={axis.mode}
        onChange={(e) =>
          // Switching the mode does not erase what was typed in the other one:
          // a reader comparing a property against an index toggles back and
          // forth, and only `mode` decides what is sent.
          onChange({ ...axis, mode: e.target.value as ChartAxisState["mode"] })
        }
      >
        <SelectOption value="property">{t.stageChartAxisProperty}</SelectOption>
        <SelectOption value="expression">{t.stageChartAxisExpression}</SelectOption>
      </Select>

      {axis.mode === "property" ? (
        <Select
          label={t.property}
          value={axis.propertySlug}
          onChange={(e) => onChange({ ...axis, propertySlug: e.target.value })}
        >
          <SelectOption value="">{t.selectProperty}</SelectOption>
          {properties.map((p) => (
            <SelectOption key={p.slug} value={p.slug}>
              {p.name}
            </SelectOption>
          ))}
        </Select>
      ) : (
        <Input
          label={t.stageChartExpression}
          value={axis.expression}
          placeholder={t.stageChartExpressionPlaceholder}
          hint={t.stageChartExpressionHint}
          onChange={(e) => onChange({ ...axis, expression: e.target.value })}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <Input
          label={t.stageChartMin}
          className="min-w-[8rem] flex-1"
          inputMode="decimal"
          value={axis.min}
          onChange={(e) => onChange({ ...axis, min: e.target.value })}
        />
        <Input
          label={t.stageChartMax}
          className="min-w-[8rem] flex-1"
          inputMode="decimal"
          value={axis.max}
          onChange={(e) => onChange({ ...axis, max: e.target.value })}
        />
      </div>
      <p className="text-sm text-fg-muted">{boundsHint}</p>
    </div>
  );
}

function TreeStageFields({
  stage,
  classes,
  label,
  onChange,
}: {
  stage: Extract<StageState, { kind: "tree" }>;
  classes: { slug: string; name: string }[];
  label: string;
  onChange: (stage: StageState) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SlugMultiSelect
        label={label}
        hint={t.stageClassesHint}
        options={classes}
        selected={stage.classSlugs}
        onChange={(classSlugs) => onChange({ ...stage, classSlugs })}
      />

      <Checkbox
        label={t.stageIncludeDescendants}
        checked={stage.includeDescendants}
        onChange={(e) => onChange({ ...stage, includeDescendants: e.target.checked })}
        hint={t.stageIncludeDescendantsHint}
      />

      {stage.classSlugs.length === 0 && (
        <p className="text-sm text-fg-muted">{t.stageNoClasses}</p>
      )}
    </div>
  );
}
