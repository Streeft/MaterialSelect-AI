import type { PropertyCoverage } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import {
  Bar,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  RowHeader,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
} from "@/components/ui";

const t = ptBR.dashboard;

/**
 * The properties worth filling in next, worst coverage first.
 *
 * Not a figure: `gaps` already arrives ranked from the backend
 * (`DashboardService._gaps`), so there is no geometry here for ADR 0004 to
 * govern — only a table, which is already its own textual alternative.
 */
export function GapsList({ gaps }: { gaps: PropertyCoverage[] }) {
  return (
    <Card>
      <CardHeader headingLevel={2} title={t.gapsTitle} description={t.gapsHint} />
      <CardBody>
        {gaps.length === 0 ? (
          <EmptyState title={t.gapsEmpty} />
        ) : (
          <TableScroll label={t.gapsTitle}>
            <Table>
              <TableCaption>{t.gapsTitle}</TableCaption>
              <THead>
                <Tr>
                  <Th>{t.property}</Th>
                  <Th numeric>{t.columnCoverage}</Th>
                  <Th numeric>{t.columnMaterials}</Th>
                </Tr>
              </THead>
              <TBody>
                {gaps.map((g) => (
                  <Tr key={g.slug}>
                    <RowHeader>{g.name}</RowHeader>
                    <Td numeric>
                      <div className="flex items-center justify-end gap-2">
                        <Bar
                          value={g.coverage.filled_pct === null ? null : g.coverage.filled_pct / 100}
                          color="bg-quality-ausente"
                          className="h-1.5 w-16"
                        />
                        <span className="tabular-nums">
                          {g.coverage.filled_pct === null ? t.coverageEmpty : formatPercent(g.coverage.filled_pct)}
                        </span>
                      </div>
                    </Td>
                    <Td numeric className="tabular-nums">
                      {t.coverageOf(g.coverage.filled, g.coverage.slots)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        )}
      </CardBody>
    </Card>
  );
}
