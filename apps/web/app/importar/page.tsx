"use client";

import { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  cancelImport,
  commitImport,
  createImportTemplate,
  listClasses,
  listImportTemplates,
  listProperties,
  previewImportSheet,
  uploadImportFile,
  validateImport,
} from "@/lib/api";
import type {
  CommitResult,
  ImportMapping,
  ImportTemplate,
  UploadResult,
  ValidationReport,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  CardBody,
  Disclosure,
  Field,
  Input,
  Section,
  Select,
  Stepper,
  TBody,
  THead,
  Table,
  TableScroll,
  Td,
  Th,
  Tr,
  type Step as StepItem,
  type StepStatus,
} from "@/components/ui";
import {
  MappingEditor,
  type ColumnState,
  type ColumnTarget,
} from "@/components/import/MappingEditor";
import { ValidationReportView } from "@/components/import/ValidationReportView";
import { ImportHistory } from "@/components/import/ImportHistory";

type Step = "upload" | "mapping" | "report" | "done";

const t = ptBR.importer;

/** Initialise per-column mapping state from the backend suggestions. */
function columnsFromUpload(upload: UploadResult): ColumnState[] {
  return upload.headers.map((header) => {
    const s = upload.suggestions.find((x) => x.column === header);
    const target: ColumnTarget =
      s?.suggested_target === "property"
        ? "property"
        : ((s?.suggested_target as ColumnTarget) ?? "ignore");
    return {
      column: header,
      target: target ?? "ignore",
      propertySlug: s?.suggested_property_slug ?? "",
      role: s?.suggested_role ?? "value",
      unit: s?.suggested_unit ?? "",
    };
  });
}

/** Build the API mapping payload from the editor state (or explain why not). */
function buildMapping(
  columns: ColumnState[],
  defaultClassId: number | null,
  sourceLabel: string,
): { mapping?: ImportMapping; error?: string } {
  const nameCol = columns.find((c) => c.target === "name");
  if (!nameCol) return { error: t.errorNoNameColumn };
  const propCols = columns.filter((c) => c.target === "property");
  if (propCols.some((c) => !c.propertySlug)) {
    return { error: t.errorPropertyWithoutSlug };
  }
  const classCol = columns.find((c) => c.target === "class");
  if (!classCol && defaultClassId === null) {
    return { error: t.errorNoClass };
  }
  return {
    mapping: {
      name_column: nameCol.column,
      class_column: classCol?.column ?? null,
      default_class_id: defaultClassId,
      subclass_column: columns.find((c) => c.target === "subclass")?.column ?? null,
      description_column: columns.find((c) => c.target === "description")?.column ?? null,
      keywords_column: columns.find((c) => c.target === "keywords")?.column ?? null,
      source_label: sourceLabel.trim() || null,
      columns: propCols.map((c) => ({
        column: c.column,
        property_slug: c.propertySlug,
        role: c.role,
        unit: c.unit.trim() || null,
      })),
    },
  };
}

/** Apply a saved template onto the current columns (matched by column name). */
function applyTemplate(columns: ColumnState[], template: ImportTemplate): ColumnState[] {
  const m = template.mapping;
  return columns.map((c) => {
    if (c.column === m.name_column) return { ...c, target: "name" as const };
    if (c.column === m.class_column) return { ...c, target: "class" as const };
    if (c.column === m.subclass_column) return { ...c, target: "subclass" as const };
    if (c.column === m.description_column) return { ...c, target: "description" as const };
    if (c.column === m.keywords_column) return { ...c, target: "keywords" as const };
    const prop = m.columns.find((x) => x.column === c.column);
    if (prop) {
      return {
        ...c,
        target: "property" as const,
        propertySlug: prop.property_slug,
        role: prop.role,
        unit: prop.unit ?? "",
      };
    }
    return { ...c, target: "ignore" as const };
  });
}

/**
 * The same four-step language as `/selecao`.
 *
 * Both screens are wizards, and until now each spelled "where am I" its own way:
 * one with clickable pills that silently did nothing, the other with static
 * ones. A blocked step here is genuinely blocked — there is nothing to map
 * before a file exists.
 */
const STEPS: StepItem<Step>[] = [
  { id: "upload", label: t.stepUpload },
  { id: "mapping", label: t.stepMapping, blockedReason: t.blockedMapping },
  { id: "report", label: t.stepReport, blockedReason: t.blockedReport },
  { id: "done", label: t.stepDone, blockedReason: t.blockedDone },
];

export default function ImportPage() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const [step, setStep] = useState<Step>("upload");
  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [columns, setColumns] = useState<ColumnState[]>([]);
  const [defaultClassId, setDefaultClassId] = useState<number | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");

  const classes = useQuery({ queryKey: ["classes"], queryFn: listClasses });
  const properties = useQuery({ queryKey: ["properties"], queryFn: listProperties });
  const templates = useQuery({ queryKey: ["import-templates"], queryFn: listImportTemplates });

  function fail(err: unknown) {
    setError(err instanceof ApiError ? err.message : t.genericError);
  }

  const doUpload = useMutation({
    mutationFn: (file: File) => uploadImportFile(file),
    onSuccess: (data) => {
      setUpload(data);
      setColumns(columnsFromUpload(data));
      setStep("mapping");
      setError(null);
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: fail,
  });

  const doPreviewSheet = useMutation({
    mutationFn: (sheet: string) => previewImportSheet(upload!.job_id, sheet),
    onSuccess: (data) => {
      setUpload(data);
      setColumns(columnsFromUpload(data));
      setError(null);
    },
    onError: fail,
  });

  const doValidate = useMutation({
    mutationFn: (mapping: ImportMapping) => validateImport(upload!.job_id, mapping),
    onSuccess: (data) => {
      setReport(data);
      setStep("report");
      setError(null);
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: fail,
  });

  const doCommit = useMutation({
    mutationFn: () => commitImport(upload!.job_id),
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
      setError(null);
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["chart"] });
    },
    onError: fail,
  });

  const doCancel = useMutation({
    mutationFn: () => cancelImport(upload!.job_id),
    onSuccess: () => {
      reset();
      qc.invalidateQueries({ queryKey: ["imports"] });
    },
    onError: fail,
  });

  const doSaveTemplate = useMutation({
    mutationFn: (payload: { name: string; mapping: ImportMapping }) =>
      createImportTemplate(payload.name, payload.mapping),
    onSuccess: () => {
      setTemplateName("");
      qc.invalidateQueries({ queryKey: ["import-templates"] });
    },
    onError: fail,
  });

  function reset() {
    setStep("upload");
    setUpload(null);
    setColumns([]);
    setReport(null);
    setResult(null);
    setError(null);
    setDefaultClassId(null);
    setSourceLabel("");
    if (fileInput.current) fileInput.current.value = "";
  }

  function handleValidate() {
    const built = buildMapping(columns, defaultClassId, sourceLabel);
    if (built.error || !built.mapping) {
      setError(built.error ?? t.genericError);
      return;
    }
    doValidate.mutate(built.mapping);
  }

  function handleSaveTemplate() {
    const built = buildMapping(columns, defaultClassId, sourceLabel);
    if (built.error || !built.mapping) {
      setError(built.error ?? t.genericError);
      return;
    }
    if (!templateName.trim()) {
      setError(t.errorTemplateName);
      return;
    }
    doSaveTemplate.mutate({ name: templateName.trim(), mapping: built.mapping });
  }

  /** A step is reachable only once the step before it produced something. */
  function statusOf(item: StepItem<Step>): StepStatus {
    if (item.id === step) return "current";
    switch (item.id) {
      case "upload":
        return upload ? "done" : "upcoming";
      case "mapping":
        return !upload ? "blocked" : report ? "done" : "upcoming";
      case "report":
        return !report ? "blocked" : result ? "done" : "upcoming";
      case "done":
        return result ? "done" : "blocked";
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
        <p className="text-sm text-ink-muted">{t.subtitle}</p>
      </div>

      <Stepper label={ptBR.ui.steps} steps={STEPS} statusOf={statusOf} current={step} onSelect={setStep} />

      {error && (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      )}

      {step === "upload" && (
        <Card>
          <CardBody className="space-y-3">
            {/* A file input manages its own id, so the Field is told which one
                to point at rather than guessing through the control context. */}
            <Field label={t.dropHint} htmlFor={fileInputId}>
              <input
                ref={fileInput}
                id={fileInputId}
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) doUpload.mutate(file);
                }}
                className="text-sm text-ink file:mr-3 file:rounded-control file:border-0 file:bg-brand file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-fg"
              />
            </Field>
            {doUpload.isPending && <p className="text-sm text-ink-muted">{t.uploading}</p>}
          </CardBody>
        </Card>
      )}

      {step === "mapping" && upload && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <span className="font-medium text-ink">{upload.filename}</span>
            <span className="text-ink-muted">{t.rows(upload.row_count)}</span>
            {upload.sheet_names.length > 1 && (
              <Field label={t.sheet} className="w-48">
                <Select
                  value={upload.sheet_name ?? ""}
                  onChange={(e) => doPreviewSheet.mutate(e.target.value)}
                >
                  {upload.sheet_names.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <Disclosure summary={t.preview} defaultOpen>
            <TableScroll label={t.preview}>
              <Table>
                <THead>
                  <Tr>
                    {upload.headers.map((h) => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </Tr>
                </THead>
                <TBody>
                  {upload.sample_rows.map((row, i) => (
                    <Tr key={i}>
                      {row.map((cell, j) => (
                        <Td key={j} className="text-ink-muted">
                          {/* An empty cell in the source file says something;
                              a dash here would be read as the file's content. */}
                          {cell ?? (
                            <span className="text-2xs italic text-ink-subtle">{t.emptyCell}</span>
                          )}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableScroll>
          </Disclosure>

          <Section title={t.mappingTitle} description={t.mappingHelp} headingLevel={2}>
            <MappingEditor
              columns={columns}
              properties={properties.data ?? []}
              onChange={setColumns}
            />
          </Section>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.defaultClass}>
              <Select
                value={defaultClassId ?? ""}
                onChange={(e) => setDefaultClassId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">{t.noDefaultClass}</option>
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.sourceLabel}>
              <Input
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder={t.sourcePlaceholder}
              />
            </Field>
          </div>

          <Card>
            <CardBody className="flex flex-wrap items-end gap-3">
              <Field label={t.templates} className="w-56">
                <Select
                  defaultValue=""
                  onChange={(e) => {
                    const template = (templates.data ?? []).find(
                      (x) => x.id === Number(e.target.value),
                    );
                    if (template) setColumns((cols) => applyTemplate(cols, template));
                  }}
                >
                  <option value="">{t.applyTemplate}</option>
                  {(templates.data ?? []).map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t.templateName} className="w-56">
                <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              </Field>
              <Button onClick={handleSaveTemplate} loading={doSaveTemplate.isPending}>
                {t.saveTemplate}
              </Button>
            </CardBody>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={handleValidate} loading={doValidate.isPending}>
              {doValidate.isPending ? t.validating : t.validate}
            </Button>
            <Button onClick={() => doCancel.mutate()}>{t.cancelImport}</Button>
          </div>
        </div>
      )}

      {step === "report" && report && (
        <Section title={t.reportTitle} headingLevel={2}>
          <ValidationReportView report={report} />
          <p className="text-xs text-ink-muted">{t.commitHint}</p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="primary"
              onClick={() => doCommit.mutate()}
              disabled={report.valid_count === 0}
              loading={doCommit.isPending}
            >
              {doCommit.isPending ? t.committing : `${t.commit} (${report.valid_count})`}
            </Button>
            <Button onClick={() => setStep("mapping")}>← {t.stepMapping}</Button>
            <Button onClick={() => doCancel.mutate()}>{t.cancelImport}</Button>
          </div>
        </Section>
      )}

      {step === "done" && result && (
        <Alert tone="success" title={t.doneTitle}>
          <p>{t.doneSummary(result.imported_count, result.skipped_count)}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <ButtonLink href="/catalogo" variant="primary">
              {t.goCatalog}
            </ButtonLink>
            <Button onClick={reset}>{t.newImport}</Button>
          </div>
        </Alert>
      )}

      <Section title={t.historyTitle} headingLevel={2}>
        <ImportHistory />
      </Section>
    </div>
  );
}
