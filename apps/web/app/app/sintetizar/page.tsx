"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useDebounced } from "@/lib/useDebounced";
import {
  enumCodec,
  textCodec,
  useUrlState,
  type UrlSpec,
} from "@/lib/urlState";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  SynthesisKind,
  SynthesisPreview,
  SynthesisRequest,
  SynthesisResult,
  SynthesizedValue,
} from "@/lib/types";
import {
  createSynthesis,
  listClasses,
  listMaterials,
  listSynthesisKinds,
  previewSynthesis,
} from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";
import {
  Alert,
  Badge,
  Button,
  Combobox,
  DataQualityBadge,
  EmptyState,
  ErrorState,
  Input,
  CopyLinkItem,
  MissingValue,
  NumberInput,
  PageHeader,
  SheetSkeleton,
  RadioCard,
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
  type ComboboxOption,
  type QualityState,
} from "@/components/ui";
import {
  ParamsPanel,
  ParamsResultLayout,
  ResultPanel,
} from "@/components/layout/ParamsResult";
import { SweepSection } from "./SweepSection";

const t = ptBR.synthesis;

interface Recipe {
  kind: SynthesisKind;
  /** "" means the first (or second) material the catalogue lists. */
  parentA: string;
  parentB: string;
  fraction: string;
  density: string;
  faceThickness: string;
  coreThickness: string;
}

/**
 * The recipe in the URL (D-212): a link reopens the same composite, foam or
 * panel. The identity (name, class, description) stays out of it — it names a
 * record about to be written, not the question being asked.
 */
const RECIPE_URL: UrlSpec<Recipe> = {
  kind: {
    param: "tipo",
    codec: enumCodec<SynthesisKind>(["composito", "espuma", "painel"]),
    defaultValue: "composito",
  },
  parentA: { param: "a", codec: textCodec, defaultValue: "" },
  parentB: { param: "b", codec: textCodec, defaultValue: "" },
  fraction: { param: "fracao", codec: textCodec, defaultValue: "0.6" },
  density: { param: "densidade", codec: textCodec, defaultValue: "0.1" },
  faceThickness: { param: "face", codec: textCodec, defaultValue: "1" },
  coreThickness: { param: "nucleo", codec: textCodec, defaultValue: "18" },
};

const QUALITY_STATES: readonly string[] = [
  "MEDIDO",
  "IMPORTADO",
  "ESTIMADO",
  "AUSENTE",
];

function isQualityState(value: string): value is QualityState {
  return QUALITY_STATES.includes(value);
}

/** Um valor pode ser escalar ou um par de limites; os dois se leem diferente. */
function Value({ value }: { value: SynthesizedValue }) {
  if (value.value !== null) {
    return <span className="tabular-nums">{formatNumber(value.value)}</span>;
  }
  // D-24: a missing bound is labelled, never printed as 0.
  if (value.value_min === null || value.value_max === null) {
    return <MissingValue />;
  }
  return (
    <span className="tabular-nums">
      {formatNumber(value.value_min)} – {formatNumber(value.value_max)}
    </span>
  );
}

/**
 * The kind notes come from the API with `**bold**` and `*italic*` markers in
 * them; printed raw, the asterisks read as corruption. Only those two markers
 * are honoured — this is emphasis in a sentence, not a markdown renderer.
 */
function Emphasis({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  const nodes: ReactNode[] = parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
  return <>{nodes}</>;
}

const KINDS: { kind: SynthesisKind; label: string }[] = [
  { kind: "composito", label: t.kindComposite },
  { kind: "espuma", label: t.kindFoam },
  { kind: "painel", label: t.kindPanel },
];

function PreviewTable({ preview }: { preview: SynthesisPreview }) {
  if (preview.values.length === 0) {
    return <EmptyState title={t.previewEmpty} />;
  }
  return (
    <TableScroll label={t.previewStep}>
      <Table>
        <TableCaption>{preview.kind_note}</TableCaption>
        <THead>
          <Tr>
            <Th scope="col">{t.columnProperty}</Th>
            <Th scope="col">{t.columnValue}</Th>
            <Th scope="col">{t.columnRule}</Th>
            <Th scope="col">{t.columnQuality}</Th>
          </Tr>
        </THead>
        <TBody>
          {preview.values.map((value) => (
            <Tr key={value.slug}>
              <Td className="font-medium">
                {value.name}
                {/* An adimensional quantity says nothing by printing
                    "(dimensionless)"; the others read as the rest of the app. */}
                {value.canonical_unit &&
                value.canonical_unit !== "dimensionless" ? (
                  <span className="font-normal text-ink-muted">
                    {" "}
                    ({prettyUnit(value.canonical_unit)})
                  </span>
                ) : null}
              </Td>
              <Td>
                <Value value={value} />
              </Td>
              <Td className="text-caption text-ink-muted">
                {/* A base vem junto da fórmula: "conservação de massa" e "ajuste
                    empírico" não são a mesma afirmação sobre o número. */}
                <div className="flex flex-col items-start gap-1">
                  <span className="text-ink">{value.rule.label}</span>
                  <code className="rounded-control bg-surface-sunken px-2 py-0.5 font-mono text-2xs">
                    {value.rule.formula}
                  </code>
                  <Badge>{value.rule.basis_label}</Badge>
                </div>
              </Td>
              <Td className="text-caption text-ink-muted">
                {isQualityState(value.quality) ? (
                  <DataQualityBadge state={value.quality} />
                ) : (
                  value.quality
                )}
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

export default function SintetizarPage() {
  const kinds = useQuery({
    queryKey: ["synthesis-kinds"],
    queryFn: listSynthesisKinds,
  });
  const materials = useQuery({
    queryKey: ["materials"],
    queryFn: () => listMaterials(),
  });
  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });

  const kindName = useId();
  const [recipe, setRecipe] = useUrlState(RECIPE_URL);
  const {
    kind,
    parentA,
    parentB,
    fraction,
    density,
    faceThickness,
    coreThickness,
  } = recipe;
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [description, setDescription] = useState("");
  // D-219: after the first preview has been asked for, the preview follows the
  // recipe as it is edited (a pause after the last keystroke), instead of going
  // stale until the button is pressed again. Before that, nothing is computed
  // on its own: the first look is the reader's choice.
  const [live, setLive] = useState(false);
  const [savedRecord, setSavedRecord] = useState<{
    key: string;
    result: SynthesisResult;
  } | null>(null);

  // Derivados, não gravados por efeito: uma seleção vazia simplesmente *quer
  // dizer* "o primeiro que o catálogo lista". Escrever isso no estado ao montar
  // seria um setState dentro de useEffect, que a regra de lint deste repositório
  // sinaliza — com razão, porque renderiza duas vezes e inventa uma mudança que
  // ninguém fez.
  const options = materials.data ?? [];
  const selectedA = parentA || String(options[0]?.id ?? "");
  const selectedB = parentB || String(options[1]?.id ?? "");
  const selectedClass = classId || String(classes.data?.[0]?.id ?? "");

  const body = useMemo<SynthesisRequest>(() => {
    // Só os campos do tipo escolhido são enviados. A API recusa os do outro
    // tipo em vez de ignorá-los, então mandar os dois seria um 400 — e mandá-los
    // calados seria pior, porque o leitor digitou um número que a conta não
    // conteria.
    const common = {
      kind,
      name: name.trim(),
      class_id: Number(selectedClass),
      description: description.trim() || null,
      parent_a_id: Number(selectedA),
    };
    if (kind === "composito") {
      return {
        ...common,
        parent_b_id: Number(selectedB),
        volume_fraction: Number(fraction),
      };
    }
    if (kind === "painel") {
      return {
        ...common,
        parent_b_id: Number(selectedB),
        face_thickness: Number(faceThickness),
        core_thickness: Number(coreThickness),
      };
    }
    return { ...common, relative_density: Number(density) };
  }, [
    kind,
    name,
    selectedClass,
    description,
    selectedA,
    selectedB,
    fraction,
    density,
    faceThickness,
    coreThickness,
  ]);

  const save = useMutation({
    mutationFn: () => createSynthesis(body),
    onSuccess: (result) => {
      setSavedRecord({ key: recipeKey, result });
      materials.refetch();
    },
  });

  // The first unmet requirement of the recipe, in words: a disabled button
  // with no reason reads as broken (D-86). Input validation only — every value
  // is computed in the backend.
  const recipeBlocked = useMemo(() => {
    if (selectedA === "") return t.blocked.parentA;
    if (kind === "composito" || kind === "painel") {
      if (selectedB === "" || selectedB === selectedA) return t.blocked.parentB;
    }
    if (kind === "composito") {
      const f = Number(fraction);
      if (!(f > 0 && f < 1)) return t.blocked.fraction;
    } else if (kind === "painel") {
      // Sem teto: um painel de 200 mm é tão legítimo quanto um de 2 mm, e é a
      // razão entre as duas espessuras que decide o resultado.
      if (!(Number(faceThickness) > 0 && Number(coreThickness) > 0))
        return t.blocked.thickness;
    } else {
      const r = Number(density);
      if (!(r > 0 && r < 1)) return t.blocked.density;
    }
    if (selectedClass === "") return t.blocked.class;
    return null;
  }, [
    kind,
    selectedA,
    selectedB,
    selectedClass,
    fraction,
    density,
    faceThickness,
    coreThickness,
  ]);
  const recipeReady = recipeBlocked === null;

  // Gravar exige nome; a prévia não, porque ela não cria registro nenhum e a
  // pergunta "o que sairia daqui" não depende de como o resultado se chamaria.
  const saveBlocked =
    recipeBlocked ?? (name.trim().length > 0 ? null : t.blocked.name);
  const canSave = saveBlocked === null;

  // The recipe alone: the name and the description do not change what comes out.
  const recipeKey = JSON.stringify({ ...body, name: "", description: null });
  const settledKey = useDebounced(recipeKey, live ? 500 : 0);
  const livePreview = useQuery({
    queryKey: ["synthesis-preview", settledKey],
    // A prévia não cria registro, então não pede nome — mas a API valida o
    // mesmo corpo da gravação e recusa `name` vazio com 422. Sem este nome
    // provisório a prévia nunca rodava: o campo de nome só aparece depois
    // dela. O nome provisório não é gravado em lugar nenhum.
    queryFn: () =>
      previewSynthesis({
        ...(JSON.parse(settledKey) as SynthesisRequest),
        name: t.previewName,
      }),
    enabled: live && recipeBlocked === null,
    retry: false,
    placeholderData: (previous) => previous,
  });
  // A saved record answers the recipe it was saved from; edit the recipe and it is no longer shown.
  const saved =
    savedRecord && savedRecord.key === recipeKey ? savedRecord.result : null;
  const preview: SynthesisPreview | null =
    saved ?? (live ? (livePreview.data ?? null) : null);
  const stale = live && settledKey !== recipeKey;

  if (kinds.isLoading || materials.isLoading || classes.isLoading) {
    return <SheetSkeleton label={t.title} />;
  }
  if (kinds.isError)
    return (
      <ErrorState error={kinds.error} onRetry={() => void kinds.refetch()} />
    );
  if (materials.isError)
    return (
      <ErrorState
        error={materials.error}
        onRetry={() => void materials.refetch()}
      />
    );
  if (classes.isError)
    return (
      <ErrorState
        error={classes.error}
        onRetry={() => void classes.refetch()}
      />
    );

  const noteOf = (value: SynthesisKind) =>
    (kinds.data ?? []).find((item) => item.kind === value)?.note;

  const materialOptions: ComboboxOption[] = options.map((material) => ({
    value: String(material.id),
    label: material.name,
    description: material.class_name,
    keywords: [material.class_name],
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.title}
        description={t.subtitle}
        overflow={<CopyLinkItem />}
      />

      <Alert tone="info">{t.principle}</Alert>

      <StepCard title={t.kindStep}>
        {/* Cards, not a <select>: the rule each kind follows is what the
              reader is choosing between, and a <select> hides it until after
              the choice. */}
        <fieldset className="min-w-0">
          <legend className="msds-field-label">{t.kindLabel}</legend>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {KINDS.map((item) => {
              const note = noteOf(item.kind);
              return (
                <RadioCard
                  key={item.kind}
                  name={kindName}
                  value={item.kind}
                  checked={kind === item.kind}
                  onChange={(value) => {
                    setRecipe({ kind: value as SynthesisKind });
                    setLive(false);
                    setSavedRecord(null);
                  }}
                  title={item.label}
                >
                  {note ? (
                    <p className="text-caption leading-relaxed text-ink-muted">
                      <Emphasis text={note} />
                    </p>
                  ) : null}
                </RadioCard>
              );
            })}
          </div>
        </fieldset>
      </StepCard>

      <ParamsResultLayout>
        <ParamsPanel>
          <StepCard
            title={t.recipeStep}
            bodyClassName="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"
            footer={
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() =>
                    live ? void livePreview.refetch() : setLive(true)
                  }
                  disabled={!recipeReady || livePreview.isFetching}
                  aria-describedby={
                    recipeBlocked ? "sintetizar-motivo-receita" : undefined
                  }
                >
                  {livePreview.isFetching || stale ? t.previewing : t.preview}
                </Button>
                {recipeBlocked ? (
                  <p
                    id="sintetizar-motivo-receita"
                    className="text-support text-ink-muted"
                  >
                    {recipeBlocked}
                  </p>
                ) : null}
              </div>
            }
          >
            <Combobox
              label={
                kind === "composito"
                  ? t.parentALabel
                  : kind === "painel"
                    ? t.faceLabel
                    : t.parentASolidLabel
              }
              hint={t.materialHint}
              options={materialOptions}
              value={selectedA}
              onChange={(parentA) => setRecipe({ parentA })}
            />
            {kind === "espuma" ? (
              <NumberInput
                label={t.densityLabel}
                hint={t.densityHint}
                value={density}
                min={0}
                max={1}
                step="any"
                onChange={(event) => setRecipe({ density: event.target.value })}
              />
            ) : (
              <Combobox
                label={kind === "painel" ? t.coreLabel : t.parentBLabel}
                hint={t.materialHint}
                options={materialOptions}
                value={selectedB}
                onChange={(parentB) => setRecipe({ parentB })}
              />
            )}
            {kind === "composito" ? (
              <div className="sm:col-span-2 xl:col-span-1">
                <NumberInput
                  label={t.fractionLabel}
                  hint={t.fractionHint}
                  value={fraction}
                  min={0}
                  max={1}
                  step="any"
                  onChange={(event) =>
                    setRecipe({ fraction: event.target.value })
                  }
                />
              </div>
            ) : null}
            {kind === "painel" ? (
              <>
                <NumberInput
                  label={t.faceThicknessLabel}
                  value={faceThickness}
                  min={0}
                  step="any"
                  onChange={(event) =>
                    setRecipe({ faceThickness: event.target.value })
                  }
                />
                <NumberInput
                  label={t.coreThicknessLabel}
                  value={coreThickness}
                  min={0}
                  step="any"
                  onChange={(event) =>
                    setRecipe({ coreThickness: event.target.value })
                  }
                />
                <p className="text-caption text-ink-muted sm:col-span-2 xl:col-span-1">
                  {t.thicknessHint}
                </p>
              </>
            ) : null}
            {live && livePreview.isError ? (
              <ErrorState
                className="sm:col-span-2 xl:col-span-1"
                error={livePreview.error}
                onRetry={() => void livePreview.refetch()}
              />
            ) : null}
          </StepCard>

          {preview ? (
            <StepCard
              title={t.identityStep}
              bodyClassName="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"
              footer={
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="primary"
                    onClick={() => save.mutate()}
                    disabled={!canSave || save.isPending}
                    aria-describedby={
                      saveBlocked ? "sintetizar-motivo-gravar" : undefined
                    }
                  >
                    {save.isPending ? t.saving : t.save}
                  </Button>
                  {saveBlocked ? (
                    <p
                      id="sintetizar-motivo-gravar"
                      className="text-support text-ink-muted"
                    >
                      {saveBlocked}
                    </p>
                  ) : null}
                </div>
              }
            >
              <Input
                label={t.nameLabel}
                hint={t.nameHint}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Select
                label={t.classLabel}
                hint={t.classHint}
                value={selectedClass}
                onChange={(event) =>
                  setClassId((event.target as HTMLSelectElement).value)
                }
              >
                {(classes.data ?? []).map((item) => (
                  <SelectOption key={item.id} value={String(item.id)}>
                    {item.name}
                  </SelectOption>
                ))}
              </Select>
              <div className="sm:col-span-2 xl:col-span-1">
                <Input
                  label={t.descriptionLabel}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              {save.isError ? (
                <ErrorState
                  className="sm:col-span-2 xl:col-span-1"
                  error={save.error}
                  onRetry={() => save.mutate()}
                />
              ) : null}
            </StepCard>
          ) : null}

          {saved ? (
            <Alert tone="success" title={t.savedTitle}>
              <span className="flex flex-col gap-1">
                <span>{t.savedHint}</span>
                {/* A ficha de um registro é `/app/materiais/[id]`; `/app/catalogo/[slug]`
                    é a *família*, e apontar para lá cairia numa família de slug "77". */}
                <Link
                  className="font-medium text-accent underline underline-offset-2"
                  href={`/app/materiais/${saved.material_id}`}
                >
                  {t.openRecord}: {saved.material_name}
                </Link>
              </span>
            </Alert>
          ) : null}
        </ParamsPanel>

        {/* The result sits beside the recipe, not under it: changing a
            fraction and reading what moved should not cost a scroll. */}
        <ResultPanel sticky>
          <StepCard
            title={t.previewStep}
            description={
              preview
                ? `${t.parentsLabel}: ${preview.parents.join(" · ")}`
                : undefined
            }
          >
            {preview ? (
              <>
                <PreviewTable preview={preview} />
                {preview.skipped.length > 0 ? (
                  <div className="well flex flex-col gap-2">
                    <span className="text-body font-medium text-ink">
                      {t.skippedTitle}
                    </span>
                    <span className="text-caption text-ink-muted">
                      {t.skippedHint}
                    </span>
                    <ul className="flex flex-col gap-1 text-body text-ink">
                      {preview.skipped.map((item) => (
                        <li key={item.slug}>
                          <span className="font-medium">{item.name}</span> —{" "}
                          {item.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                title={t.previewIdleTitle}
                description={t.previewIdleHint}
              />
            )}
          </StepCard>
        </ResultPanel>
      </ParamsResultLayout>

      <SweepSection
        key={kind}
        kind={kind}
        parentA={selectedA}
        parentB={selectedB}
      />
    </div>
  );
}
