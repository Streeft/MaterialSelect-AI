import type { CompositionEntry } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { compositionContent, compositionOriginal } from "@/lib/composition";
import {
  Badge,
  DataQualityBadge,
  EmptyState,
  MissingValue,
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
 * The chemical composition on the material sheet (D-105).
 *
 * A table and not a figure: the composition *is* the text alternative, and a
 * pie of mass fractions would have to invent the balance it is not allowed to
 * compute. Absence is written out in words — the whole table missing ("não
 * cadastrada"), an element declared absent, the balance — never a blank, a
 * dash or a 0 (D-24).
 */
export function CompositionTable({
  entries,
  materialIsDemo,
}: {
  entries: CompositionEntry[];
  /** The page already says the material is fictitious; rows then don't repeat it. */
  materialIsDemo: boolean;
}) {
  if (entries.length === 0) {
    return <EmptyState title={t.noComposition} description={t.noCompositionHint} />;
  }
  return (
    <TableScroll label={t.compositionCaption}>
      <Table>
        <TableCaption>{t.compositionCaption}</TableCaption>
        <THead>
          <Tr>
            <Th>{t.columnElement}</Th>
            <Th>{t.columnContent}</Th>
            <Th>{t.columnOriginal}</Th>
            <Th>{t.columnSource}</Th>
            <Th>{t.columnQuality}</Th>
          </Tr>
        </THead>
        <TBody>
          {entries.map((entry) => {
            const original = compositionOriginal(entry);
            return (
              <Tr key={entry.element}>
                <RowHeader>
                  <abbr title={entry.element_name} className="font-mono no-underline">
                    {entry.element}
                  </abbr>
                  <span className="block text-xs text-ink-subtle">{entry.element_name}</span>
                </RowHeader>
                <Td>
                  {entry.state === "ausente" ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <MissingValue />
                      <span>{compositionContent(entry)}</span>
                    </span>
                  ) : (
                    <span className={entry.state === "resto" ? "italic" : "tabular-nums"}>
                      {compositionContent(entry)}
                    </span>
                  )}
                </Td>
                <Td>
                  {original === null ? (
                    <span className="text-xs italic text-ink-subtle">{t.noOriginal}</span>
                  ) : (
                    <span className="flex flex-col">
                      <span className="tabular-nums">{original}</span>
                      {entry.conversion_method && (
                        <span className="text-2xs text-ink-subtle">
                          {t.conversion(entry.conversion_method)}
                        </span>
                      )}
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="flex flex-col">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {entry.source_label}
                      {entry.is_demo && !materialIsDemo && (
                        <Badge tone="warning">{t.demoRow}</Badge>
                      )}
                    </span>
                    <span className="text-2xs text-ink-subtle">
                      {entry.citation ?? t.noCitation}
                    </span>
                  </span>
                </Td>
                <Td>
                  <DataQualityBadge state={entry.data_quality} />
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </TableScroll>
  );
}
