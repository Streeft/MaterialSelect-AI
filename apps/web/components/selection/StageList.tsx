"use client";

import type {
  ConstraintGroupIn,
  MaterialClass,
  PropertyDefinition,
  StageIn,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  IconButton,
  Input,
} from "@/components/ui";
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
  onChange: (stages: StageState[]) => void;
}

export function StageList({ stages, properties, classes, onChange }: Props) {
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
                <Badge tone={stage.kind === "tree" ? "info" : "neutral"}>
                  {stage.kind === "tree" ? t.stageKindTree : t.stageKindLimit}
                </Badge>
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

            {stage.kind === "limit" ? (
              <ConstraintEditor
                root={stage.group}
                properties={properties}
                classes={classes}
                onChange={(group) => replace(index, { ...stage, group })}
              />
            ) : (
              <TreeStageFields
                stage={stage}
                classes={classes}
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
      </div>
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
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-fg">{t.stageClasses}</span>
        <select
          multiple
          className="h-32 rounded-control border border-edge-control bg-surface px-2 py-1 text-sm"
          value={stage.classSlugs}
          onChange={(e) =>
            onChange({
              ...stage,
              classSlugs: Array.from(e.target.selectedOptions, (o) => o.value),
            })
          }
        >
          {classes.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-fg-muted">{t.stageClassesHint}</span>
      </label>

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
