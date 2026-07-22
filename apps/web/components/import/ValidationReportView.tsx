import type { ValidationReport } from "@/lib/types";
import { ptBR } from "@/lib/i18n";

const STATUS_STYLES: Record<string, string> = {
  ok: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  duplicate: "bg-amber-100 text-amber-800",
};

const STATUS_LABELS: Record<string, string> = {
  ok: ptBR.importer.statusOk,
  error: ptBR.importer.statusError,
  duplicate: ptBR.importer.statusDuplicate,
};

/** Per-row validation report with summary counters. */
export function ValidationReportView({ report }: { report: ValidationReport }) {
  const counters = [
    { label: ptBR.importer.total, value: report.row_count, style: "text-slate-700" },
    { label: ptBR.importer.ok, value: report.valid_count, style: "text-green-700" },
    { label: ptBR.importer.withError, value: report.error_count, style: "text-red-700" },
    { label: ptBR.importer.duplicates, value: report.duplicate_count, style: "text-amber-700" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counters.map((c) => (
          <div key={c.label} className="rounded-lg border border-slate-200 bg-white p-3 text-center">
            <div className={`text-2xl font-semibold ${c.style}`}>{c.value}</div>
            <div className="text-xs text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2">{ptBR.importer.row}</th>
              <th scope="col" className="px-3 py-2">{ptBR.catalog.columnName}</th>
              <th scope="col" className="px-3 py-2">{ptBR.importer.columnStatus}</th>
              <th scope="col" className="px-3 py-2">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.rows.map((row) => (
              <tr key={row.row_number}>
                <td className="px-3 py-2 text-slate-500">{row.row_number}</td>
                <td className="px-3 py-2 font-medium text-slate-700">{row.name ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[row.status]}`}
                  >
                    {STATUS_LABELS[row.status]}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {row.issues.map((issue, i) => (
                    <div key={i} className="text-red-700">
                      {issue.column ? `${issue.column}: ` : ""}
                      {issue.message}
                    </div>
                  ))}
                  {row.warnings.map((w, i) => (
                    <div key={`w${i}`} className="text-amber-700">{w}</div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
