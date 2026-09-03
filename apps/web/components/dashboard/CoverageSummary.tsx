import type { DashboardOverview } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { formatPercent } from "@/lib/format";
import { Badge, Card, CardBody } from "@/components/ui";

const t = ptBR.dashboard;

/**
 * Um número, nomeado, no seu quadro.
 *
 * `accent` é o traço de 4 px na borda esquerda: ele acompanha o matiz da seção
 * e é o que faz a fileira de quatro números pertencer visivelmente ao painel em
 * vez de flutuar. `index` dá o escalonamento de entrada — a grade sobe da
 * esquerda para a direita, na ordem em que se lê.
 */
function Stat({
  label,
  value,
  note,
  index,
}: {
  label: string;
  value: string;
  note?: string;
  index: number;
}) {
  return (
    <Card riseIndex={index} className="relative overflow-hidden">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-brand" />
      <CardBody className="flex flex-col gap-1">
        <span className="font-mono text-2xs uppercase tracking-eyebrow text-ink-subtle">
          {label}
        </span>
        <span className="text-3xl font-bold tabular-nums tracking-tight text-ink">{value}</span>
        {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
      </CardBody>
    </Card>
  );
}

/**
 * Os quatro números que um leitor quer antes de qualquer outra coisa: o tamanho
 * do catálogo, e quanto dele está de fato preenchido.
 *
 * `coverage.filled_pct` é `null` num catálogo vazio (§1.3: ausência nunca vira
 * número), e é o único caso em que este quadro sai como frase em vez de
 * porcentagem — "0%" aqui leria como veredito sobre um dado que ainda não
 * existe.
 *
 * O quarto quadro é invertido de propósito: a cobertura geral é a única das
 * quatro que é um julgamento sobre o catálogo, e não uma contagem dele.
 */
export function CoverageSummary({ overview }: { overview: DashboardOverview }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        index={0}
        label={t.materials}
        value={overview.materials.toLocaleString("pt-BR")}
        note={overview.demo_materials > 0 ? t.demoNote(overview.demo_materials) : undefined}
      />
      <Stat index={1} label={t.classes} value={overview.classes.toLocaleString("pt-BR")} />
      <Stat index={2} label={t.properties} value={overview.properties.toLocaleString("pt-BR")} />
      <Card riseIndex={3} className="border-transparent bg-rail">
        <CardBody className="flex flex-col gap-1">
          <span className="font-mono text-2xs uppercase tracking-eyebrow text-rail-accent">
            {t.overallCoverage}
          </span>
          {overview.coverage.filled_pct === null ? (
            <Badge tone="neutral" className="w-fit">
              {t.coverageEmpty}
            </Badge>
          ) : (
            <>
              <span className="text-3xl font-bold tabular-nums tracking-tight text-rail-ink">
                {formatPercent(overview.coverage.filled_pct)}
              </span>
              <span className="text-xs text-rail-ink-muted">
                {t.coverageOf(overview.coverage.filled, overview.coverage.slots)}
              </span>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
