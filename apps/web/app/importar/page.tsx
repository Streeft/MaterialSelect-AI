"use client";

import { useRef, useState } from "react";
import Link from "next/link";
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
  if (!nameCol) return { error: "Indique qual coluna contém o nome do material." };
  const propCols = columns.filter((c) => c.target === "property");
  if (propCols.some((c) => !c.propertySlug)) {
    return { error: "Há colunas de propriedade sem a propriedade selecionada." };
  }
  const classCol = columns.find((c) => c.target === "class");
  if (!classCol && defaultClassId === null) {
    return { error: "Mapeie uma coluna de classe ou escolha uma classe padrão." };
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

export default function ImportPage() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

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
      setError("Informe um nome para o template.");
      return;
    }
    doSaveTemplate.mutate({ name: templateName.trim(), mapping: built.mapping });
  }

  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: t.stepUpload },
    { key: "mapping", label: t.stepMapping },
    { key: "report", label: t.stepReport },
    { key: "done", label: t.stepDone },
  ];

  const inputClass =
    "rounded border border-slate-300 bg-white px-2 py-1 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{t.title}</h1>
        <nav aria-label="Etapas" className="flex gap-2 text-xs">
          {steps.map((s) => (
            <span
              key={s.key}
              className={
                "rounded-full px-2 py-1 " +
                (step === s.key ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500")
              }
            >
              {s.label}
            </span>
          ))}
        </nav>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {step === "upload" && (
        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="mb-3 text-sm text-slate-600">{t.dropHint}</p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx"
            aria-label={t.dropHint}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) doUpload.mutate(file);
            }}
            className="text-sm"
          />
          {doUpload.isPending && <p className="mt-2 text-sm text-slate-500">{t.uploading}</p>}
        </section>
      )}

      {step === "mapping" && upload && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-slate-700">{upload.filename}</span>
            <span className="text-slate-500">{t.rows(upload.row_count)}</span>
            {upload.sheet_names.length > 1 && (
              <label className="flex items-center gap-1 text-slate-600">
                {t.sheet}:
                <select
                  className={inputClass}
                  value={upload.sheet_name ?? ""}
                  onChange={(e) => doPreviewSheet.mutate(e.target.value)}
                >
                  {upload.sheet_names.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <details className="rounded-lg border border-slate-200 bg-white p-3" open>
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              {t.preview}
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    {upload.headers.map((h) => (
                      <th key={h} className="border-b border-slate-200 px-2 py-1 text-left font-medium text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {upload.sample_rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="border-b border-slate-100 px-2 py-1 text-slate-600">
                          {cell ?? <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div>
            <h2 className="mb-1 text-sm font-semibold text-slate-800">{t.mappingTitle}</h2>
            <p className="mb-2 text-xs text-slate-500">{t.mappingHelp}</p>
            <MappingEditor
              columns={columns}
              properties={properties.data ?? []}
              onChange={setColumns}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-slate-600">
              {t.defaultClass}
              <select
                className={`${inputClass} mt-1 block w-full`}
                value={defaultClassId ?? ""}
                onChange={(e) =>
                  setDefaultClassId(e.target.value ? Number(e.target.value) : null)
                }
              >
                <option value="">{t.noDefaultClass}</option>
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-600">
              {t.sourceLabel}
              <input
                className={`${inputClass} mt-1 block w-full`}
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="ex.: Planilha Prof. Fulano 2026"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <span className="font-medium text-slate-700">{t.templates}:</span>
            <select
              className={inputClass}
              aria-label={t.applyTemplate}
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
                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder={t.templateName}
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={doSaveTemplate.isPending}
              className="rounded border border-slate-300 px-3 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {t.saveTemplate}
            </button>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleValidate}
              disabled={doValidate.isPending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {doValidate.isPending ? t.validating : t.validate}
            </button>
            <button
              type="button"
              onClick={() => doCancel.mutate()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {t.cancelImport}
            </button>
          </div>
        </section>
      )}

      {step === "report" && report && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">{t.reportTitle}</h2>
          <ValidationReportView report={report} />
          <p className="text-xs text-slate-500">{t.commitHint}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => doCommit.mutate()}
              disabled={doCommit.isPending || report.valid_count === 0}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {doCommit.isPending ? t.committing : `${t.commit} (${report.valid_count})`}
            </button>
            <button
              type="button"
              onClick={() => setStep("mapping")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              ← {t.stepMapping}
            </button>
            <button
              type="button"
              onClick={() => doCancel.mutate()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              {t.cancelImport}
            </button>
          </div>
        </section>
      )}

      {step === "done" && result && (
        <section className="rounded-lg border border-green-200 bg-green-50 p-6">
          <h2 className="text-lg font-semibold text-green-800">{t.doneTitle}</h2>
          <p className="mt-1 text-sm text-green-700">
            {t.doneSummary(result.imported_count, result.skipped_count)}
          </p>
          <div className="mt-4 flex gap-3 text-sm">
            <Link
              href="/catalogo"
              className="rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
            >
              {t.goCatalog}
            </Link>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-300 px-4 py-2 text-slate-600 hover:bg-white"
            >
              {t.newImport}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">{t.historyTitle}</h2>
        <ImportHistory />
      </section>
    </div>
  );
}
