"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { LoadCase, SolveResult } from "@/lib/types";
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
  Field,
  LoadingState,
  NumberInput,
  PageHeader,
  Section,
  Select,
  SelectOption,
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
    const support = loadCase.supports.find((s) => s.variable_key === variable.key);
    inputs[variable.key] = support ? String(support.value) : "";
  }
  return inputs;
}

function Facet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="text-sm text-ink">{children}</span>
    </div>
  );
}

function CaseCard({ loadCase }: { loadCase: LoadCase }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">{loadCase.summary}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Facet label={t.facetFunction}>{loadCase.function_label}</Facet>
          <Facet label={t.facetObjective}>{loadCase.objective_label}</Facet>
          <Facet label={t.facetConstraint}>{loadCase.constraint_label}</Facet>
          <Facet label={t.facetFree}>{loadCase.free_variable_label}</Facet>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t.facetFixed}
          </span>
          <div className="flex flex-wrap gap-1">
            {loadCase.fixed_labels.map((label) => (
              <Badge key={label}>{label}</Badge>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-card bg-surface-muted p-3">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
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
              <code className="rounded-control bg-surface px-2 py-0.5 text-xs text-ink">
                {loadCase.index_expression}
              </code>
            ) : null}
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
      </CardBody>
    </Card>
  );
}

function ResultTable({ result }: { result: SolveResult }) {
  if (result.solved.length === 0) {
    return <EmptyState title={t.resultEmpty} />;
  }
  return (
    <TableScroll label={t.resultStep}>
      <Table>
        <TableCaption>
          {t.structuralFactor}: {formatNumber(result.structural_factor)} · {t.unitNote}
        </TableCaption>
        <THead>
          <Tr>
            <Th scope="col">#</Th>
            <Th scope="col">{t.columnMaterial}</Th>
            <Th scope="col">{t.columnIndex}</Th>
            <Th scope="col">{`${t.columnObjective} (${result.objective_unit})`}</Th>
            <Th scope="col">{`${result.case.free_variable_label} (${result.free_unit})`}</Th>
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
                    href={`/app/catalogo/${record.record_id}`}
                  >
                    {record.name}
                  </Link>
                  <ClassBadge
                    name={record.class_name}
                    color={classVisual(record.class_slug).color}
                  />
                </div>
              </Td>
              <Td className="tabular-nums">{formatNumber(record.index_value)}</Td>
              <Td className="tabular-nums">{formatNumber(record.objective_value)}</Td>
              <Td className="tabular-nums">{formatNumber(record.free_value)}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

export default function DimensionarPage() {
  const cases = useQuery({ queryKey: ["load-cases"], queryFn: listLoadCases });
  const [caseKey, setCaseKey] = useState<string>("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SolveResult | null>(null);

  const selected = useMemo(
    () => cases.data?.find((item) => item.key === caseKey) ?? null,
    [cases.data, caseKey],
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
      }),
    onSuccess: setResult,
  });

  const ready =
    selected !== null &&
    selected.variables.every((variable) => {
      const raw = inputs[variable.key];
      return raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) && Number(raw) > 0;
    });

  if (cases.isLoading) return <LoadingState label={t.title} />;
  if (cases.isError) return <ErrorState description={String(cases.error)} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <Section title={t.caseStep} description={t.caseHint}>
        <Select
          label={t.caseLabel}
          value={caseKey}
          onChange={(event) => chooseCase((event.target as HTMLSelectElement).value)}
        >
          {(cases.data ?? []).map((item) => (
            <SelectOption key={item.key} value={item.key}>
              {item.label}
            </SelectOption>
          ))}
        </Select>
        {selected ? <CaseCard loadCase={selected} /> : null}
      </Section>

      {selected ? (
        <Section title={t.inputsStep} description={t.inputsHint}>
          <div className="grid gap-4 sm:grid-cols-2">
            {selected.variables.map((variable) => {
              const support = selected.supports.filter((s) => s.variable_key === variable.key);
              if (support.length > 0) {
                return (
                  <Field key={variable.key} label={t.supportLabel} hint={variable.help_text}>
                    <Select
                      label={t.supportLabel}
                      value={inputs[variable.key] ?? ""}
                      onChange={(event) =>
                        setInputs((current) => ({
                          ...current,
                          [variable.key]: (event.target as HTMLSelectElement).value,
                        }))
                      }
                    >
                      {support.map((condition) => (
                        <SelectOption key={condition.key} value={String(condition.value)}>
                          {condition.note
                            ? `${condition.label} — ${condition.note}`
                            : condition.label}
                        </SelectOption>
                      ))}
                    </Select>
                  </Field>
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
          </div>
          <div>
            <Button onClick={() => solve.mutate()} disabled={!ready || solve.isPending}>
              {solve.isPending ? t.solving : t.solve}
            </Button>
          </div>
          {solve.isError ? <Alert tone="danger">{String(solve.error)}</Alert> : null}
        </Section>
      ) : null}

      {result ? (
        <Section title={t.resultStep} description={t.structuralFactorHint}>
          <ResultTable result={result} />
          {result.excluded.length > 0 ? (
            <Card>
              <CardBody className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">{t.excludedTitle}</span>
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
        </Section>
      ) : null}
    </div>
  );
}
