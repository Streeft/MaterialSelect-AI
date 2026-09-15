"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CostResult } from "@/lib/types";
import { estimatePartCost, listMaterials } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";
import {
  Alert,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
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

const t = ptBR.cost;

/** Visible defaults, both overridable — see the note in the schema. */
const DEFAULT_WRITE_OFF = "5";
const DEFAULT_LOAD_FACTOR = "0.5";

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
  // The brief travels in the URL (B1), so a link carries the question: the
  // solver's result rows point here with the material and the mass it computed.
  const params = useSearchParams();
  const materials = useQuery({ queryKey: ["materials"], queryFn: () => listMaterials() });

  const [materialId, setMaterialId] = useState(params.get("material") ?? "");
  const [mass, setMass] = useState(params.get("massa") ?? "");
  const [batch, setBatch] = useState(params.get("lote") ?? "1000");
  const [writeOff, setWriteOff] = useState(DEFAULT_WRITE_OFF);
  const [loadFactor, setLoadFactor] = useState(DEFAULT_LOAD_FACTOR);
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

  const ready = useMemo(() => {
    const numbers = [mass, batch, writeOff, loadFactor].map(Number);
    return (
      selectedId !== "" &&
      numbers.every((value) => Number.isFinite(value) && value > 0) &&
      Number(loadFactor) <= 1 &&
      Number(batch) >= 1
    );
  }, [selectedId, mass, batch, writeOff, loadFactor]);

  if (materials.isLoading) return <LoadingState label={t.title} />;
  if (materials.isError) return <ErrorState description={String(materials.error)} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <Section title={t.briefStep}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label={t.materialLabel}
            value={selectedId}
            onChange={(event) => setMaterialId((event.target as HTMLSelectElement).value)}
          >
            {(materials.data ?? []).map((material) => (
              <SelectOption key={material.id} value={String(material.id)}>
                {material.name}
              </SelectOption>
            ))}
          </Select>
          <NumberInput
            label={t.massLabel}
            hint={t.massHint}
            value={mass}
            min={0}
            step="any"
            onChange={(event) => setMass(event.target.value)}
          />
          <NumberInput
            label={t.batchLabel}
            hint={t.batchHint}
            value={batch}
            min={1}
            step="any"
            onChange={(event) => setBatch(event.target.value)}
          />
        </div>
      </Section>

      <Section title={t.assumptionsStep} description={t.assumptionsHint}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput
            label={t.writeOffLabel}
            value={writeOff}
            min={0}
            step="any"
            onChange={(event) => setWriteOff(event.target.value)}
          />
          <NumberInput
            label={t.loadFactorLabel}
            hint={t.loadFactorHint}
            value={loadFactor}
            min={0}
            max={1}
            step="any"
            onChange={(event) => setLoadFactor(event.target.value)}
          />
        </div>
        <div>
          <Button onClick={() => estimate.mutate()} disabled={!ready || estimate.isPending}>
            {estimate.isPending ? t.estimating : t.estimate}
          </Button>
        </div>
        {estimate.isError ? <Alert tone="danger">{String(estimate.error)}</Alert> : null}
      </Section>

      {result ? (
        <Section title={t.resultStep}>
          <ResultTable result={result} />
          {result.uncosted.length > 0 ? (
            <Card>
              <CardBody className="flex flex-col gap-2">
                <span className="text-sm font-medium text-ink">{t.uncostedTitle}</span>
                <span className="text-xs text-ink-muted">{t.uncostedHint}</span>
                <ul className="flex flex-col gap-1 text-sm text-ink">
                  {result.uncosted.map((item) => (
                    <li key={item.process_id}>
                      {item.process_name} — {item.reason}
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
