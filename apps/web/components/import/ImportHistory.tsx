"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listImports, rollbackImport } from "@/lib/api";
import { ptBR } from "@/lib/i18n";

const STATUS_STYLES: Record<string, string> = {
  PENDENTE: "bg-slate-100 text-slate-600",
  VALIDADO: "bg-blue-100 text-blue-800",
  IMPORTADO: "bg-green-100 text-green-800",
  CANCELADO: "bg-slate-100 text-slate-500",
  REVERTIDO: "bg-amber-100 text-amber-800",
};

/** Past import jobs with status and a rollback action for committed ones. */
export function ImportHistory() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["imports"], queryFn: listImports });

  const rollback = useMutation({
    mutationFn: (jobId: number) => rollbackImport(jobId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["imports"] });
      qc.invalidateQueries({ queryKey: ["materials"] });
      qc.invalidateQueries({ queryKey: ["chart"] });
    },
  });

  if (isLoading) return null;
  if (!data || data.length === 0) {
    return <p className="text-sm text-slate-500">{ptBR.importer.historyEmpty}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-3 py-2">{ptBR.importer.columnFile}</th>
            <th scope="col" className="px-3 py-2">{ptBR.importer.columnDate}</th>
            <th scope="col" className="px-3 py-2">{ptBR.importer.columnStatus}</th>
            <th scope="col" className="px-3 py-2">{ptBR.importer.columnCounts}</th>
            <th scope="col" className="px-3 py-2">{ptBR.importer.columnImported}</th>
            <th scope="col" className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((job) => (
            <tr key={job.id}>
              <td className="px-3 py-2 font-medium text-slate-700">
                {job.filename}
                {job.sheet_name ? (
                  <span className="ml-1 text-xs text-slate-400">({job.sheet_name})</span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-slate-500">
                {new Date(job.created_at).toLocaleString("pt-BR")}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[job.status]}`}
                >
                  {ptBR.importer.status[job.status]}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-600">
                {job.valid_count} / {job.error_count} / {job.duplicate_count}
              </td>
              <td className="px-3 py-2 text-slate-600">{job.imported_count}</td>
              <td className="px-3 py-2 text-right">
                {job.status === "IMPORTADO" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(ptBR.importer.rollbackConfirm)) {
                        rollback.mutate(job.id);
                      }
                    }}
                    disabled={rollback.isPending}
                    className="rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {ptBR.importer.rollback}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
