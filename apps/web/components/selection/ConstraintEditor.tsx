"use client";

import type { ReactNode } from "react";
import type {
  Combinator,
  ConstraintGroupIn,
  ConstraintIn,
  ConstraintOperator,
  MaterialClass,
  PropertyDefinition,
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

const NUMERIC = new Set<ConstraintOperator>(["gt", "gte", "lt", "lte", "between", "outside"]);
const NEEDS_PROPERTY = new Set<ConstraintOperator>([
  "gt", "gte", "lt", "lte", "between", "outside", "exists", "not_exists",
]);
const CLASS_OPS = new Set<ConstraintOperator>(["in_class", "not_in_class"]);

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
  onUpdate,
  onRemove,
}: {
  row: ConstraintRow;
  rowLabel: string;
  properties: PropertyDefinition[];
  classes: MaterialClass[];
  onUpdate: (patch: Partial<ConstraintRow>) => void;
  onRemove: () => void;
}) {
  const isNumeric = NUMERIC.has(row.operator);
  const isRange = row.operator === "between" || row.operator === "outside";
  const prop = properties.find((p) => p.slug === row.property_slug);

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
          {OPERATORS.map((op) => (
            <SelectOption key={op} value={op}>
              {t.operators[op]}
            </SelectOption>
          ))}
        </Select>

        {NEEDS_PROPERTY.has(row.operator) && (
          <Select
            label={t.property}
            className="w-56"
            value={row.property_slug}
            onChange={(e) => onUpdate({ property_slug: e.target.value })}
          >
            <SelectOption value="">{t.selectProperty}</SelectOption>
            {properties.map((p) => (
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
            hint={prop ? prettyUnit(prop.canonical_unit) : undefined}
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
  classes,
  actions,
}: {
  group: ConstraintGroupState;
  isRoot: boolean;
  groupLabel: string;
  properties: PropertyDefinition[];
  classes: MaterialClass[];
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
  properties: PropertyDefinition[];
  classes: MaterialClass[];
  onChange: (root: ConstraintGroupState) => void;
}

export function ConstraintEditor({ root, properties, classes, onChange }: Props) {
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
export function countConstraints(group: ConstraintGroupIn): number {
  return group.constraints.length + group.groups.reduce((sum, g) => sum + countConstraints(g), 0);
}
