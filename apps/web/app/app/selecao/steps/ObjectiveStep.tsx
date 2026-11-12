"use client";

import { useCallback, useMemo, useState, type Dispatch } from "react";
import {
  Alert,
  Button,
  ButtonGroup,
  ButtonGroupItem,
  Checkbox,
  Combobox,
  Disclosure,
  GuidedBlock,
  Input,
  Select,
  SelectOption,
} from "@/components/ui";
import { IconArrowRight, IconPlus, IconTrash } from "@/components/ui/icons";
import { AhpMatrixInput, type AhpCriterionRef } from "@/components/selection/AhpMatrixInput";
import { IndexCard, IndexPicker, type IndexDescriptor } from "@/components/selection/IndexCard";
import { ExpressionBuilder } from "@/components/expression/ExpressionBuilder";
import { WeightBudget } from "@/components/selection/WeightBudget";
import { parseWeightInput } from "@/lib/selection/weightsGate";
import { ptBR } from "@/lib/i18n";
import type {
  Goal,
  IndexIn,
  NormalizationMethod,
  PerformanceIndex,
  WeightsPreview,
} from "@/lib/types";
import { FIELD_IDS } from "../runReadiness";
import { nextCriterionId, type CriterionRow, type WizardAction, type WizardState } from "../wizardState";

const t = ptBR.selection;

export interface CriterionOption {
  slug: string;
  name: string;
  variable: string;
}

/**
 * Step 2 (D-88): the objective — the index first ("Nenhum índice" is a valid
 * answer), then criteria and weights, one decision at a time (D-85). A decided
 * block folds into its summary with "Alterar", and nothing typed in it is lost.
 */
export function ObjectiveStep({
  state,
  dispatch,
  indices,
  criterionOptions,
  activeIndex,
  indexDescriptor,
  onValidate,
  validating,
  weights,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
  indices: PerformanceIndex[];
  criterionOptions: CriterionOption[];
  activeIndex: IndexIn | null;
  indexDescriptor: IndexDescriptor | null;
  onValidate: () => void;
  validating: boolean;
  weights: { preview: WeightsPreview | null; pending: boolean; failed: boolean };
}) {
  const isProcessStudy = state.universe === "process";
  const { criteria, method } = state;
  // The rows as they were before a suggestion was applied, for "Desfazer".
  const [beforeSuggestion, setBeforeSuggestion] = useState<CriterionRow[] | null>(null);
  const setCriteria = (next: CriterionRow[]) => dispatch({ type: "criteria", criteria: next });
  const indexIsCriterion = criteria.some((c) => c.key === "__index__");

  const indexSummary = activeIndex
    ? t.indexChosen(activeIndex.name ?? t.customIndex, activeIndex.goal === "maximize")
    : t.noIndexChosen;

  // Only the criteria that already name a property (or the index) are worth
  // comparing pairwise — an empty row has nothing for AHP to weigh.
  const ahpCriteria = useMemo<AhpCriterionRef[]>(
    () =>
      criteria
        .filter((c) => c.key)
        .map((c) => ({
          key: c.key,
          label:
            c.key === "__index__"
              ? t.useIndexCriterion
              : criterionOptions.find((p) => p.slug === c.key)?.name ?? c.key,
        })),
    [criteria, criterionOptions],
  );

  // A functional update keeps this callback referentially stable, which is what
  // lets AhpMatrixInput's own effect key on it without re-firing every keystroke.
  const applyAhpWeights = useCallback(
    (derived: Record<string, number>) => {
      dispatch({
        type: "criteria",
        criteria: (current) =>
          current.map((c) => {
            const weight = derived[c.key];
            return weight === undefined ? c : { ...c, weight: weight.toFixed(4) };
          }),
      });
    },
    [dispatch],
  );

  function applyWeightSuggestion(suggested: number[]) {
    setBeforeSuggestion(criteria);
    setCriteria(
      criteria.map((c, i) => {
        const weight = suggested[i];
        // Written back as the reader would type it: a decimal comma, no
        // grouping — the input parses it again, exactly.
        return weight === undefined ? c : { ...c, weight: String(weight).replace(".", ",") };
      }),
    );
  }

  const criterionLabel = (key: string | null): string => {
    if (!key) return t.weights.noCriterion;
    if (key === "__index__") return activeIndex?.name ?? t.useIndexCriterion;
    return criterionOptions.find((p) => p.slug === key)?.name ?? key;
  };

  return (
    <div className="space-y-4">
      <div id={FIELD_IDS.indexBlock}>
        <GuidedBlock
          headingLevel={2}
          title={t.indexBlockTitle}
          state={state.indexConfirmed ? "done" : "active"}
          summary={indexSummary}
          onEdit={() => dispatch({ type: "indexConfirmed", confirmed: false })}
        >
          <div className="space-y-3">
            {isProcessStudy && <Alert tone="info">{t.processIndexNote}</Alert>}
            <IndexPicker
              indices={isProcessStudy ? [] : indices}
              value={state.indexMode}
              onChange={(mode) => dispatch({ type: "indexMode", mode })}
              hint={t.objectiveHint}
              customSlot={
                <div id={FIELD_IDS.indexExpression}>
                  {/* D-191: the visual calculator; the grammar text stays
                      behind the scenes and reaches the reader only in "Digitar". */}
                  <ExpressionBuilder
                    label={t.expression}
                    universe={isProcessStudy ? "process" : "material"}
                    value={state.customExpression}
                    onChange={(expression) => dispatch({ type: "customExpression", expression })}
                  />
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <Select
                      label={t.goal}
                      className="w-40"
                      value={state.indexGoal}
                      onChange={(e) => dispatch({ type: "indexGoal", goal: e.target.value as Goal })}
                    >
                      <SelectOption value="maximize">{t.maximize}</SelectOption>
                      <SelectOption value="minimize">{t.minimize}</SelectOption>
                    </Select>
                    {/* `/selection/index` evaluates over materials only, so in
                        a process study its sole outcome would be a 400. */}
                    {!isProcessStudy && (
                      <Button onClick={onValidate} loading={validating}>
                        {t.validate}
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    {isProcessStudy ? t.expressionCheckedOnRun : t.expressionHint}
                  </p>
                </div>
              }
            />
            {state.validation && <p className="text-xs text-ink-muted">{state.validation}</p>}
            {/* The conditions of validity, shown without asking for a click —
                an index that does not fit the problem is worse than no index. */}
            {indexDescriptor && <IndexCard index={indexDescriptor} />}
            <Button
              variant="primary"
              icon={<IconArrowRight />}
              onClick={() => dispatch({ type: "indexConfirmed", confirmed: true })}
            >
              {t.continueToCriteria}
            </Button>
          </div>
        </GuidedBlock>
      </div>
      {/* The index's conditions of validity stay on screen after the block
          folds (D-25): the reader must not need a click to see why. */}
      {state.indexConfirmed && indexDescriptor && <IndexCard index={indexDescriptor} />}

      <div id={FIELD_IDS.criteriaBlock}>
        <GuidedBlock
          headingLevel={2}
          title={t.criteriaBlockTitle}
          state={state.indexConfirmed ? "active" : "locked"}
          lockedReason={t.indexLockedReason}
        >
          <div className="space-y-3">
            <p className="text-xs text-ink-muted">{t.rankingHint}</p>
            {/* A non-default method stays visible with the section closed: a
                collapsed section never hides what is already in use (D-85). */}
            {!state.advObjective && method !== "weighted_sum" && (
              <p className="text-xs text-ink-muted">
                {t.methodInUse(method === "topsis" ? t.methodTopsis : t.methodPromethee)}
              </p>
            )}
            {criteria.map((c, position) => (
              <fieldset key={c.id} className="flex flex-wrap items-end gap-3">
                <legend className="sr-only">
                  {t.criterion} {position + 1}
                </legend>
                {/* D-85: a search field, and a key already used by another row
                    is not offered — the backend would count it twice. */}
                <div id={FIELD_IDS.criterion(c.id)}>
                  <Combobox
                    label={t.criterion}
                    hint={position === 0 ? t.criterionHint : undefined}
                    className="w-64"
                    value={c.key}
                    placeholder={t.selectCriterion}
                    options={[
                      ...(activeIndex ? [{ value: "__index__", label: t.useIndexCriterion }] : []),
                      ...criterionOptions.map((p) => ({
                        value: p.slug,
                        label: p.name,
                        keywords: [p.slug],
                      })),
                    ].filter((o) => o.value === c.key || !criteria.some((x) => x.key === o.value))}
                    onChange={(key) =>
                      setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, key } : x)))
                    }
                  />
                </div>
                <Select
                  label={t.direction}
                  hint={position === 0 ? t.directionHint : undefined}
                  className="w-52"
                  value={c.direction}
                  onChange={(e) =>
                    setCriteria(
                      criteria.map((x) =>
                        x.id === c.id ? { ...x, direction: e.target.value as "" | "max" | "min" } : x,
                      ),
                    )
                  }
                >
                  <SelectOption value="">{t.autoDirection}</SelectOption>
                  <SelectOption value="max">{t.dirMax}</SelectOption>
                  <SelectOption value="min">{t.dirMin}</SelectOption>
                </Select>
                <Input
                  id={FIELD_IDS.weight(c.id)}
                  label={t.weight}
                  hint={position === 0 ? t.weightHint : undefined}
                  className="w-40 tabular-nums"
                  inputMode="decimal"
                  value={c.weight}
                  error={parseWeightInput(c.weight) === "invalid" ? t.weights.invalidNumber : undefined}
                  onChange={(e) => {
                    setBeforeSuggestion(null);
                    setCriteria(criteria.map((x) => (x.id === c.id ? { ...x, weight: e.target.value } : x)));
                  }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<IconTrash />}
                  onClick={() => setCriteria(criteria.filter((x) => x.id !== c.id))}
                >
                  {ptBR.actions.remove}
                </Button>
              </fieldset>
            ))}
            <Button
              icon={<IconPlus />}
              onClick={() =>
                setCriteria([
                  ...criteria,
                  {
                    id: nextCriterionId(),
                    key: activeIndex && !indexIsCriterion ? "__index__" : "",
                    direction: "",
                    // The first criterion is the whole budget; the next ones
                    // start blank, so the table says what is left instead of
                    // a total that silently went to 2 (D-87).
                    weight: criteria.length === 0 ? "1" : "",
                  },
                ])
              }
            >
              {t.addCriterion}
            </Button>

            {criteria.length > 0 && (
              <WeightBudget
                preview={weights.preview}
                pending={weights.pending}
                failed={weights.failed}
                labelOf={criterionLabel}
                onApplySuggestion={applyWeightSuggestion}
                onUndo={
                  beforeSuggestion
                    ? () => {
                        setCriteria(beforeSuggestion);
                        setBeforeSuggestion(null);
                      }
                    : null
                }
              />
            )}

            <Disclosure
              summary={ptBR.ui.advancedOptions}
              open={state.advObjective}
              onOpenChange={(open) => dispatch({ type: "advanced", section: "objective", open })}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-ink-muted">{t.method}</span>
                    <ButtonGroup label={t.method}>
                      <ButtonGroupItem
                        selected={method === "weighted_sum"}
                        label={t.methodWeightedSum}
                        onClick={() => dispatch({ type: "method", method: "weighted_sum" })}
                      />
                      <ButtonGroupItem
                        selected={method === "topsis"}
                        label={t.methodTopsis}
                        onClick={() => dispatch({ type: "method", method: "topsis" })}
                      />
                      <ButtonGroupItem
                        selected={method === "promethee"}
                        label={t.methodPromethee}
                        onClick={() => dispatch({ type: "method", method: "promethee" })}
                      />
                    </ButtonGroup>
                    <span className="text-2xs text-ink-subtle">{t.methodFieldHint}</span>
                  </div>
                  {/* Normalization only means something for weighted_sum —
                      TOPSIS and PROMETHEE fix their own internally. */}
                  {method === "weighted_sum" && (
                    <Select
                      label={t.normalization}
                      hint={t.normalizationHint}
                      className="w-56"
                      value={state.normalization}
                      onChange={(e) =>
                        dispatch({
                          type: "normalization",
                          normalization: e.target.value as NormalizationMethod,
                        })
                      }
                    >
                      <SelectOption value="minmax">{t.normMinmax}</SelectOption>
                      <SelectOption value="vector">{t.normVector}</SelectOption>
                    </Select>
                  )}
                </div>
                {method !== "weighted_sum" && <p className="text-xs text-ink-muted">{t.methodHint}</p>}
                {/* AHP derives weights; it never becomes a fourth `method` — so
                    it only shows up here, next to the weight fields it feeds. */}
                {method === "weighted_sum" && (
                  <div className="space-y-3 border-t border-edge pt-3">
                    <Checkbox
                      label={t.ahp.toggle}
                      hint={t.ahp.toggleHint}
                      checked={state.useAhp}
                      onChange={(e) => dispatch({ type: "useAhp", value: e.target.checked })}
                    />
                    {state.useAhp && <AhpMatrixInput criteria={ahpCriteria} onDerived={applyAhpWeights} />}
                  </div>
                )}
              </div>
            </Disclosure>
          </div>
        </GuidedBlock>
      </div>
    </div>
  );
}
