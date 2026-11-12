"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CostResult } from "@/lib/types";
import { estimatePartCost, listMaterials } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber, formatTyped } from "@/lib/format";
import { textCodec, useUrlState, type UrlSpec } from "@/lib/urlState";
import {
  Alert,
  Button,
  Combobox,
  Disclosure,
  EmptyState,
  ErrorState,
  CopyLinkItem,
  NumberInput,
  PageHeader,
  SheetSkeleton,
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
import { CostCurveChart } from "@/components/charts/CostCurveChart";
import { ParamsPanel, ParamsResultLayout, ResultPanel } from "@/components/layout/ParamsResult";

const t = ptBR.cost;

interface CostBrief {
  material: string;
  mass: string;
  batch: string;
  writeOff: string;
  loadFactor: string;
}

/**
 * The whole brief in the URL (B1, D-212), so a link carries the question: the
 * solver's result rows point here with the material and the mass it computed,
 * and the two premises (write-off, load factor) travel too. Their defaults are
 * visible and overridable — see the note in the schema.
 */
const COST_URL: UrlSpec<CostBrief> = {
  material: { param: "material", codec: textCodec, defaultValue: "" },
  mass: { param: "massa", codec: textCodec, defaultValue: "" },
  batch: { param: "lote", codec: textCodec, defaultValue: "1000" },
  writeOff: { param: "amortizacao", codec: textCodec, defaultValue: "5" },
  loadFactor: { param: "fator_carga", codec: textCodec, defaultValue: "0.5" },
};

function ResultTable({ result }: { result: CostResult }) {
  if (result.costed.length === 0) {
    return <EmptyState title={t.resultEmpty} />;
  }
  return (
    <TableScroll label={t.resultStep}>
      <Table>
        <TableCaption>
          {result.monetary_unit_note} {t.termsHint}
        </TableCaption>
        <THead>
          <Tr>
            <Th scope="col">#</Th>
            <Th scope="col">{t.columnProcess}</Th>
            <Th scope="col">{t.columnMaterial}</Th>
            <Th scope="col">{t.columnTooling}</Th>
            <Th scope="col">{t.columnOverhead}</Th>
            <Th scope="col">{t.columnCapital}</Th>
            <Th scope="col">{t.columnTotal}</Th>
          </Tr>
        </THead>
        <TBody>
          {result.costed.map((item) => (
            <Tr key={item.process_id}>
              <Td className="tabular-nums">{item.rank}</Td>
              <Td>
                <Link
                  className="font-medium text-accent underline underline-offset-2"
                  href={`/app/processos/${item.process_slug}`}
                >
                  {item.process_name}
                </Link>
              </Td>
              <Td className="tabular-nums">{formatNumber(item.terms.material)}</Td>
              <Td className="tabular-nums">{formatNumber(item.terms.tooling)}</Td>
              <Td className="tabular-nums">{formatNumber(item.terms.overhead)}</Td>
              <Td className="tabular-nums">{formatNumber(item.terms.capital)}</Td>
              <Td className="font-medium tabular-nums">{formatNumber(item.terms.total)}</Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

export default function CustoPage() {
  const materials = useQuery({ queryKey: ["materials"], queryFn: () => listMaterials() });

  const [brief, setBrief] = useUrlState(COST_URL);
  const { material: materialId, mass, batch, writeOff, loadFactor } = brief;
  const [result, setResult] = useState<CostResult | null>(null);

  // With no material in the URL, the first of the catalogue is a starting point
  // rather than an answer: the reader still has to supply the mass and the
  // batch, which are the numbers that decide anything.
  //
  // Derived, not stored by an effect: writing the default into state on mount
  // would be a `setState` inside `useEffect` (which this repo's lint rule
  // flags, rightly — it renders twice and invents a "change" nobody made).
  // Empty state simply *means* "whatever the catalogue lists first".
  const selectedId = materialId || String(materials.data?.[0]?.id ?? "");

  const estimate = useMutation({
    mutationFn: () =>
      estimatePartCost({
        material_id: Number(selectedId),
        part_mass: Number(mass),
        batch_size: Number(batch),
        write_off_years: Number(writeOff),
        load_factor: Number(loadFactor),
      }),
    onSuccess: setResult,
  });

  // The first unmet requirement, in words: a disabled button with no reason
  // reads as broken (D-86). Input validation only — the estimate is the
  // backend's.
  const blockedReason = useMemo(() => {
    const positive = (raw: string) => {
      const value = Number(raw);
      return raw.trim() !== "" && Number.isFinite(value) && value > 0;
    };
    if (selectedId === "") return t.blocked.material;
    if (!positive(mass)) return t.blocked.mass;
    if (!positive(batch) || Number(batch) < 1) return t.blocked.batch;
    if (!positive(writeOff)) return t.blocked.writeOff;
    if (!positive(loadFactor) || Number(loadFactor) > 1) return t.blocked.loadFactor;
    return null;
  }, [selectedId, mass, batch, writeOff, loadFactor]);
  const ready = blockedReason === null;
  // An assumption that blocks the estimate is never left folded away.
  const assumptionBlocks =
    blockedReason === t.blocked.writeOff || blockedReason === t.blocked.loadFactor;
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  const materialOptions = useMemo(
    () =>
      (materials.data ?? []).map((material) => ({
        value: String(material.id),
        label: material.name,
        description: material.class_name,
        keywords: [material.class_name],
      })),
    [materials.data],
  );

  if (materials.isLoading) return <SheetSkeleton label={t.title} />;
  if (materials.isError) return <ErrorState error={materials.error} onRetry={() => void materials.refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} overflow={<CopyLinkItem />} />

      <ParamsResultLayout>
        <ParamsPanel>
          <StepCard title={t.briefStep} bodyClassName="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Combobox
                label={t.materialLabel}
                hint={t.materialHint}
                options={materialOptions}
                value={selectedId}
                onChange={(material) => setBrief({ material })}
              />
            </div>
            <NumberInput
              label={t.massLabel}
              hint={t.massHint}
              value={mass}
              min={0}
              step="any"
              onChange={(event) => setBrief({ mass: event.target.value })}
            />
            <NumberInput
              label={t.batchLabel}
              hint={t.batchHint}
              value={batch}
              min={1}
              step="any"
              onChange={(event) => setBrief({ batch: event.target.value })}
            />
          </StepCard>

          <StepCard
            title={t.assumptionsStep}
            footer={
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  onClick={() => estimate.mutate()}
                  disabled={!ready || estimate.isPending}
                  aria-describedby={blockedReason ? "custo-motivo" : undefined}
                >
                  {estimate.isPending ? t.estimating : t.estimate}
                </Button>
                {blockedReason ? (
                  <p id="custo-motivo" className="text-support text-ink-muted">
                    {blockedReason}
                  </p>
                ) : null}
              </div>
            }
          >
            {/* Folded, with every value in the summary: the premises are the
                reader's to change, never hidden from them (D-65, D-86). */}
            <Disclosure
              summary={t.assumptionsSummary(
                formatTyped(writeOff),
                formatTyped(loadFactor),
              )}
              open={assumptionsOpen || assumptionBlocks}
              onOpenChange={setAssumptionsOpen}
            >
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <p className="text-support text-ink-muted sm:col-span-2">{t.assumptionsHint}</p>
                <NumberInput
                  label={t.writeOffLabel}
                  value={writeOff}
                  min={0}
                  step="any"
                  onChange={(event) => setBrief({ writeOff: event.target.value })}
                />
                <NumberInput
                  label={t.loadFactorLabel}
                  hint={t.loadFactorHint}
                  value={loadFactor}
                  min={0}
                  max={1}
                  step="any"
                  onChange={(event) => setBrief({ loadFactor: event.target.value })}
                />
              </div>
            </Disclosure>
            {estimate.isError ? <Alert tone="danger">{String(estimate.error)}</Alert> : null}
          </StepCard>
        </ParamsPanel>

        <ResultPanel>

          {/* The result card is on screen before there is a result: an empty page
              under two forms reads as "nothing here", a card that says what will
              appear reads as the next step. */}
          <StepCard title={t.resultStep}>
            {result ? (
              <>
                <ResultTable result={result} />
                <CostCurveChart result={result} />
                {result.uncosted.length > 0 ? (
                  <div className="well flex flex-col gap-2">
                    <span className="text-body font-medium text-ink">{t.uncostedTitle}</span>
                    <span className="text-caption text-ink-muted">{t.uncostedHint}</span>
                    <ul className="flex flex-col gap-1 text-body text-ink">
                      {result.uncosted.map((item) => (
                        <li key={item.process_id}>
                          {item.process_name} — {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState title={t.resultIdleTitle} description={t.resultIdleHint} />
            )}
          </StepCard>
        </ResultPanel>
      </ParamsResultLayout>
    </div>
  );
}
