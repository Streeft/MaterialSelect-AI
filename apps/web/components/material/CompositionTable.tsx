import type { AtomicComposition, CompositionEntry } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { atomicContent, compositionContent, compositionOriginal } from "@/lib/composition";
import {
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
 *
 * TM2-c (D-117): `entries` are the rows of one condition, and `atomic` is that
 * condition's atomic percent as the backend derived it. When it is derived,
 * a column carries it, labelled "derivada"; when it is not, the column is not
 * drawn with blanks — a sentence under the table says it is absent and why.
 */
export function CompositionTable({
  entries,
  conditionLabel = null,
  atomic,
}: {
  entries: CompositionEntry[];
  /** The page already says the material is fictitious; rows then don't repeat it. */
  /** The condition these rows are stated for; `null` is "no condition stated". */
  conditionLabel?: string | null;
  /** The derived atomic percent of these rows, or its written absence. */
  atomic?: AtomicComposition;
}) {
  if (entries.length === 0) {
    return <EmptyState title={t.noComposition} description={t.noCompositionHint} />;
  }
  const derived = atomic && atomic.reason === null ? atomic : null;
  const atomicByElement = new Map((derived?.entries ?? []).map((a) => [a.element, a]));
  const caption = conditionLabel === null ? t.compositionCaption : t.conditionCaption(conditionLabel);
  return (
    <div className="flex flex-col gap-2">
    <TableScroll label={caption}>
      <Table>
        <TableCaption>{caption}</TableCaption>
        <THead>
          <Tr>
            <Th>{t.columnElement}</Th>
            <Th>{t.columnContent}</Th>
            {derived && <Th>{t.columnAtomic}</Th>}
            <Th>{t.columnOriginal}</Th>
            <Th>{t.columnSource}</Th>
            <Th>{t.columnQuality}</Th>
          </Tr>
        </THead>
        <TBody>
          {entries.map((entry) => {
            const original = compositionOriginal(entry);
            return (
              <Tr key={`${entry.condition_label ?? ""}:${entry.element}`}>
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
                {derived && (
                  <Td>
                    {(() => {
                      const value = atomicByElement.get(entry.element);
                      // Derived whole or not at all: every row has its value.
                      return value ? (
                        <span className="tabular-nums">{atomicContent(value)}</span>
                      ) : (
                        <MissingValue />
                      );
                    })()}
                  </Td>
                )}
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
    {derived && <p className="text-caption text-ink-subtle">{t.atomicBasis(derived.basis)}</p>}
    {atomic && atomic.reason !== null && (
      <p className="flex flex-wrap items-center gap-1.5 text-support text-ink-muted">
        <MissingValue />
        <span>
          <strong className="font-medium">{t.atomicAbsentTitle}</strong> —{" "}
          {t.atomicAbsentReasons[atomic.reason]}. {atomic.message}
        </span>
      </p>
    )}
    </div>
  );
}
