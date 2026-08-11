import type { RowReport, ValidationReport } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Badge,
  Card,
  TBody,
  THead,
  Table,
  TableScroll,
  Td,
  Th,
  RowHeader,
  Tr,
  type BadgeTone,
} from "@/components/ui";

const t = ptBR.importer;

/**
 * Severity, in three cues at once.
 *
 * The row status used to be a coloured pill and nothing else, which meant the
 * one thing the screen is for — telling apart a line that will import from a
 * line that will not — lived entirely in colour. Tone, word and row tint now
 * carry it together, and the word is the one that survives greyscale.
 */
const STATUS: Record<RowReport["status"], { tone: BadgeTone; label: string; row?: string }> = {
  ok: { tone: "success", label: t.statusOk },
  error: { tone: "danger", label: t.statusError, row: "bg-danger-soft/40" },
  duplicate: { tone: "warning", label: t.statusDuplicate, row: "bg-warning-soft/40" },
};

/** Per-row validation report with summary counters. */
export function ValidationReportView({ report }: { report: ValidationReport }) {
  const counters: { label: string; value: number; tone: BadgeTone }[] = [
    { label: t.total, value: report.row_count, tone: "neutral" },
    { label: t.ok, value: report.valid_count, tone: "success" },
    { label: t.withError, value: report.error_count, tone: "danger" },
    { label: t.duplicates, value: report.duplicate_count, tone: "warning" },
  ];

  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {counters.map((c) => (
          <Card key={c.label} className="flex flex-col items-center gap-1 px-3 py-3">
            <dd className="text-2xl font-semibold tabular-nums text-ink">{c.value}</dd>
            <dt>
              <Badge tone={c.tone}>{c.label}</Badge>
            </dt>
          </Card>
        ))}
      </dl>

      <p className="text-xs text-ink-muted">{t.reportHint}</p>

      {/* A long report scrolls inside itself; the sticky header keeps the
          column meanings on screen while it does. */}
      <TableScroll label={t.reportTitle} className="max-h-96 overflow-y-auto">
        <Table>
          <THead>
            <Tr>
              <Th numeric>{t.row}</Th>
              <Th>{ptBR.catalog.columnName}</Th>
              <Th>{t.columnStatus}</Th>
              <Th>{t.columnDetails}</Th>
            </Tr>
          </THead>
          <TBody>
            {report.rows.map((row) => {
              const status = STATUS[row.status];
              return (
                <Tr key={row.row_number} className={status.row}>
                  <Td numeric className="text-ink-subtle">
                    {row.row_number}
                  </Td>
                  {/* A missing name is a fact about the file, not a dash to be
                      confused with a name that is literally "—". */}
                  <RowHeader>
                    {row.name ?? <span className="font-normal italic text-ink-subtle">{t.noName}</span>}
                  </RowHeader>
                  <Td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </Td>
                  <Td>
                    {row.issues.length === 0 && row.warnings.length === 0 ? (
                      <span className="text-2xs text-ink-subtle">{t.rowOk}</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.issues.map((issue, i) => (
                          <li key={i} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                            <Badge tone="danger">{t.issueLabel}</Badge>
                            <span className="text-ink">
                              {issue.column ? `${issue.column}: ` : ""}
                              {issue.message}
                            </span>
                          </li>
                        ))}
                        {row.warnings.map((w, i) => (
                          <li key={`w${i}`} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                            <Badge tone="warning">{t.warningLabel}</Badge>
                            <span className="text-ink">{w}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </TableScroll>
    </div>
  );
}
