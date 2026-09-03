import Link from "next/link";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { classVisual } from "@/lib/design/palette";
import { Badge, Bar, Card, CardBody } from "@/components/ui";
import { QualityBar } from "@/components/catalog/MaterialRows";

const t = ptBR.catalog;

/**
 * One material, stacked.
 *
 * The catalog table has four columns. At 375 px that's sideways scrolling
 * over small text — readable by no one. Here the same information becomes a
 * stack: name and class, coverage as a bar, and the per-state breakdown
 * `QualityBar` already gives the table — reused rather than duplicated,
 * because the card and the table row describe the same material.
 *
 * `Bar` receives `null` when no property at all is registered — a 0% bar
 * would read as a verdict on a material nobody has filled in yet.
 */
function MaterialCard({ material, index }: { material: MaterialListItem; index: number }) {
  const { quality } = material;
  const filled = quality.medido + quality.importado + quality.estimado;
  const total = filled + quality.missing;

  return (
    <Card riseIndex={index}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <Link
                href={`/app/materiais/${material.id}`}
                className="text-[0.9375rem] font-semibold text-brand-700"
              >
                {material.name}
              </Link>
              {material.is_demo && <Badge tone="warning">{ptBR.demoBadge}</Badge>}
            </span>
            {material.subclass ? (
              <span className="text-xs text-ink-subtle">{material.subclass}</span>
            ) : null}
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-seat bg-surface-sunken px-2 py-1 text-2xs text-ink-muted"
            title={material.class_name}
          >
            <span
              aria-hidden
              className="h-2 w-2 rounded-sm"
              style={{ background: classVisual(material.class_slug).color }}
            />
            {material.class_name}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <Bar
            value={total > 0 ? filled / total : null}
            delay={index * 60}
            className="h-2 flex-1"
            label={t.qualityBreakdown}
          />
          <span className="font-mono text-2xs tabular-nums text-ink-muted">
            {total > 0 ? `${filled}/${total}` : t.noValues}
          </span>
        </div>

        {/* Label written before color: the four states are ordinal by
            confidence, and a reader who can't tell green from amber needs
            the word. */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-edge-subtle pt-3">
          <QualityBar quality={quality} />
        </div>

        {material.keywords.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {material.keywords.map((kw) => (
              <Badge key={kw}>{kw}</Badge>
            ))}
          </span>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * The catalog on narrow screens.
 *
 * Rendered alongside the table, each hidden at the other's breakpoint
 * (`sm:hidden` here, `hidden sm:block` on the table) — that's what keeps
 * markup semantically correct at each width, instead of forcing a `<table>`
 * to behave like a list via CSS.
 *
 * This duplicates the DOM nodes. Acceptable because the catalog is paginated;
 * if the page ever shows hundreds of rows, switch to a `useMediaQuery` that
 * renders only one of the two.
 */
export function MaterialCards({ materials }: { materials: MaterialListItem[] }) {
  return (
    <ul className="flex flex-col gap-3 sm:hidden">
      {materials.map((material, index) => (
        <li key={material.id}>
          <MaterialCard material={material} index={index} />
        </li>
      ))}
    </ul>
  );
}
