"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ApiError,
  downloadCaeCard,
  getMaterialCurve,
  listCaeFormats,
  listMaterialCurves,
  materialExportUrl,
  type CaeFormat,
  type CaePlasticChoice,
  type CaeUnitSystem,
} from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { ptBR } from "@/lib/i18n";
import { caeText } from "@/lib/i18n-cae";
import { flowText } from "@/lib/i18n-flow";
import {
  Alert,
  Button,
  Dialog,
  ErrorState,
  LoadingState,
  MenuButton,
  MenuItem,
  Select,
  SelectOption,
} from "@/components/ui";
import { IconDownload } from "@/components/ui/icons";

const t = ptBR.cae;
const x = caeText;

/** The formats by what the card carries, in the order the select lists them. */
const GROUPS: { group: keyof typeof x.formatGroups; formats: CaeFormat[] }[] = [
  { group: "elastic", formats: ["mapdl", "abaqus", "nastran", "lsdyna", "matml"] },
  { group: "thermal", formats: ["nastran-thermal", "lsdyna-thermal"] },
  {
    group: "plastic",
    formats: ["mapdl-plastic", "abaqus-plastic", "nastran-plastic", "lsdyna-plastic"],
  },
];
const FORMAT_LABELS: Record<CaeFormat, string> = { ...t.formats, ...x.formats };
const SYSTEMS: CaeUnitSystem[] = ["m-kg-s", "mm-t-s", "in-lbf-s"];

/** The loaders the dialog reads with; injected in tests, the real ones fetch. */
export interface CaeLoaders {
  formats: typeof listCaeFormats;
  curves: typeof listMaterialCurves;
  curve: typeof getMaterialCurve;
}

/** Hands a blob to the browser's own save dialog, under the server's filename. */
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * The CAE material card (D-104): format and unit system, then the file.
 *
 * Both choices are explicit and the unit system has no "automatic" option: a
 * solver multiplies the numbers it is given, so the system has to be the one
 * the model uses, and only the person building the model knows which that is.
 *
 * What each format requires is read from the server (D-171), not copied here.
 * An elastoplastic format (D-119) also asks which stress-strain curve, and which
 * series of it when it has several: neither is ever chosen for the person, and
 * the card is not offered until both are named. Anything the record still lacks
 * comes back as a 422 shown in the dialog with the server's own sentence — it
 * names what is missing — and the dialog stays open so another format (MatML
 * accepts any registered property) can be tried at once.
 */
export function CaeExportDialog({
  materialId,
  open,
  onClose,
  download = downloadCaeCard,
  saveFile = save,
  loaders,
}: {
  materialId: number;
  open: boolean;
  onClose: () => void;
  /** Injected in tests; the real one fetches the card. */
  download?: typeof downloadCaeCard;
  saveFile?: (blob: Blob, filename: string) => void;
  loaders?: Partial<CaeLoaders>;
}) {
  const read: CaeLoaders = {
    formats: loaders?.formats ?? listCaeFormats,
    curves: loaders?.curves ?? listMaterialCurves,
    curve: loaders?.curve ?? getMaterialCurve,
  };
  const [format, setFormat] = useState<CaeFormat>("mapdl");
  const [units, setUnits] = useState<CaeUnitSystem>("mm-t-s");
  // "" is "not chosen yet": the dialog never picks a curve or a series.
  const [curveId, setCurveId] = useState("");
  const [seriesPosition, setSeriesPosition] = useState("");

  const formats = useQuery({
    queryKey: ["cae-formats"],
    queryFn: () => read.formats(),
    enabled: open,
    staleTime: Infinity,
  });
  const spec = formats.data?.find((f) => f.key === format);
  // Until the server's list arrives (or if it cannot be read) the key's own
  // suffix says whether a curve is needed: a plastic card without one is a 400.
  const plastic = spec ? spec.plastic : format.endsWith("-plastic");

  const curves = useQuery({
    queryKey: ["cae-dialog-curves", materialId],
    queryFn: () => read.curves(materialId),
    enabled: open && plastic,
  });
  const stressStrain = curves.data?.curves.filter((c) => c.kind === "TENSAO_DEFORMACAO") ?? [];
  const curve = stressStrain.find((c) => String(c.id) === curveId);
  const severalSeries = curve !== undefined && curve.series_count > 1;

  const curveDetail = useQuery({
    queryKey: ["cae-dialog-curve", materialId, curveId],
    queryFn: () => read.curve(materialId, Number(curveId)),
    enabled: open && plastic && severalSeries,
  });

  const choice: CaePlasticChoice | undefined =
    curve === undefined
      ? undefined
      : severalSeries
        ? seriesPosition === ""
          ? undefined
          : { curve: curve.id, series: Number(seriesPosition) }
        : { curve: curve.id };
  const ready = !plastic || choice !== undefined;
  // Written next to the disabled button: what is still to be chosen, never a bare gray button.
  const chooseHint =
    !plastic || ready || stressStrain.length === 0
      ? null
      : curve === undefined
        ? x.curve.chooseFirst
        : curveDetail.data
          ? x.series.chooseFirst
          : null;

  const card = useMutation({
    mutationFn: () =>
      plastic && choice
        ? download(materialId, format, units, choice)
        : download(materialId, format, units),
    onSuccess: ({ blob, filename }) => {
      saveFile(blob, filename);
      onClose();
    },
  });

  const refused = card.error instanceof ApiError && card.error.status === 422;

  function close() {
    card.reset();
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t.title}
      description={t.description}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t.cancel}
          </Button>
          <Button
            variant="primary"
            loading={card.isPending}
            disabled={!ready}
            onClick={() => card.mutate()}
          >
            {t.download}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Select
          label={t.formatLabel}
          value={format}
          onChange={(event) => {
            setFormat(event.target.value as CaeFormat);
            card.reset();
          }}
        >
          {GROUPS.map(({ group, formats: keys }) => (
            <optgroup key={group} label={x.formatGroups[group]}>
              {keys.map((key) => (
                <SelectOption key={key} value={key}>
                  {FORMAT_LABELS[key]}
                </SelectOption>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select
          label={t.unitsLabel}
          hint={t.unitsHint}
          value={units}
          onChange={(event) => {
            setUnits(event.target.value as CaeUnitSystem);
            card.reset();
          }}
        >
          {SYSTEMS.map((key) => (
            <SelectOption key={key} value={key}>
              {t.units[key]}
            </SelectOption>
          ))}
        </Select>

        <Requirements query={formats} spec={spec} plastic={plastic} />

        {plastic ? (
          <>
            {curves.isPending ? (
              <LoadingState label={x.curve.loading} className="py-2" />
            ) : curves.isError ? (
              <ErrorState
                title={x.curve.errorTitle}
                description={curves.error.message}
                onRetry={() => void curves.refetch()}
              />
            ) : stressStrain.length === 0 ? (
              <Alert tone="warning" title={x.curve.noneTitle}>
                {x.curve.noneBody}
              </Alert>
            ) : (
              <Select
                label={x.curve.label}
                hint={x.curve.hint}
                value={curveId}
                onChange={(event) => {
                  setCurveId(event.target.value);
                  setSeriesPosition("");
                  card.reset();
                }}
              >
                <SelectOption value="">{x.curve.placeholder}</SelectOption>
                {stressStrain.map((c) => (
                  <SelectOption key={c.id} value={String(c.id)}>
                    {x.curve.option(c.title, c.series_count)}
                  </SelectOption>
                ))}
              </Select>
            )}

            {curve && !severalSeries ? (
              <p className="text-support text-ink-muted">{x.series.single}</p>
            ) : null}
            {severalSeries ? (
              curveDetail.isPending ? (
                <LoadingState label={x.series.loading} className="py-2" />
              ) : curveDetail.isError ? (
                <ErrorState
                  title={x.series.errorTitle}
                  description={curveDetail.error.message}
                  onRetry={() => void curveDetail.refetch()}
                />
              ) : (
                <Select
                  label={x.series.label}
                  hint={x.series.hint}
                  value={seriesPosition}
                  onChange={(event) => {
                    setSeriesPosition(event.target.value);
                    card.reset();
                  }}
                >
                  <SelectOption value="">{x.series.placeholder}</SelectOption>
                  {curveDetail.data.series.map((s) => {
                    const parameter =
                      s.parameter_value !== null && curveDetail.data.parameter
                        ? `${formatNumber(s.parameter_value)} ${curveDetail.data.parameter.unit_label}`
                        : null;
                    const name = s.label ?? x.series.unnamed(s.position);
                    return (
                      <SelectOption key={s.id} value={String(s.position)}>
                        {parameter && !name.includes(parameter) ? `${name} (${parameter})` : name}
                      </SelectOption>
                    );
                  })}
                </Select>
              )
            ) : null}

            {chooseHint ? <p className="text-support text-ink-muted">{chooseHint}</p> : null}
          </>
        ) : null}

        <p className="text-caption text-ink-subtle">{t.notice}</p>
        {card.error ? (
          <Alert
            tone={refused ? "warning" : "danger"}
            role="alert"
            title={refused ? t.refusedTitle : t.errorTitle}
          >
            {card.error.message}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}

/** What the chosen format requires, in the server's own words (D-171). */
function Requirements({
  query,
  spec,
  plastic,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  spec: { required: { label: string }[]; plastic_max_points: number | null } | undefined;
  plastic: boolean;
}) {
  const r = x.requirements;
  if (spec) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-support text-ink-muted">
          {spec.required.length > 0
            ? r.some(spec.required.map((q) => q.label).join(", "))
            : r.none}
        </p>
        {plastic ? <p className="text-support text-ink-muted">{r.plasticExtra}</p> : null}
        {spec.plastic_max_points !== null ? (
          <p className="text-support text-ink-muted">
            {r.maxPoints(formatNumber(spec.plastic_max_points))}
          </p>
        ) : null}
      </div>
    );
  }
  if (query.isPending) return <LoadingState label={r.loading} className="py-2" />;
  if (query.isError) {
    return <ErrorState title={r.error} onRetry={() => void query.refetch()} />;
  }
  return null;
}

/**
 * The datasheet's "Exportar ▾" (D-91, D-125): one menu button, never a row of
 * buttons, providing both the complete material datasheet (HTML/PDF) and the CAE dialog.
 */
export function MaterialExportMenu({
  materialId,
  unitChoices,
  download,
  saveFile,
  loaders,
}: {
  materialId: number;
  unitChoices?: Record<string, string>;
  download?: typeof downloadCaeCard;
  saveFile?: (blob: Blob, filename: string) => void;
  loaders?: Partial<CaeLoaders>;
}) {
  const [open, setOpen] = useState(false);
  const pdfUrl = materialExportUrl(materialId, "html", unitChoices);
  return (
    <>
      <MenuButton label={ptBR.exports.title} icon={<IconDownload className="h-4 w-4" />}>
        <MenuItem
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          hint={flowText.materialExport.sheetHint}
        >
          {flowText.materialExport.sheet}
        </MenuItem>
        <MenuItem onSelect={() => setOpen(true)} hint={x.menuHint}>
          {t.menuItem}
        </MenuItem>
      </MenuButton>
      <CaeExportDialog
        materialId={materialId}
        open={open}
        onClose={() => setOpen(false)}
        {...(download ? { download } : {})}
        {...(saveFile ? { saveFile } : {})}
        {...(loaders ? { loaders } : {})}
      />
    </>
  );
}
