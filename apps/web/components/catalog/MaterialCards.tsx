import Link from "next/link";
import type { MaterialListItem } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { classVisual } from "@/lib/design/palette";
import { Bar, Card, CardBody } from "@/components/ui";
import { QualityBar } from "@/components/catalog/MaterialRows";

const t = ptBR.catalog;

/**
 * Um material, empilhado.
 *
 * A tabela do catálogo tem quatro colunas. A 375 px isso é rolagem lateral
 * sobre texto pequeno — legível para ninguém. Aqui a mesma informação vira
 * uma pilha: nome e classe, a cobertura como barra, e o detalhamento por
 * estado que `QualityBar` já dá à tabela — reaproveitado em vez de duplicado,
 * porque o card e a linha da tabela descrevem o mesmo material.
 *
 * `Bar` recebe `null` quando não há propriedade nenhuma cadastrada — uma
 * barra de 0% leria como um veredito sobre um material que ninguém preencheu
 * ainda.
 */
function MaterialCard({ material, index }: { material: MaterialListItem; index: number }) {
  const { quality } = material;
  const filled = quality.medido + quality.importado + quality.estimado;
  const total = filled + quality.missing;

  return (
    <Card riseIndex={index}>
      <CardBody className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              href={`/app/materiais/${material.id}`}
              className="text-[0.9375rem] font-semibold text-brand-700"
            >
              {material.name}
            </Link>
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

        {/* Rótulo escrito antes da cor: os quatro estados são ordinais por
            confiança, e um leitor que não distinga verde de âmbar precisa da
            palavra. */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-edge-subtle pt-3">
          <QualityBar quality={quality} />
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * O catálogo em telas estreitas.
 *
 * Renderizado ao lado da tabela, cada um escondido no breakpoint do outro
 * (`sm:hidden` aqui, `hidden sm:block` na tabela) — é o que mantém a marcação
 * semântica correta em cada largura, em vez de forçar um `<table>` a se
 * comportar como uma lista via CSS.
 *
 * Isso duplica os nós no DOM. É aceitável porque o catálogo é paginado; se a
 * página passar a mostrar centenas de linhas, trocar por um `useMediaQuery`
 * que renderize só um dos dois.
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
