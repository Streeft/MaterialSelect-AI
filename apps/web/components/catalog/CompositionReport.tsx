import type { CompositionSearchReport, UndeterminedBreakdown } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { Alert } from "@/components/ui";

const t = ptBR.catalog;

/**
 * What a composition search says besides its rows (D-105).
 *
 * The rule that ran (reach) in the backend's own words, and how many
 * materials were left out because the data was absent — which is not the same
 * as failing the condition, and a list that silently dropped them would read
 * as if they had.
 */
export function CompositionReport({ report }: { report: CompositionSearchReport }) {
  return (
    <Alert tone="info" title={t.compositionReportTitle} role="status">
      <p>{report.rule}</p>
      <p className="font-medium text-ink">{t.compositionUndetermined(report.undetermined)}</p>
      <p>{t.compositionWithout(report.without_composition)}</p>
      <ul className="list-disc pl-5">
        {report.conditions.map((c) => (
          <li key={c.label}>
            {t.compositionCondition(c.label, c.satisfied, c.not_satisfied, c.undetermined)}
            {c.undetermined > 0 && <> ({reasons(c.undetermined_by_reason)})</>}
          </li>
        ))}
      </ul>
    </Alert>
  );
}

function reasons(breakdown: UndeterminedBreakdown): string {
  return (Object.keys(t.compositionReasons) as (keyof UndeterminedBreakdown)[])
    .filter((key) => breakdown[key] > 0)
    .map((key) => `${breakdown[key]} ${t.compositionReasons[key]}`)
    .join("; ");
}
