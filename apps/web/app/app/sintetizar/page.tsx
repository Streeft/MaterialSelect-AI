"use client";

import { useMemo, useState } from "react";
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
import { formatNumber } from "@/lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Field,
  Input,
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

const t = ptBR.synthesis;

/** Um valor pode ser escalar ou um par de limites; os dois se leem diferente. */
function Value({ value }: { value: SynthesizedValue }) {
  if (value.value !== null) {
    return <span className="tabular-nums">{formatNumber(value.value)}</span>;
  }
  return (
    <span className="tabular-nums">
      {formatNumber(value.value_min ?? 0)} –{" "}
      {formatNumber(value.value_max ?? 0)}
    </span>
  );
}

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
                {value.canonical_unit ? (
                  <span className="text-ink-muted">
                    {" "}
                    ({value.canonical_unit})
                  </span>
                ) : null}
              </Td>
              <Td>
                <Value value={value} />
              </Td>
              <Td className="text-xs text-ink-muted">
                {/* A base vem junto da fórmula: "conservação de massa" e "ajuste
                    empírico" não são a mesma afirmação sobre o número. */}
                <div className="flex flex-col gap-1">
                  <span className="text-ink">{value.rule.label}</span>
                  <code className="rounded-control bg-surface-muted px-2 py-0.5">
                    {value.rule.formula}
                  </code>
                  <Badge>{value.rule.basis_label}</Badge>
                </div>
              </Td>
              <Td className="text-xs text-ink-muted">{value.quality}</Td>
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

  const [kind, setKind] = useState<SynthesisKind>("composito");
  const [parentA, setParentA] = useState("");
  const [parentB, setParentB] = useState("");
  const [fraction, setFraction] = useState("0.6");
  const [density, setDensity] = useState("0.1");
  const [faceThickness, setFaceThickness] = useState("1.0");
  const [coreThickness, setCoreThickness] = useState("10.0");
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
    // Só os campos do tipo escolhido são enviados. A API recusa os de outros
    // tipos em vez de ignorá-los, então mandar campos indevidos seria um 400 — e
    // mandá-los calados seria pior, porque o leitor digitou um número que a
    // conta não conteria.
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
    if (kind === "espuma") {
      return {
        ...common,
        relative_density: Number(density),
      };
    }
    return {
      ...common,
      parent_b_id: Number(selectedB),
      face_thickness_mm: Number(faceThickness),
      core_thickness_mm: Number(coreThickness),
    };
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
    mutationFn: () => previewSynthesis(body),
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
    if (kind === "espuma") {
      const r = Number(density);
      return r > 0 && r < 1;
    }
    if (kind === "painel_sanduiche") {
      const tFace = Number(faceThickness);
      const cCore = Number(coreThickness);
      return (
        selectedB !== "" &&
        selectedB !== selectedA &&
        tFace > 0 &&
        cCore > 0 &&
        Number.isFinite(tFace) &&
        Number.isFinite(cCore)
      );
    }
    return false;
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

  const info = (kinds.data ?? []).find((item) => item.kind === kind);
  const totalThick = 2.0 * Number(faceThickness) + Number(coreThickness);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.title} description={t.subtitle} />

      <Alert tone="info">{t.principle}</Alert>

      <Section title={t.kindStep}>
        <Select
          label={t.kindLabel}
          value={kind}
          onChange={(event) => {
            setKind((event.target as HTMLSelectElement).value as SynthesisKind);
            setPreview(null);
            setSaved(null);
          }}
        >
          <SelectOption value="composito">{t.kindComposite}</SelectOption>
          <SelectOption value="espuma">{t.kindFoam}</SelectOption>
          <SelectOption value="painel_sanduiche">{t.kindSandwich}</SelectOption>
        </Select>
        {info ? <p className="text-sm text-ink-muted">{info.note}</p> : null}
      </Section>

      <Section title={t.recipeStep}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label={
              kind === "composito"
                ? t.parentALabel
                : kind === "painel_sanduiche"
                  ? t.parentAFaceLabel
                  : t.parentASolidLabel
            }
            value={selectedA}
            onChange={(event) =>
              setParentA((event.target as HTMLSelectElement).value)
            }
          >
            {options.map((material) => (
              <SelectOption key={material.id} value={String(material.id)}>
                {material.name}
              </SelectOption>
            ))}
          </Select>
          {kind === "composito" ? (
            <>
              <Select
                label={t.parentBLabel}
                value={selectedB}
                onChange={(event) =>
                  setParentB((event.target as HTMLSelectElement).value)
                }
              >
                {options.map((material) => (
                  <SelectOption key={material.id} value={String(material.id)}>
                    {material.name}
                  </SelectOption>
                ))}
              </Select>
              <NumberInput
                label={t.fractionLabel}
                hint={t.fractionHint}
                value={fraction}
                min={0}
                max={1}
                step="any"
                onChange={(event) => setFraction(event.target.value)}
              />
            </>
          ) : kind === "espuma" ? (
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
            <>
              <Select
                label={t.parentBCoreLabel}
                value={selectedB}
                onChange={(event) =>
                  setParentB((event.target as HTMLSelectElement).value)
                }
              >
                {options.map((material) => (
                  <SelectOption key={material.id} value={String(material.id)}>
                    {material.name}
                  </SelectOption>
                ))}
              </Select>
              <NumberInput
                label={t.faceThicknessLabel}
                hint={t.faceThicknessHint}
                value={faceThickness}
                min={0}
                step="any"
                onChange={(event) => setFaceThickness(event.target.value)}
              />
              <NumberInput
                label={t.coreThicknessLabel}
                hint={t.coreThicknessHint}
                value={coreThickness}
                min={0}
                step="any"
                onChange={(event) => setCoreThickness(event.target.value)}
              />
              {Number.isFinite(totalThick) && totalThick > 0 ? (
                <div className="sm:col-span-2 text-sm font-medium text-ink-muted">
                  {t.totalThickness(totalThick)}
                </div>
              ) : null}
            </>
          )}
        </div>
        <div>
          <Button
            onClick={() => runPreview.mutate()}
            disabled={!recipeReady || runPreview.isPending}
          >
            {runPreview.isPending ? t.previewing : t.preview}
          </Button>
        </div>
        {runPreview.isError ? (
          <Alert tone="danger">{String(runPreview.error)}</Alert>
        ) : null}
      </Section>

      {preview ? (
        <Section title={t.previewStep}>
          <p className="text-sm text-ink-muted">
            {t.parentsLabel}: {preview.parents.join(" · ")}
          </p>
          <PreviewTable preview={preview} />

          {preview.skipped.length > 0 ? (
            <Card>
              <CardBody className="flex flex-col gap-2">
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
              </CardBody>
            </Card>
          ) : null}
        </Section>
      ) : null}

      {preview ? (
        <Section title={t.identityStep}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t.nameLabel}
              hint={t.nameHint}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Field label={t.classLabel} hint={t.classHint}>
              <Select
                label={t.classLabel}
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
            </Field>
            <Input
              label={t.descriptionLabel}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <Button
              onClick={() => save.mutate()}
              disabled={!canSave || save.isPending}
            >
              {save.isPending ? t.saving : t.save}
            </Button>
          </div>
          {save.isError ? (
            <Alert tone="danger">{String(save.error)}</Alert>
          ) : null}
        </Section>
      ) : null}

      {saved ? (
        <Card>
          <CardBody className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">{t.savedTitle}</span>
            <span className="text-xs text-ink-muted">{t.savedHint}</span>
            {/* A ficha de um registro é `/app/materiais/[id]`; `/app/catalogo/[slug]`
                é a *família*, e apontar para lá cairia numa família de slug "77". */}
            <Link
              className="text-sm text-accent underline underline-offset-2"
              href={`/app/materiais/${saved.material_id}`}
            >
              {t.openRecord}: {saved.material_name}
            </Link>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
