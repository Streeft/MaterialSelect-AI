import type { Designation } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import {
  Badge,
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

const t = ptBR.detail;

/**
 * The names this material carries in naming systems (D-105).
 *
 * Each one with the source that states it, and nothing that links it to
 * another record: a shared code is not a declared equivalence (TM1).
 */
export function DesignationTable({
  designations,
  materialIsDemo,
}: {
  designations: Designation[];
  materialIsDemo: boolean;
}) {
  if (designations.length === 0) {
    return <EmptyState title={t.noDesignations} description={t.noDesignationsHint} />;
  }
  return (
    <TableScroll label={t.designationsCaption}>
      <Table>
        <TableCaption>{t.designationsCaption}</TableCaption>
        <THead>
          <Tr>
            <Th>{t.columnSystem}</Th>
            <Th>{t.columnCode}</Th>
            <Th>{t.columnRegion}</Th>
            <Th>{t.columnSource}</Th>
          </Tr>
        </THead>
        <TBody>
          {designations.map((d) => (
            <Tr key={`${d.system}:${d.code}`}>
              <RowHeader>{d.system_label}</RowHeader>
              <Td>
                <span className="font-mono">{d.code}</span>
              </Td>
              <Td>
                {d.region ?? <span className="text-xs italic text-ink-subtle">{t.noRegion}</span>}
              </Td>
              <Td>
                <span className="flex flex-col">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {d.source_label}
                    {d.is_demo && !materialIsDemo && <Badge tone="warning">{t.demoRow}</Badge>}
                  </span>
                  <span className="text-2xs text-ink-subtle">{d.citation ?? t.noCitation}</span>
                </span>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}
