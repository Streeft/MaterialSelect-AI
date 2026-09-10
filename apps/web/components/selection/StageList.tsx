"use client";

import type {
  ConstraintGroupIn,
  MaterialClass,
  Process,
  ProcessClass,
  PropertyDefinition,
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
  useWiring,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  ConstraintEditor,
  type ConstraintGroupState,
  emptyGroup,
  nextEditorId,
  toConstraintPayload,
} from "./ConstraintEditor";

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
    };

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
  classes: MaterialClass[];
  /** The process universe (P0-2). Empty while it loads, or if none is catalogued. */
  processes?: Process[];
  processClasses?: ProcessClass[];
  onChange: (stages: StageState[]) => void;
}

export function StageList({
  stages,
  properties,
  classes,
  processes = [],
  processClasses = [],
  onChange,
}: Props) {
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
                properties={properties}
                classes={classes}
                onChange={(group) => replace(index, { ...stage, group })}
              />
            )}
            {stage.kind === "tree" && (
              <TreeStageFields
                stage={stage}
                classes={classes}
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
        <Button size="sm" onClick={() => onChange([...stages, emptyProcessStage()])}>
          + {t.stageAddProcess}
        </Button>
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
};

// Identity tones, not status ones: "success"/"warning" carry meaning elsewhere
// in this interface, and a stage kind is not an outcome.
const STAGE_TONES: Record<StageState["kind"], BadgeTone> = {
  limit: "neutral",
  tree: "info",
  process: "brand",
  material: "info",
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

function TreeStageFields({
  stage,
  classes,
  onChange,
}: {
  stage: Extract<StageState, { kind: "tree" }>;
  classes: MaterialClass[];
  onChange: (stage: StageState) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SlugMultiSelect
        label={t.stageClasses}
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
