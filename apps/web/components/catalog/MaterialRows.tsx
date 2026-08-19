import Link from "next/link";
import type { DataQualitySummary, MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { classVisual } from "@/lib/design/palette";
import {
  Badge,
  Card,
  CardBody,
  ClassBadge,
  DataQualityBadge,
  RowHeader,
  TBody,
  THead,
  Table,
  TableCaption,
  TableScroll,
  Td,
  Th,
  Tr,
  type QualityState,
} from "@/components/ui";

const t = ptBR.catalog;

/** The three qualities, in the order the legend lists them, plus absence. */
const PARTS: { state: QualityState; of: (q: DataQualitySummary) => number }[] = [
  { state: "MEDIDO", of: (q) => q.medido },
  { state: "IMPORTADO", of: (q) => q.importado },
  { state: "ESTIMADO", of: (q) => q.estimado },
  { state: "AUSENTE", of: (q) => q.missing },
];

/**
 * What a material's data is made of, in one line.
 *
 * The catalogue used to say only that a material existed. Whether its numbers
 * were measured, imported, guessed or simply absent was a click away on the
 * sheet — which is where a reader finds out too late that the shortlist they
 * just built rests on estimates. Absence is one of the counts, never a blank.
 */
export function QualityBar({ quality }: { quality: DataQualitySummary }) {
  const present = PARTS.filter((p) => p.of(quality) > 0);
  if (present.length === 0) {
    return <span className="text-2xs italic text-ink-subtle">{t.noValues}</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-1" aria-label={t.qualityBreakdown}>
      {present.map((p) => (
        <DataQualityBadge
          key={p.state}
          state={p.state}
          className="tabular-nums"
          showLabel={false}
        />
      ))}
      <span className="ml-0.5 text-2xs text-ink-subtle">
        {present.map((p) => `${p.of(quality)} ${ptBR.quality[p.state].toLowerCase()}`).join(" · ")}
      </span>
    </span>
  );
}

function MaterialName({ material }: { material: MaterialListItem }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={`/materiais/${material.id}`} className="font-medium text-brand hover:underline">
        {material.name}
      </Link>
      {material.is_demo && <Badge tone="warning">{ptBR.demoBadge}</Badge>}
    </span>
  );
}

export function MaterialTable({ materials }: { materials: MaterialListItem[] }) {
  return (
    <TableScroll label={t.title}>
      <Table>
        <TableCaption>{t.title}</TableCaption>
        <THead>
          <Tr>
            <Th>{t.columnName}</Th>
            <Th>{t.columnClass}</Th>
            <Th>{t.columnQuality}</Th>
            <Th>{t.columnKeywords}</Th>
          </Tr>
        </THead>
        <TBody>
          {materials.map((m) => (
            <Tr key={m.id}>
              <RowHeader>
                <MaterialName material={m} />
                {m.subclass && <span className="block text-xs text-ink-subtle">{m.subclass}</span>}
              </RowHeader>
              <Td>
                <ClassBadge name={m.class_name} color={classVisual(m.class_slug).color} />
              </Td>
              <Td>
                <QualityBar quality={m.quality} />
              </Td>
              <Td>
                <span className="flex flex-wrap gap-1">
                  {m.keywords.map((kw) => (
                    <Badge key={kw}>{kw}</Badge>
                  ))}
                </span>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableScroll>
  );
}

/**
 * The same rows as cards.
 *
 * Not decoration: on a phone the four-column table scrolls sideways inside its
 * own box, and reading one material then means dragging back and forth. The
 * cards carry exactly the same facts, stacked.
 */
export function MaterialCards({ materials }: { materials: MaterialListItem[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {materials.map((m) => (
        <li key={m.id}>
          <Card className="h-full">
            <CardBody className="flex h-full flex-col gap-2">
              <MaterialName material={m} />
              <span className="flex flex-wrap items-center gap-2">
                <ClassBadge name={m.class_name} color={classVisual(m.class_slug).color} />
                {m.subclass && <span className="text-xs text-ink-subtle">{m.subclass}</span>}
              </span>
              <QualityBar quality={m.quality} />
              {m.keywords.length > 0 && (
                <span className="mt-auto flex flex-wrap gap-1 pt-1">
                  {m.keywords.map((kw) => (
                    <Badge key={kw}>{kw}</Badge>
                  ))}
                </span>
              )}
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
  );
}
