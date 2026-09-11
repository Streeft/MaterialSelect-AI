"use client";

import type { ReactNode } from "react";
import type {
  Combinator,
  ConstraintGroupIn,
  ConstraintIn,
  ConstraintOperator,
  ProcessAttribute,
  PropertyDefinition,
  SelectionUniverse,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { prettyUnit } from "@/lib/format";
import {
  Button,
  ButtonGroup,
  ButtonGroupItem,
  CONTROL,
  Card,
  CardBody,
  Field,
  IconButton,
  Input,
  Select,
  SelectOption,
  useWiring,
} from "@/components/ui";
import { IconClose, IconPlus, IconTrash } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

const t = ptBR.selection;

/**
 * `md-outlined-select` never grew a multi-selection mode (confirmed reading
 * `select.js`: "md-select only supports single selection") — the class
 * filter below is the one control in the app that needs it, so it stays on
 * the native `<select multiple>` this whole file used to build everything
 * from. An explicit exception, not a silent gap — see the M3 migration plan.
 */
function ClassMultiSelect({
  id,
  value,
  onChange,
  className,
  children,
}: {
  id?: string;
  value: string[];
  onChange: (values: string[]) => void;
  className?: string;
  children: ReactNode;
}) {
  const w = useWiring(id);
  return (
    <select
      id={w.id}
      multiple
      aria-describedby={w.describedBy}
      aria-invalid={w.invalid || undefined}
      value={value}
      onChange={(e) => onChange(Array.from(e.target.selectedOptions, (o) => o.value))}
      className={cn(CONTROL, "h-24", className)}
    >
      {children}
    </select>
  );
}

/**
 * What a constraint row can select on, in either universe (P0-4).
 *
 * A material property and a process attribute are separate tables on purpose —
 * so a material picker can never offer "faixa de massa" — but the *editor* asks
 * one question of both: what is it called, what unit is it in, and what shape is
 * its value. `PropertyDefinition` satisfies this structurally; only a process
 * attribute carries `kind` and `allowed_labels`, and a row reads them to decide
 * whether to draw a number field or a label picker.
 */
export interface SelectableAttribute {
  slug: string;
  name: string;
  canonical_unit: string | null;
  kind?: ProcessAttribute["kind"];
  allowed_labels?: string[];
}

/**
 * What the `in_class` picker lists — a folder of whichever taxonomy the study's
 * universe uses (P0-4).
 *
 * The minimal shape on purpose: `in_class` compares the record's *own* class
 * slug, and in a process study that slug is a process family. Typing this as
 * `MaterialClass` would have made the picker refuse the taxonomy it is supposed
 * to show, which is what the type checker caught here.
 */
export interface SelectableFolder {
  slug: string;
  name: string;
}

/** Local editable shape for one constraint (values kept as strings for inputs). */
export interface ConstraintRow {
  id: string;
  operator: ConstraintOperator;
  property_slug: string;
  value: string;
  value_min: string;
  value_max: string;
  unit: string;
  class_slugs: string[];
  text: string;
  /** The labels a discrete criterion names (P0-4). */
  labels: string[];
}

export function emptyConstraint(id: string): ConstraintRow {
  return {
    id,
    operator: "lte",
    property_slug: "",
    value: "",
    value_min: "",
    value_max: "",
    unit: "",
    class_slugs: [],
    text: "",
    labels: [],
  };
}

/**
 * Local editable shape for one node of the nested AND/OR constraint tree
 * (M6) — mirrors the backend's `ConstraintGroupIn` (see
 * `apps/api/app/schemas/selection.py`), with `ConstraintRow`'s string-typed
 * inputs standing in for `ConstraintIn` until `toConstraintPayload` below
 * parses them.
 */
export interface ConstraintGroupState {
  id: string;
  operator: Combinator;
  constraints: ConstraintRow[];
  groups: ConstraintGroupState[];
}

export function emptyGroup(id: string, operator: Combinator = "AND"): ConstraintGroupState {
  return { id, operator, constraints: [], groups: [] };
}

const OPERATORS: ConstraintOperator[] = [
  "gte",
  "gt",
  "lte",
  "lt",
  "between",
  "outside",
  "exists",
  "not_exists",
  "in_class",
  "not_in_class",
  "text_contains",
];

/**
 * The two set-membership operators, offered only in a process study (P0-4).
 *
 * Not a simplification: no material property is discrete, so in a material study
 * these two could only ever be picked and then refused by the backend. Offering
 * an option that cannot work is the same defect as hiding one that can.
 */
export const LABEL_OPERATORS: ConstraintOperator[] = ["has_any_label", "has_no_label"];

const NUMERIC = new Set<ConstraintOperator>(["gt", "gte", "lt", "lte", "between", "outside"]);
const LABEL_OPS = new Set<ConstraintOperator>(LABEL_OPERATORS);
const NEEDS_PROPERTY = new Set<ConstraintOperator>([
  "gt", "gte", "lt", "lte", "between", "outside", "exists", "not_exists",
  "has_any_label", "has_no_label",
]);
const CLASS_OPS = new Set<ConstraintOperator>(["in_class", "not_in_class"]);

/** True when an attribute holds labels rather than a magnitude. */
function isDiscrete(attribute: SelectableAttribute | undefined): boolean {
  return attribute?.kind === "DISCRETO";
}

/**
 * The attributes an operator can actually compare.
 *
 * A number cannot be compared against a shape and a shape has no order, so the
 * picker offers only what the chosen operator can answer. The backend refuses
 * the other combination anyway (with the reason written); this is what stops the
 * reader from composing it in the first place. `exists`/`not_exists` ask about
 * presence, which every shape of value has.
 */
export function selectableFor(
  operator: ConstraintOperator,
  attributes: SelectableAttribute[],
): SelectableAttribute[] {
  if (LABEL_OPS.has(operator)) return attributes.filter(isDiscrete);
  if (NUMERIC.has(operator)) return attributes.filter((a) => !isDiscrete(a));
  return attributes;
}

// --- Tree helpers ------------------------------------------------------------
//
// The tree is edited immutably from the top (`ConstraintEditor` is the only
// component holding `onChange`), so every mutation below walks the whole
// `ConstraintGroupState` and returns a new one. Row and group ids are unique
// across the tree (`nextEditorId` below), so a constraint or group can be
// found and updated by id alone — no path bookkeeping needed.

let editorIdCounter = 0;
/**
 * The one id source for every row/group in the constraint tree.
 *
 * `page.tsx` used to keep its own, separately-seeded counter for the ids it
 * mints directly (the initial root, `loadStudy`, `applySuggestions`) — two
 * counters that both started at 0 and produced identically-shaped
 * `row-N`/`group-N` strings could (and did) collide, silently making
 * `updateConstraintById`/`removeConstraintById` below act on two unrelated
 * rows at once (they match *every* row with a given id, by design — the
 * uniqueness is what was supposed to make that safe). Exporting this one
 * function, and having `page.tsx` use it too instead of its own generator,
 * is what actually guarantees the uniqueness the comment above claims.
 */
export function nextEditorId(prefix: string): string {
  return `${prefix}-${editorIdCounter++}`;
}

function updateGroupById(
  group: ConstraintGroupState,
  groupId: string,
  fn: (g: ConstraintGroupState) => ConstraintGroupState,
): ConstraintGroupState {
  const next = group.id === groupId ? fn(group) : group;
  return { ...next, groups: next.groups.map((g) => updateGroupById(g, groupId, fn)) };
}

function removeGroupById(group: ConstraintGroupState, groupId: string): ConstraintGroupState {
  return {
    ...group,
    groups: group.groups
      .filter((g) => g.id !== groupId)
      .map((g) => removeGroupById(g, groupId)),
  };
}

function updateConstraintById(
  group: ConstraintGroupState,
  rowId: string,
  patch: Partial<ConstraintRow>,
): ConstraintGroupState {
  return {
    ...group,
    constraints: group.constraints.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    groups: group.groups.map((g) => updateConstraintById(g, rowId, patch)),
  };
}

function removeConstraintById(group: ConstraintGroupState, rowId: string): ConstraintGroupState {
  return {
    ...group,
    constraints: group.constraints.filter((r) => r.id !== rowId),
    groups: group.groups.map((g) => removeConstraintById(g, rowId)),
  };
}

// --- One constraint row ------------------------------------------------------

function ConstraintRowFields({
  row,
  rowLabel,
  properties,
  classes,
  universe,
  onUpdate,
  onRemove,
}: {
  row: ConstraintRow;
  rowLabel: string;
  properties: SelectableAttribute[];
  classes: SelectableFolder[];
  universe: SelectionUniverse;
  onUpdate: (patch: Partial<ConstraintRow>) => void;
  onRemove: () => void;
}) {
  const isNumeric = NUMERIC.has(row.operator);
  const isRange = row.operator === "between" || row.operator === "outside";
  const isLabelOp = LABEL_OPS.has(row.operator);
  const prop = properties.find((p) => p.slug === row.property_slug);
  const isProcessStudy = universe === "process";
  const operators = isProcessStudy ? [...OPERATORS, ...LABEL_OPERATORS] : OPERATORS;
  const offered = selectableFor(row.operator, properties);

  return (
    <Card as="fieldset">
      {/* The number is the row's name for a reader who cannot see that
          these controls are grouped in a box. A legend has to be the
          fieldset's first child to be read as its caption. */}
      <legend className="sr-only">{rowLabel}</legend>
      <CardBody className="flex flex-wrap items-end gap-3">
        <Select
          label={t.operator}
          className="w-48"
          value={row.operator}
          onChange={(e) => onUpdate({ operator: e.target.value as ConstraintOperator })}
        >
          {operators.map((op) => (
            <SelectOption key={op} value={op}>
              {t.operators[op]}
            </SelectOption>
          ))}
        </Select>

        {NEEDS_PROPERTY.has(row.operator) && (
          <Select
            label={isProcessStudy ? t.attribute : t.property}
            className="w-56"
            value={row.property_slug}
            onChange={(e) =>
              // Changing the attribute drops the labels that belonged to the old
              // one: a vocabulary is per-attribute, so carrying them over would
              // send labels the new attribute has never heard of.
              onUpdate({ property_slug: e.target.value, labels: [] })
            }
          >
            <SelectOption value="">
              {isProcessStudy ? t.selectAttribute : t.selectProperty}
            </SelectOption>
            {offered.map((p) => (
              <SelectOption key={p.slug} value={p.slug}>
                {p.name}
              </SelectOption>
            ))}
          </Select>
        )}

        {/* Text input with a decimal keypad, not `type="number"`: a
            pt-BR reader types "2,7", and a number input silently
            discards the value it cannot parse. The payload builder
            accepts both separators. */}
        {isNumeric && !isRange && (
          <Input
            label={t.value}
            className="w-28 tabular-nums"
            inputMode="decimal"
            value={row.value}
            onChange={(e) => onUpdate({ value: e.target.value })}
          />
        )}
        {isRange && (
          <>
            <Input
              label={t.valueMin}
              className="w-28 tabular-nums"
              inputMode="decimal"
              value={row.value_min}
              onChange={(e) => onUpdate({ value_min: e.target.value })}
            />
            <Input
              label={t.valueMax}
              className="w-28 tabular-nums"
              inputMode="decimal"
              value={row.value_max}
              onChange={(e) => onUpdate({ value_max: e.target.value })}
            />
          </>
        )}
        {isNumeric && (
          // The unit is not decoration: an empty box means "canonical",
          // and the placeholder is the only place that says which one.
          <Input
            label={t.unit}
            hint={prop?.canonical_unit ? prettyUnit(prop.canonical_unit) : undefined}
            className="w-28"
            value={row.unit}
            onChange={(e) => onUpdate({ unit: e.target.value })}
            placeholder={prop?.canonical_unit ?? ""}
          />
        )}

        {CLASS_OPS.has(row.operator) && (
          <Field label={t.classes} className="w-56">
            <ClassMultiSelect
              value={row.class_slugs}
              onChange={(values) => onUpdate({ class_slugs: values })}
            >
              {classes.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </ClassMultiSelect>
          </Field>
        )}

        {isLabelOp && (
          <Field
            label={t.labels}
            className="w-56"
            hint={prop ? undefined : t.labelsPickAttributeFirst}
          >
            <ClassMultiSelect
              value={row.labels}
              onChange={(values) => onUpdate({ labels: values })}
            >
              {(prop?.allowed_labels ?? []).map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </ClassMultiSelect>
          </Field>
        )}

        {row.operator === "text_contains" && (
          <Input
            label={t.text}
            className="w-56"
            value={row.text}
            onChange={(e) => onUpdate({ text: e.target.value })}
          />
        )}

        <IconButton
          className="ml-auto"
          size="sm"
          label={`${ptBR.actions.remove}: ${rowLabel}`}
          icon={<IconTrash />}
          onClick={onRemove}
        />
      </CardBody>
    </Card>
  );
}

// --- Group operator toggle ---------------------------------------------------

/**
 * "E"/"OU" as a two-seat segmented control, not a `<select>`: at the depth a
 * nested group toggle sits, a dropdown reads heavier than the choice it
 * makes. It doubles as the group's "abrir parêntese" — the small control at
 * the boundary's top-left corner that names how this group combines with
 * its neighbors.
 */
function OperatorToggle({
  value,
  onChange,
  label,
}: {
  value: Combinator;
  onChange: (op: Combinator) => void;
  label: string;
}) {
  return (
    <ButtonGroup label={label}>
      <ButtonGroupItem
        selected={value === "AND"}
        label={t.operatorAnd}
        onClick={() => onChange("AND")}
      />
      <ButtonGroupItem
        selected={value === "OR"}
        label={t.operatorOr}
        onClick={() => onChange("OR")}
      />
    </ButtonGroup>
  );
}

// --- One group (recursive) ---------------------------------------------------

interface GroupActions {
  updateOperator: (groupId: string, operator: Combinator) => void;
  addConstraint: (groupId: string) => void;
  addGroup: (groupId: string) => void;
  removeGroup: (groupId: string) => void;
  updateConstraint: (rowId: string, patch: Partial<ConstraintRow>) => void;
  removeConstraint: (rowId: string) => void;
}

function ConstraintGroupEditor({
  group,
  isRoot,
  groupLabel,
  properties,
  universe,
  classes,
  actions,
}: {
  group: ConstraintGroupState;
  isRoot: boolean;
  groupLabel: string;
  properties: SelectableAttribute[];
  universe: SelectionUniverse;
  classes: SelectableFolder[];
  actions: GroupActions;
}) {
  const isEmpty = group.constraints.length === 0 && group.groups.length === 0;

  return (
    <div
      className={cn(
        "space-y-3",
        // The border is the boundary of a group with its own AND/OR — the
        // one D-34 calls information, not a decorative divider — so it is
        // `border-edge-control`, not the `border-edge` a plain card uses.
        !isRoot && "rounded-card border border-edge-control bg-surface-raised p-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {isRoot ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">{t.combinator}</span>
            <OperatorToggle
              value={group.operator}
              onChange={(op) => actions.updateOperator(group.id, op)}
              label={t.combinator}
            />
          </div>
        ) : (
          <>
            <OperatorToggle
              value={group.operator}
              onChange={(op) => actions.updateOperator(group.id, op)}
              label={`${t.groupOperatorLabel}: ${groupLabel}`}
            />
            <IconButton
              className="ml-auto"
              size="sm"
              label={`${t.removeGroup}: ${groupLabel}`}
              icon={<IconClose />}
              onClick={() => actions.removeGroup(group.id)}
            />
          </>
        )}
      </div>

      {isEmpty && (
        <p className="text-sm text-ink-muted">{isRoot ? t.noConstraints : t.emptyGroup}</p>
      )}

      {group.constraints.length > 0 && (
        <ol className="space-y-3">
          {group.constraints.map((row, position) => {
            const rowLabel = t.constraintNumber(position + 1);
            return (
              <li key={row.id}>
                <ConstraintRowFields
                  row={row}
                  rowLabel={rowLabel}
                  properties={properties}
                  universe={universe}
                  classes={classes}
                  onUpdate={(patch) => actions.updateConstraint(row.id, patch)}
                  onRemove={() => actions.removeConstraint(row.id)}
                />
              </li>
            );
          })}
        </ol>
      )}

      {group.groups.length > 0 && (
        <ol className="space-y-3 pl-4">
          {group.groups.map((child, position) => (
            <li key={child.id}>
              <ConstraintGroupEditor
                group={child}
                isRoot={false}
                groupLabel={t.groupNumber(position + 1)}
                properties={properties}
                universe={universe}
                classes={classes}
                actions={actions}
              />
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-wrap gap-2 pl-4">
        <Button
          size="sm"
          variant="secondary"
          icon={<IconPlus />}
          onClick={() => actions.addConstraint(group.id)}
        >
          {t.addConstraint}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<IconPlus />}
          onClick={() => actions.addGroup(group.id)}
        >
          {t.addGroup}
        </Button>
      </div>
    </div>
  );
}

// --- Root component -----------------------------------------------------------

interface Props {
  root: ConstraintGroupState;
  properties: SelectableAttribute[];
  /**
   * Which universe the study returns (P0-4). It decides which catalogue the
   * rows select on and whether the two set-membership operators exist at all.
   */
  universe?: SelectionUniverse;
  classes: SelectableFolder[];
  onChange: (root: ConstraintGroupState) => void;
}

export function ConstraintEditor({ root, properties, classes, universe = "material", onChange }: Props) {
  const actions: GroupActions = {
    updateOperator: (groupId, operator) =>
      onChange(updateGroupById(root, groupId, (g) => ({ ...g, operator }))),
    addConstraint: (groupId) =>
      onChange(
        updateGroupById(root, groupId, (g) => ({
          ...g,
          constraints: [...g.constraints, emptyConstraint(nextEditorId("row"))],
        })),
      ),
    addGroup: (groupId) =>
      onChange(
        updateGroupById(root, groupId, (g) => ({
          ...g,
          groups: [...g.groups, emptyGroup(nextEditorId("group"))],
        })),
      ),
    removeGroup: (groupId) => onChange(removeGroupById(root, groupId)),
    updateConstraint: (rowId, patch) => onChange(updateConstraintById(root, rowId, patch)),
    removeConstraint: (rowId) => onChange(removeConstraintById(root, rowId)),
  };

  return (
    <ConstraintGroupEditor
      group={root}
      isRoot
      groupLabel={t.groupNumber(1)}
      properties={properties}
      universe={universe}
      classes={classes}
      actions={actions}
    />
  );
}

// --- Payload -------------------------------------------------------------------

/** Convert one editable row into its API `ConstraintIn` payload, or `null`
 * when it is not filled in enough to send. */
function rowToConstraintIn(r: ConstraintRow): ConstraintIn | null {
  const num = (s: string): number | null => {
    const v = Number(s.replace(",", "."));
    return s.trim() !== "" && Number.isFinite(v) ? v : null;
  };
  if (NUMERIC.has(r.operator)) {
    if (!r.property_slug) return null;
    if (r.operator === "between" || r.operator === "outside") {
      const mn = num(r.value_min);
      const mx = num(r.value_max);
      if (mn === null || mx === null) return null;
      return {
        operator: r.operator,
        property_slug: r.property_slug,
        value_min: mn,
        value_max: mx,
        unit: r.unit.trim() || null,
      };
    }
    const v = num(r.value);
    if (v === null) return null;
    return {
      operator: r.operator,
      property_slug: r.property_slug,
      value: v,
      unit: r.unit.trim() || null,
    };
  }
  if (r.operator === "exists" || r.operator === "not_exists") {
    return r.property_slug ? { operator: r.operator, property_slug: r.property_slug } : null;
  }
  if (r.operator === "in_class" || r.operator === "not_in_class") {
    return r.class_slugs.length ? { operator: r.operator, class_slugs: r.class_slugs } : null;
  }
  if (LABEL_OPS.has(r.operator)) {
    // Both halves are required: the attribute says which vocabulary, the labels
    // say which of it. A row missing either is not sendable — the backend would
    // refuse it, and a half-written row is not a criterion the reader stated.
    return r.property_slug && r.labels.length
      ? { operator: r.operator, property_slug: r.property_slug, labels: r.labels }
      : null;
  }
  return r.text.trim() ? { operator: r.operator, text: r.text.trim() } : null;
}

/**
 * Convert the editor's tree into the API's `ConstraintGroupIn` shape (M6),
 * recursively — skipping constraint rows that are not filled in enough to
 * send, at every level, exactly like the flat builder used to.
 */
export function toConstraintPayload(group: ConstraintGroupState): ConstraintGroupIn {
  return {
    operator: group.operator,
    constraints: group.constraints
      .map(rowToConstraintIn)
      .filter((c): c is ConstraintIn => c !== null),
    groups: group.groups.map(toConstraintPayload),
  };
}

/** How many sendable constraints a `ConstraintGroupIn` tree carries, at any depth. */
/**
 * Rebuild the editable tree from a persisted `ConstraintGroupIn` — the inverse
 * of `toConstraintPayload`.
 *
 * Reopening a saved study used to flatten it: `StudyOut` only carried a flat
 * constraint list, so the parentheses of a nested study were silently lost.
 * With P0-1 the stage carries its real `root_group`, and this is what turns it
 * back into something editable, nesting included.
 */
export function fromConstraintPayload(group: ConstraintGroupIn): ConstraintGroupState {
  return {
    id: nextEditorId("group"),
    operator: group.operator,
    constraints: group.constraints.map((c) => ({
      ...emptyConstraint(nextEditorId("row")),
      operator: c.operator,
      property_slug: c.property_slug ?? "",
      value: c.value?.toString() ?? "",
      value_min: c.value_min?.toString() ?? "",
      value_max: c.value_max?.toString() ?? "",
      unit: c.unit ?? "",
      class_slugs: c.class_slugs ?? [],
      text: c.text ?? "",
      labels: c.labels ?? [],
    })),
    groups: group.groups.map(fromConstraintPayload),
  };
}

export function countConstraints(group: ConstraintGroupIn): number {
  return group.constraints.length + group.groups.reduce((sum, g) => sum + countConstraints(g), 0);
}
