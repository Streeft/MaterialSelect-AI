"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LoadCase, SolveResult, SolverObjective } from "@/lib/types";
import { listLoadCases, solveBrief } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import { classVisual } from "@/lib/design/palette";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ClassBadge,
  EmptyState,
  ErrorState,
  LoadingState,
  NumberInput,
  PageHeader,
  Select,
  SelectOption,
  StepCard,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";

const t = ptBR.solver;

/**
 * The starting numbers for a case.
 *
 * A support condition fills its own variable with a catalogued constant, so
 * that variable starts at the first condition's value and is edited through the
 * named choice rather than typed as a bare number — the constant is what makes
 * two identical briefs differ, and a reader has to see which one ran.
 * Everything else starts empty: a pre-filled load or span would be the tool
 * inventing a design brief, which is the one thing it must never do.
 */
function initialInputs(loadCase: LoadCase): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const variable of loadCase.variables) {
    const support = loadCase.supports.find(
      (s) => s.variable_key === variable.key,
    );
    inputs[variable.key] = support ? String(support.value) : "";
  }
  return inputs;
}

function Facet({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption font-semibold text-ink-muted">
        {label}
      </span>
      <span className="text-sm text-ink">{children}</span>
    </div>
  );
}

function CaseFacts({ loadCase }: { loadCase: LoadCase }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-muted">{loadCase.summary}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Facet label={t.facetFunction}>{loadCase.function_label}</Facet>
        {/* Both readings, because the objective is a choice in step 2 now
            (D-65) and naming only the mass here would contradict it. */}
        <Facet label={t.facetObjective}>
          {loadCase.objective_label} {t.facetObjectiveOr}{" "}
          {loadCase.cost_objective_label.toLocaleLowerCase("pt-BR")}
        </Facet>
        <Facet label={t.facetConstraint}>{loadCase.constraint_label}</Facet>
        <Facet label={t.facetFree}>{loadCase.free_variable_label}</Facet>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-caption font-semibold text-ink-muted">
          {t.facetFixed}
        </span>
        <div className="flex flex-wrap gap-1">
          {loadCase.fixed_labels.map((label) => (
            <Badge key={label}>{label}</Badge>
          ))}
        </div>
      </div>

      {/* D-91: two readings side by side, split by a hairline — not two boxes
          inside the card. */}
      <div className="subsection grid gap-4 md:grid-cols-2 md:divide-x md:divide-line-divider md:[&>*+*]:pl-4">
        <div className="flex flex-col gap-2">
          <span className="text-caption font-semibold text-ink-muted">
            {t.indexTitle}
          </span>
          <div className="flex flex-wrap items-baseline gap-2">
            <Link
              className="text-sm font-medium text-accent underline underline-offset-2"
              href={`/app/mapas?indice=${encodeURIComponent(loadCase.index_slug)}`}
            >
              {loadCase.index_name ?? loadCase.index_slug}
            </Link>
            {loadCase.index_expression ? (
              <code className="rounded-seat bg-well px-2 py-0.5 font-mono text-xs text-ink">
                {loadCase.index_expression}
              </code>
            ) : null}
          </div>
        </div>

        {/* The cost twin (D-65). Shown beside the mass index rather than behind
            the objective toggle: the point of the item is that these are two
            readings of one derivation, and a reader who cannot see both at once
            has no way to notice that the structural factor never moved. */}
        <div className="flex flex-col gap-2">
          <span className="text-caption font-semibold text-ink-muted">
            {t.costIndexTitle}
          </span>
          <div className="flex flex-wrap items-baseline gap-2">
            <Link
              className="text-sm font-medium text-accent underline underline-offset-2"
              href={`/app/mapas?indice=${encodeURIComponent(loadCase.cost_index_slug)}`}
            >
              {loadCase.cost_index_name ?? loadCase.cost_index_slug}
            </Link>
            {loadCase.cost_index_expression ? (
              <code className="rounded-seat bg-well px-2 py-0.5 font-mono text-xs text-ink">
                {loadCase.cost_index_expression}
              </code>
            ) : null}
          </div>
          <span className="text-xs text-ink-muted">{t.costIndexHint}</span>
        </div>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          {t.derivationTitle}
        </summary>
        <p className="mt-2 text-xs text-ink-muted">{t.derivationHint}</p>
        <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-sm text-ink">
          {loadCase.derivation.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-ink-muted">{loadCase.reference}</p>
      </details>
    </div>
  );
}

function ResultTable({ result }: { result: SolveResult }) {
  if (result.solved.length === 0) {
    return <EmptyState title={t.resultEmpty} />;
  }
  // A cost answer is not a mass, so the column says so — and the estimate link
  // is a mass link: passing a cost to /app/custo as `massa` would hand the
  // estimator a number in the wrong quantity and it would not notice.
  const isCost = result.objective === "custo";
  const objectiveColumn = isCost ? t.columnObjectiveCost : t.columnObjective;
  return (
    <TableScroll label={t.resultStep}>
      <Table>
        <TableCaption>
          {t.structuralFactor}: {formatNumber(result.structural_factor)} ·{" "}
          {result.objective_note ?? t.unitNote}
        </TableCaption>
        <THead>
          <Tr>
            <Th scope="col">#</Th>
            <Th scope="col">{t.columnMaterial}</Th>
            <Th scope="col">{t.columnIndex}</Th>
            <Th scope="col">{`${objectiveColumn} (${result.objective_unit})`}</Th>
            <Th scope="col">{`${result.case.free_variable_label} (${result.free_unit})`}</Th>
            {isCost ? null : <Th scope="col">{t.columnNext}</Th>}
          </Tr>
        </THead>
        <TBody>
          {result.solved.map((record) => (
            <Tr key={record.record_id}>
              <Td className="tabular-nums">{record.rank}</Td>
              <Td>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    className="font-medium text-accent underline underline-offset-2"
                    // A record's page is /app/materiais/[id]; /app/catalogo/[slug]
                    // is a *family*, and an id there lands on a family that
                    // does not exist.
                    href={`/app/materiais/${record.record_id}`}
                  >
                    {record.name}
                  </Link>
                  <ClassBadge
                    name={record.class_name}
                    color={classVisual(record.class_slug).color}
                  />
                </div>
              </Td>
              <Td className="tabular-nums">
                {formatNumber(record.index_value)}
              </Td>
              <Td className="tabular-nums">
                {formatNumber(record.objective_value)}
              </Td>
              <Td className="tabular-nums">
                {formatNumber(record.free_value)}
              </Td>
              {isCost ? null : (
                <Td>
                  {/* The mass this row just computed is exactly the number both
                      the cost estimate and the eco audit need, so the links
                      carry it (B1). Typing it again would be an invitation to
                      type it wrong. Both are absent on a cost run: they carry
                      `massa=`, and a cost there is a different quantity. */}
                  <div className="flex flex-wrap gap-3">
                    <Link
                      className="text-accent underline underline-offset-2"
                      href={`/app/custo?material=${record.record_id}&massa=${record.objective_value}`}
                    >
                      {ptBR.cost.fromSolver}
                    </Link>
                    <Link
                      className="text-accent underline underline-offset-2"
                      href={`/app/eco?material=${record.record_id}&massa=${record.objective_value}`}
                    >
                      {ptBR.eco.fromSolver}
                    </Link>
                  </div>
                </Td>
              )}
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

export default function DimensionarPage() {
  const cases = useQuery({ queryKey: ["load-cases"], queryFn: listLoadCases });
  const [chosenKey, setCaseKey] = useState<string>("");
  const [typed, setInputs] = useState<Record<string, string>>({});
  const [objective, setObjective] = useState<SolverObjective>("massa");
  const [result, setResult] = useState<SolveResult | null>(null);

  // An empty choice *means* the first case: the <select> already shows it as
  // chosen, and a screen that painted it selected while holding "" rendered
  // nothing under it until the reader picked another case and came back.
  // Derived, not written by an effect (same reasoning as /app/sintetizar).
  const caseKey = chosenKey || cases.data?.[0]?.key || "";
  const selected = useMemo(
    () => cases.data?.find((item) => item.key === caseKey) ?? null,
    [cases.data, caseKey],
  );
  const inputs = useMemo(
    () =>
      chosenKey === "" && selected
        ? { ...initialInputs(selected), ...typed }
        : typed,
    [chosenKey, selected, typed],
  );

  function chooseCase(key: string) {
    setCaseKey(key);
    setResult(null);
    const next = cases.data?.find((item) => item.key === key);
    setInputs(next ? initialInputs(next) : {});
  }

  const solve = useMutation({
    mutationFn: () =>
      solveBrief({
        case_key: caseKey,
        inputs: Object.fromEntries(
          Object.entries(inputs).map(([key, value]) => [key, Number(value)]),
        ),
        objective,
      }),
    onSuccess: setResult,
  });

  // The first variable still missing, named: a disabled button with no reason
  // reads as broken (D-86). Input validation only — the sizing is the backend's.
  const missingVariable =
    selected?.variables.find((variable) => {
      const raw = inputs[variable.key];
      return !(
        raw !== undefined &&
        raw !== "" &&
        Number.isFinite(Number(raw)) &&
        Number(raw) > 0
      );
    }) ?? null;
  const ready = selected !== null && missingVariable === null;
  const blockedReason = missingVariable
    ? t.blockedVariable(`${missingVariable.label} (${missingVariable.unit})`)
    : null;

  if (cases.isLoading) return <LoadingState label={t.title} />;
  if (cases.isError) return <ErrorState description={String(cases.error)} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <StepCard title={t.caseStep} description={t.caseHint}>
          <Select
            label={t.caseLabel}
            value={caseKey}
            onChange={(event) =>
              chooseCase((event.target as HTMLSelectElement).value)
            }
          >
            {(cases.data ?? []).map((item) => (
              <SelectOption key={item.key} value={item.key}>
                {item.label}
              </SelectOption>
            ))}
          </Select>
          {selected ? <CaseFacts loadCase={selected} /> : null}
        </StepCard>

        {selected ? (
          <StepCard
            className="xl:sticky xl:top-6"
            title={t.inputsStep}
            description={t.inputsHint}
            footer={
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => solve.mutate()}
                  disabled={!ready || solve.isPending}
                  aria-describedby={blockedReason ? "dimensionar-motivo" : undefined}
                >
                  {solve.isPending ? t.solving : t.solve}
                </Button>
                {blockedReason ? (
                  <p id="dimensionar-motivo" className="text-support text-ink-muted">
                    {blockedReason}
                  </p>
                ) : null}
              </div>
            }
          >
            {/* The support condition stays in view, never folded: it is the
                constant that makes two identical briefs differ (D-64). */}
            {selected.variables.map((variable) => {
              const support = selected.supports.filter(
                (s) => s.variable_key === variable.key,
              );
              if (support.length > 0) {
                return (
                  <Select
                    key={variable.key}
                    label={t.supportLabel}
                    hint={variable.help_text}
                    value={inputs[variable.key] ?? ""}
                    onChange={(event) =>
                      setInputs((current) => ({
                        ...current,
                        [variable.key]: (event.target as HTMLSelectElement)
                          .value,
                      }))
                    }
                  >
                    {support.map((condition) => (
                      <SelectOption
                        key={condition.key}
                        value={String(condition.value)}
                      >
                        {condition.note
                          ? `${condition.label} — ${condition.note}`
                          : condition.label}
                      </SelectOption>
                    ))}
                  </Select>
                );
              }
              return (
                <NumberInput
                  key={variable.key}
                  label={`${variable.label} (${variable.unit})`}
                  hint={variable.help_text}
                  value={inputs[variable.key] ?? ""}
                  min={0}
                  step="any"
                  onChange={(event) =>
                    setInputs((current) => ({
                      ...current,
                      [variable.key]: event.target.value,
                    }))
                  }
                />
              );
            })}
            <Select
              label={t.objectiveLabel}
              hint={t.objectiveHint}
              value={objective}
              onChange={(event) =>
                setObjective(
                  (event.target as HTMLSelectElement)
                    .value as SolverObjective,
                )
              }
            >
              <SelectOption value="massa">{t.objectiveMass}</SelectOption>
              <SelectOption value="custo">
                {selected.cost_objective_label}
              </SelectOption>
            </Select>
            {solve.isError ? (
              <Alert tone="danger">{String(solve.error)}</Alert>
            ) : null}
          </StepCard>
        ) : null}
      </div>

      {/* The result card is on screen before there is a result (D-80): a card
          that says what will appear reads as the next step. */}
      <StepCard title={t.resultStep} description={result ? t.structuralFactorHint : undefined}>
        {result ? (
          <>
            {/* Which index produced these numbers, on the result and not read
                off the case: a case carries two, and showing the other one
                would make the screen disagree with the column under it. */}
            <p className="text-xs text-ink-muted">
              {result.objective_label} · {t.indexRan}:{" "}
              <Link
                className="text-accent underline underline-offset-2"
                href={`/app/mapas?indice=${encodeURIComponent(result.index_slug)}`}
              >
                {result.index_name ?? result.index_slug}
              </Link>
              {result.index_expression ? (
                <code className="ml-2 rounded-control bg-surface-sunken px-2 py-0.5 text-ink">
                  {result.index_expression}
                </code>
              ) : null}
            </p>
            <ResultTable result={result} />
            {result.excluded.length > 0 ? (
              <Card>
                <CardBody className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-ink">
                    {t.excludedTitle}
                  </span>
                  <span className="text-xs text-ink-muted">{t.excludedHint}</span>
                  <ul className="flex flex-col gap-1 text-sm text-ink">
                    {result.excluded.map((item) => (
                      <li key={item.record_id}>
                        {item.name}
                        {item.missing_labels.length > 0
                          ? ` — ${item.missing_labels.join(", ")}`
                          : ` — ${item.reason}`}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            ) : null}
          </>
        ) : (
          <EmptyState title={t.resultIdleTitle} description={t.resultIdleHint} />
        )}
      </StepCard>
    </div>
  );
}
