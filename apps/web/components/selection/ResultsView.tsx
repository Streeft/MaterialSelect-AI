import Link from "next/link";
import type { RunResult } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatNumber, prettyUnit } from "@/lib/format";

const t = ptBR.selection;

export function ResultsView({ result }: { result: RunResult }) {
  const { funnel, candidates, index, ranking } = result;
  const rankedById = new Map(ranking?.ranked.map((r) => [r.material_id, r]) ?? []);

  // Carry the surviving candidates over to the visual surfaces. The top-ranked
  // material is highlighted on the map so the two views tell the same story.
  const candidateIds = candidates.map((c) => c.material_id).join(",");
  const topId = ranking?.ranked.find((r) => r.rank === 1)?.material_id;

  return (
    <div className="space-y-6">
      {/* Funnel */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">{t.funnel}</h3>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded bg-slate-100 px-2 py-1 text-slate-600">
            {t.initial}: <strong>{result.initial_count}</strong>
          </span>
          {funnel.map((step, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="text-slate-400">→</span>
              <span className="rounded bg-slate-100 px-2 py-1 text-slate-600" title={`${t.passed}: ${step.passed}`}>
                {step.label}: <strong>{step.remaining}</strong>
              </span>
            </span>
          ))}
          <span className="ml-auto text-slate-500">
            {t.candidates}: <strong className="text-brand-700">{result.final_count}</strong> {t.of}{" "}
            {result.initial_count}
          </span>
        </div>
      </section>

      {candidates.length === 0 && (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">{t.emptyResults}</p>
      )}

      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/mapas?materiais=${candidateIds}${topId ? `&destaque=${topId}` : ""}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-slate-50"
          >
            {t.viewOnMap} →
          </Link>
          <Link
            href={`/comparar?materiais=${candidateIds}`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-slate-50"
          >
            {t.compareCandidates} →
          </Link>
        </div>
      )}

      {/* Candidates + ranking */}
      {candidates.length > 0 && (
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {ranking && <th className="px-3 py-2">{t.rank}</th>}
                <th className="px-3 py-2">{ptBR.catalog.columnName}</th>
                <th className="px-3 py-2">{ptBR.catalog.columnClass}</th>
                {index && (
                  <th className="px-3 py-2">
                    {t.indexValue}
                    {index.dimension && index.dimension !== "dimensionless" && (
                      <span className="ml-1 font-normal normal-case text-slate-400">
                        [{prettyUnit(index.dimension)}]
                      </span>
                    )}
                  </th>
                )}
                {ranking && <th className="px-3 py-2">{t.score}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {candidates.map((c) => {
                const ranked = rankedById.get(c.material_id);
                return (
                  <tr key={c.material_id} className={c.rank === 1 ? "bg-green-50" : undefined}>
                    {ranking && <td className="px-3 py-2 font-semibold text-slate-700">{c.rank ?? "—"}</td>}
                    <td className="px-3 py-2 font-medium text-brand-700">{c.name}</td>
                    <td className="px-3 py-2 text-slate-600">{c.class_name}</td>
                    {index && (
                      <td className="px-3 py-2 text-slate-700">
                        {c.index_value === null ? (
                          <span className="text-slate-400">indefinido</span>
                        ) : (
                          formatNumber(c.index_value)
                        )}
                      </td>
                    )}
                    {ranking && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded bg-slate-100">
                            <div className="h-full bg-brand-500" style={{ width: `${(c.score ?? 0) * 100}%` }} />
                          </div>
                          <span className="tabular-nums text-slate-600">
                            {c.score !== null ? c.score.toFixed(3) : "—"}
                          </span>
                        </div>
                        {ranked && (
                          <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-400">
                            {ranked.contributions.map((ct) => (
                              <span key={ct.key} title={`${t.weight} ${ct.weight.toFixed(2)} × ${ct.normalized.toFixed(2)}`}>
                                {ct.label}: {ct.contribution.toFixed(3)}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Excluded for missing data */}
      {ranking && ranking.excluded.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-semibold text-amber-800">{t.excludedTitle}</h3>
          <p className="mb-2 text-xs text-amber-700">{t.excludedHint}</p>
          <ul className="space-y-1 text-sm text-amber-800">
            {ranking.excluded.map((e) => (
              <li key={e.material_id}>
                {e.name} — {t.missing}: {e.missing_keys.join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sensitivity */}
      {ranking && ranking.sensitivity.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-700">{t.sensitivity}</h3>
          <p className="mb-2 text-xs text-slate-500">{t.sensitivityHint}</p>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-1">{t.scenario}</th>
                <th className="px-2 py-1">{t.topMaterial}</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {ranking.sensitivity.map((s, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-600">{s.description}</td>
                  <td className="px-2 py-1 text-slate-700">{s.top_material_name ?? "—"}</td>
                  <td className="px-2 py-1">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs " +
                        (s.changed ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")
                      }
                    >
                      {s.changed ? t.changed : t.unchanged}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
