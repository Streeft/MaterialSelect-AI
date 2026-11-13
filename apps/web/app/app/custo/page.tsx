"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useLiveResult } from "@/lib/useLiveResult";
import type { CostResult, DefaultsResult, SuggestAction } from "@/lib/types";
import { estimatePartCost, listMaterials } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber, formatTyped } from "@/lib/format";
import { encodeIdList, parseIdList } from "@/lib/idList";
import { describeApiError } from "@/lib/errors";
import { textCodec, useUrlState, type UrlCodec, type UrlSpec } from "@/lib/urlState";
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
import { suggestText } from "@/lib/i18n-suggest";
import { AISuggestPanel } from "@/components/ai/AISuggestPanel";
import { aiField, revealField } from "@/lib/ai/revealField";
import { isOwnKey } from "@/lib/ai/suggest";
import { DefaultsGate } from "@/components/layout/DefaultsGate";
import { ParamsPanel, ParamsResultLayout, ResultPanel } from "@/components/layout/ParamsResult";

const t = ptBR.cost;

/** The most materials one comparison holds: the first, plus four. */
const MAX_COMPARED = 5;

/** Ids of the materials compared with the first, as `1-3,7` (D-187). */
const idListCodec: UrlCodec<number[]> = {
  parse: (raw) => parseIdList(raw).slice(0, MAX_COMPARED - 1),
  serialize: (ids) => encodeIdList(ids),
};

/** One extra material's estimate, or why it could not be made. */
interface ComparedEstimate {
  id: number;
  result: CostResult | null;
  error: string | null;
}

/** D-230: the AI's parameter names (the request's), and the brief field each one writes. */
const AI_PARAMS = {
  part_mass: "mass",
  batch_size: "batch",
  write_off_years: "writeOff",
  load_factor: "loadFactor",
} as const;

type AiParam = keyof typeof AI_PARAMS;

const isAiParam = (name: string): name is AiParam => isOwnKey(AI_PARAMS, name);

/**
 * A `set_param` is shown only for a parameter this screen has and a finite number;
 * anything else is not a button. Other types (`open_route`) are not this check's.
 */
function acceptsAiAction(action: SuggestAction): boolean {
  return (
    action.type !== "set_param" ||
    (isAiParam(action.name) && typeof action.value === "number" && Number.isFinite(action.value))
  );
}

interface CostBrief {
  /** The materials compared with the first one (up to four). */
  others: number[];
  material: string;
  mass: string;
  batch: string;
  writeOff: string;
  loadFactor: string;
}

/**
 * The whole brief in the URL (B1, D-212), so a link carries the question: the
 * solver's result rows point here with the material and the mass it computed,
 * and the two premises (write-off, load factor) travel too. Their defaults come
 * from the server (`GET /api/padroes`, D-216) — the page keeps no copy — and
 * stay visible and overridable; see the note in the schema.
 */
function costUrlSpec(defaults: DefaultsResult["custo"]): UrlSpec<CostBrief> {
  return {
    material: { param: "material", codec: textCodec, defaultValue: "" },
    others: { param: "comparar", codec: idListCodec, defaultValue: [] },
    mass: { param: "massa", codec: textCodec, defaultValue: "" },
    batch: { param: "lote", codec: textCodec, defaultValue: String(defaults.batch_size) },
    writeOff: {
      param: "amortizacao",
      codec: textCodec,
      defaultValue: String(defaults.write_off_years),
    },
    loadFactor: {
      param: "fator_carga",
      codec: textCodec,
      defaultValue: String(defaults.load_factor),
    },
  };
}

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

/**
 * The best process of each compared material, side by side (D-216). The order is
 * the order the reader chose and the numbers are each estimate's own first-ranked
 * process — nothing is re-ranked or summed here. A material with no costable
 * process, or whose estimate failed, says so in words instead of a number.
 */
function ComparedTable({ main, others }: { main: CostResult; others: ComparedEstimate[] }) {
  const rows: { key: string; name: string; best: CostResult["costed"][number] | null; note: string | null }[] = [
    { key: String(main.material_id), name: main.material_name, best: main.costed[0] ?? null, note: null },
    ...others.map((item) => ({
      key: String(item.id),
      name: item.result?.material_name ?? `#${item.id}`,
      best: item.result?.costed[0] ?? null,
      note: item.error ? `${t.compareFailed}: ${item.error}` : null,
    })),
  ];
  return (
    <TableScroll label={t.compareTitle}>
      <Table>
        <TableCaption>{t.compareCaption}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnComparedMaterial}</Th>
            <Th scope="col">{t.columnBestProcess}</Th>
            <Th scope="col">{t.columnMaterial}</Th>
            <Th scope="col">{t.columnTooling}</Th>
            <Th scope="col">{t.columnCompareTotal}</Th>
          </Tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <Tr key={row.key}>
              <Td className="font-medium">{row.name}</Td>
              {row.best ? (
                <>
                  <Td>{row.best.process_name}</Td>
                  <Td className="tabular-nums">{formatNumber(row.best.terms.material)}</Td>
                  <Td className="tabular-nums">{formatNumber(row.best.terms.tooling)}</Td>
                  <Td className="font-medium tabular-nums">{formatNumber(row.best.terms.total)}</Td>
                </>
              ) : (
                <Td colSpan={4} className="text-ink-muted">
                  {row.note ?? t.compareNoProcess}
                </Td>
              )}
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

export default function CustoPage() {
  return (
    <DefaultsGate label={t.title}>{(defaults) => <CustoScreen defaults={defaults.custo} />}</DefaultsGate>
  );
}

interface CostBundleRequest {
  ids: number[];
  mass: number;
  batch: number;
  writeOff: number;
  loadFactor: number;
}

async function estimateBundle(request: CostBundleRequest) {
  const settled = await Promise.allSettled(
    request.ids.map((id) =>
      estimatePartCost({
        material_id: id,
        part_mass: request.mass,
        batch_size: request.batch,
        write_off_years: request.writeOff,
        load_factor: request.loadFactor,
      }),
    ),
  );
  const [first, ...rest] = settled;
  if (!first || first.status === "rejected") throw first?.reason ?? new Error("estimate");
  return {
    main: first.value,
    others: rest.map(
      (outcome, index): ComparedEstimate => ({
        id: request.ids[index + 1] ?? 0,
        result: outcome.status === "fulfilled" ? outcome.value : null,
        error: outcome.status === "rejected" ? describeApiError(outcome.reason) : null,
      }),
    ),
  };
}

function CustoScreen({ defaults }: { defaults: DefaultsResult["custo"] }) {
  const materials = useQuery({ queryKey: ["materials"], queryFn: () => listMaterials() });

  const spec = useMemo(() => costUrlSpec(defaults), [defaults]);
  const [brief, setBrief] = useUrlState(spec);
  const { material: materialId, others, mass, batch, writeOff, loadFactor } = brief;

  // With no material in the URL, the first of the catalogue is a starting point
  // rather than an answer: the reader still has to supply the mass and the
  // batch, which are the numbers that decide anything.
  //
  // Derived, not stored by an effect: writing the default into state on mount
  // would be a `setState` inside `useEffect` (which this repo's lint rule
  // flags, rightly — it renders twice and invents a "change" nobody made).
  // Empty state simply *means* "whatever the catalogue lists first".
  const selectedId = materialId || String(materials.data?.[0]?.id ?? "");

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

  // D-220: the estimates follow the brief — one per material, all with the same
  // part, batch and premises (D-216). The first is the answer the page is about;
  // a failure of one of the others is written on its row and never sinks the rest.
  // The numbers are still the server's.
  const live = useLiveResult<CostBundleRequest, { main: CostResult; others: ComparedEstimate[] }>({
    key: "custo-ao-vivo",
    request: ready
      ? {
          ids: [Number(selectedId), ...others.filter((id) => id !== Number(selectedId))],
          mass: Number(mass),
          batch: Number(batch),
          writeOff: Number(writeOff),
          loadFactor: Number(loadFactor),
        }
      : null,
    fetcher: estimateBundle,
  });
  const result = live.data?.main ?? null;
  const compared = live.data?.others ?? [];
  // D-220: the mass handed over by Dimensionar says where it came from.
  const fromSolver = useSearchParams().get("origem") === "dimensionar";
  // An assumption that blocks the estimate is never left folded away.
  const assumptionBlocks =
    blockedReason === t.blocked.writeOff || blockedReason === t.blocked.loadFactor;
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  // D-230: a suggested parameter goes where the reader would have typed it — the
  // URL — and the estimate follows by itself, as it does for any change. Nothing
  // here asks the server; the field that changed is shown.
  function applyAiAction(action: SuggestAction) {
    if (action.type !== "set_param" || !isAiParam(action.name) || !acceptsAiAction(action)) return;
    const value = String(action.value);
    switch (AI_PARAMS[action.name]) {
      case "mass":
        setBrief({ mass: value });
        break;
      case "batch":
        setBrief({ batch: value });
        break;
      case "writeOff":
        setBrief({ writeOff: value });
        setAssumptionsOpen(true);
        break;
      case "loadFactor":
        setBrief({ loadFactor: value });
        setAssumptionsOpen(true);
        break;
    }
    revealField(action.name);
  }

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
  // What can still be added to the comparison: not the first material, not one
  // already in it.
  const addable = useMemo(
    () =>
      materialOptions.filter(
        (option) => option.value !== selectedId && !others.includes(Number(option.value)),
      ),
    [materialOptions, selectedId, others],
  );
  const nameOf = (id: number) =>
    materialOptions.find((option) => option.value === String(id))?.label ?? `#${id}`;

  if (materials.isLoading) return <SheetSkeleton label={t.title} />;
  if (materials.isError) return <ErrorState error={materials.error} onRetry={() => void materials.refetch()} />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} overflow={<CopyLinkItem />} />

      <AISuggestPanel
        tool="custo"
        // The request of the estimate the page shows, never its numbers (D-229).
        context={
          ready
            ? {
                request: {
                  material_id: Number(selectedId),
                  part_mass: Number(mass),
                  batch_size: Number(batch),
                  write_off_years: Number(writeOff),
                  load_factor: Number(loadFactor),
                },
              }
            : {}
        }
        actions={["set_param", "open_route"]}
        accepts={acceptsAiAction}
        onAction={applyAiAction}
        disabledReason={blockedReason ? suggestText.needsBrief : undefined}
      />

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
              unit={t.unitKg}
              hint={fromSolver && mass ? t.massFromSolver : t.massHint}
              value={mass}
              min={0}
              step="any"
              {...aiField("part_mass")}
              onChange={(event) => setBrief({ mass: event.target.value })}
            />
            {!mass ? (
              <p className="text-support sm:col-span-2">
                <Link className="text-accent underline underline-offset-2" href="/app/dimensionar">
                  {t.massToSolver}
                </Link>
              </p>
            ) : null}
            <NumberInput
              label={t.batchLabel}
              unit={t.unitPieces}
              hint={t.batchHint}
              value={batch}
              min={1}
              step="any"
              {...aiField("batch_size")}
              onChange={(event) => setBrief({ batch: event.target.value })}
            />
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Combobox
                label={t.compareLabel}
                hint={others.length >= MAX_COMPARED - 1 ? t.compareLimit : t.compareHint}
                options={addable}
                value=""
                clearOnSelect
                disabled={others.length >= MAX_COMPARED - 1}
                onChange={(value) => {
                  if (value !== "") setBrief({ others: [...others, Number(value)] });
                }}
              />
              {others.length > 0 ? (
                <ul aria-label={t.compareLabel} className="flex flex-wrap gap-2">
                  {others.map((id) => (
                    <li key={id} className="flex items-center gap-1 rounded-full bg-surface-sunken px-3 py-1">
                      <span className="min-w-0 break-words text-body text-ink">{nameOf(id)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={t.compareRemove(nameOf(id))}
                        onClick={() => setBrief({ others: others.filter((other) => other !== id) })}
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </StepCard>

          <StepCard title={t.assumptionsStep}>
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
                  unit={t.unitYears}
                  value={writeOff}
                  min={0}
                  step="any"
                  {...aiField("write_off_years")}
                  onChange={(event) => setBrief({ writeOff: event.target.value })}
                />
                <NumberInput
                  label={t.loadFactorLabel}
                  hint={t.loadFactorHint}
                  value={loadFactor}
                  min={0}
                  max={1}
                  step="any"
                  {...aiField("load_factor")}
                  onChange={(event) => setBrief({ loadFactor: event.target.value })}
                />
              </div>
            </Disclosure>
          </StepCard>
        </ParamsPanel>

        <ResultPanel busy={live.updating}>

          {/* The result card is on screen before there is a result: an empty page
              under two forms reads as "nothing here", a card that says what will
              appear reads as the next step. */}
          <StepCard
            title={t.resultStep}
            actions={
              live.updating ? (
                <span className="text-caption text-ink-muted">{ptBR.ui.updating}</span>
              ) : undefined
            }
          >
            {live.error ? (
              <Alert tone="danger">{describeApiError(live.error, t.title)}</Alert>
            ) : null}
            {result ? (
              <>
                <ResultTable result={result} />
                <CostCurveChart result={result} />
                {compared.length > 0 ? <ComparedTable main={result} others={compared} /> : null}
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
            ) : live.error ? null : (
              <EmptyState title={t.resultIdleTitle} description={blockedReason ?? t.resultIdleHint} />
            )}
          </StepCard>
        </ResultPanel>
      </ParamsResultLayout>
    </div>
  );
}
