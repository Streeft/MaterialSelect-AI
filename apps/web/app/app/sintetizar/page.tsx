"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
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
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  DataQualityBadge,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  MissingValue,
  NumberInput,
  PageHeader,
  RadioCard,
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
  type QualityState,
} from "@/components/ui";

const t = ptBR.synthesis;

const QUALITY_STATES: readonly string[] = ["MEDIDO", "IMPORTADO", "ESTIMADO", "AUSENTE"];

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
                {value.canonical_unit && value.canonical_unit !== "dimensionless" ? (
                  <span className="font-normal text-ink-muted">
                    {" "}
                    ({prettyUnit(value.canonical_unit)})
                  </span>
                ) : null}
              </Td>
              <Td>
                <Value value={value} />
              </Td>
              <Td className="text-xs text-ink-muted">
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
              <Td className="text-xs text-ink-muted">
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
  const [kind, setKind] = useState<SynthesisKind>("composito");
  const [parentA, setParentA] = useState("");
  const [parentB, setParentB] = useState("");
  const [fraction, setFraction] = useState("0.6");
  const [density, setDensity] = useState("0.1");
  const [faceThickness, setFaceThickness] = useState("1");
  const [coreThickness, setCoreThickness] = useState("18");
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<SynthesisPreview | null>(null);
  const [saved, setSaved] = useState<SynthesisResult | null>(null);

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

  const runPreview = useMutation({
    // A prévia não cria registro, então não pede nome — mas a API valida o
    // mesmo corpo da gravação e recusa `name` vazio com 422. Sem este nome
    // provisório a prévia nunca rodava: o campo de nome só aparece depois
    // dela. O nome provisório não é gravado em lugar nenhum.
    mutationFn: () =>
      previewSynthesis({ ...body, name: body.name || t.previewName }),
    onSuccess: (result) => {
      setPreview(result);
      setSaved(null);
    },
  });

  const save = useMutation({
    mutationFn: () => createSynthesis(body),
    onSuccess: (result) => {
      setSaved(result);
      setPreview(result);
      materials.refetch();
    },
  });

  const recipeReady = useMemo(() => {
    if (selectedA === "" || selectedClass === "") return false;
    if (kind === "composito") {
      const f = Number(fraction);
      return selectedB !== "" && selectedB !== selectedA && f > 0 && f < 1;
    }
    if (kind === "painel") {
      // Sem teto: um painel de 200 mm é tão legítimo quanto um de 2 mm, e é a
      // razão entre as duas espessuras que decide o resultado.
      const t = Number(faceThickness);
      const c = Number(coreThickness);
      return selectedB !== "" && selectedB !== selectedA && t > 0 && c > 0;
    }
    const r = Number(density);
    return r > 0 && r < 1;
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

  // Gravar exige nome; a prévia não, porque ela não cria registro nenhum e a
  // pergunta "o que sairia daqui" não depende de como o resultado se chamaria.
  const canSave = recipeReady && name.trim().length > 0;

  if (kinds.isLoading || materials.isLoading || classes.isLoading) {
    return <LoadingState label={t.title} />;
  }
  if (kinds.isError) return <ErrorState description={String(kinds.error)} />;
  if (materials.isError)
    return <ErrorState description={String(materials.error)} />;
  if (classes.isError)
    return <ErrorState description={String(classes.error)} />;

  const noteOf = (value: SynthesisKind) =>
    (kinds.data ?? []).find((item) => item.kind === value)?.note;

  const materialOptions = options.map((material) => (
    <SelectOption key={material.id} value={String(material.id)}>
      {material.name}
    </SelectOption>
  ));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <Alert tone="info">{t.principle}</Alert>

      <Card>
        <CardHeader headingLevel={2} title={t.kindStep} />
        <CardBody>
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
                      setKind(value as SynthesisKind);
                      setPreview(null);
                      setSaved(null);
                    }}
                    title={item.label}
                  >
                    {note ? (
                      <p className="text-xs leading-relaxed text-ink-muted">
                        <Emphasis text={note} />
                      </p>
                    ) : null}
                  </RadioCard>
                );
              })}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader headingLevel={2} title={t.recipeStep} />
            <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Select
                label={
                  kind === "composito"
                    ? t.parentALabel
                    : kind === "painel"
                      ? t.faceLabel
                      : t.parentASolidLabel
                }
                value={selectedA}
                onChange={(event) =>
                  setParentA((event.target as HTMLSelectElement).value)
                }
              >
                {materialOptions}
              </Select>
              {kind === "espuma" ? (
                <NumberInput
                  label={t.densityLabel}
                  hint={t.densityHint}
                  value={density}
                  min={0}
                  max={1}
                  step="any"
                  onChange={(event) => setDensity(event.target.value)}
                />
              ) : (
                <Select
                  label={kind === "painel" ? t.coreLabel : t.parentBLabel}
                  value={selectedB}
                  onChange={(event) =>
                    setParentB((event.target as HTMLSelectElement).value)
                  }
                >
                  {materialOptions}
                </Select>
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
                    onChange={(event) => setFraction(event.target.value)}
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
                    onChange={(event) => setFaceThickness(event.target.value)}
                  />
                  <NumberInput
                    label={t.coreThicknessLabel}
                    value={coreThickness}
                    min={0}
                    step="any"
                    onChange={(event) => setCoreThickness(event.target.value)}
                  />
                  <p className="text-xs text-ink-muted sm:col-span-2 xl:col-span-1">
                    {t.thicknessHint}
                  </p>
                </>
              ) : null}
              {runPreview.isError ? (
                <Alert tone="danger" className="sm:col-span-2 xl:col-span-1">
                  {String(runPreview.error)}
                </Alert>
              ) : null}
            </CardBody>
            <CardFooter className="justify-start">
              <Button
                variant="primary"
                onClick={() => runPreview.mutate()}
                disabled={!recipeReady || runPreview.isPending}
              >
                {runPreview.isPending ? t.previewing : t.preview}
              </Button>
            </CardFooter>
          </Card>

          {preview ? (
            <Card>
              <CardHeader headingLevel={2} title={t.identityStep} />
              <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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
                  <Alert tone="danger" className="sm:col-span-2 xl:col-span-1">
                    {String(save.error)}
                  </Alert>
                ) : null}
              </CardBody>
              <CardFooter className="justify-start">
                <Button
                  variant="primary"
                  onClick={() => save.mutate()}
                  disabled={!canSave || save.isPending}
                >
                  {save.isPending ? t.saving : t.save}
                </Button>
              </CardFooter>
            </Card>
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
        </div>

        {/* The result sits beside the recipe, not under it: changing a
            fraction and reading what moved should not cost a scroll. */}
        <Card className="min-w-0 xl:sticky xl:top-6">
          <CardHeader
            headingLevel={2}
            title={t.previewStep}
            description={
              preview ? `${t.parentsLabel}: ${preview.parents.join(" · ")}` : undefined
            }
          />
          <CardBody className="flex flex-col gap-4">
            {preview ? (
              <>
                <PreviewTable preview={preview} />
                {preview.skipped.length > 0 ? (
                  <div className="flex flex-col gap-2 rounded-card border border-edge bg-surface-sunken p-4">
                    <span className="text-sm font-medium text-ink">
                      {t.skippedTitle}
                    </span>
                    <span className="text-xs text-ink-muted">{t.skippedHint}</span>
                    <ul className="flex flex-col gap-1 text-sm text-ink">
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
              <EmptyState title={t.previewIdleTitle} description={t.previewIdleHint} />
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
