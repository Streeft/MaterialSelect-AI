/**
 * The elimination funnel, with the demo catalog's numbers.
 *
 * Each bar grows from the origin (`.grow-x`) and is staggered, so the page
 * narrates the elimination instead of just showing its result — which is
 * exactly what the tool does and a spreadsheet doesn't show.
 *
 * The numbers are static on purpose: the showcase is an indexable server
 * component, and hitting the database to draw a visual proof would couple the
 * sales page to the catalog state of whoever opened it.
 */
const STAGES = [
  { label: "Catálogo", count: 48, width: 100, opacity: 0.85, final: false },
  { label: "Módulo ≥ 60 GPa", count: 31, width: 65, opacity: 0.7, final: false },
  { label: "Densidade ≤ 3 000 kg/m³", count: 14, width: 29, opacity: 0.56, final: false },
  { label: "Temp. ≥ 120 °C", count: 9, width: 19, opacity: 1, final: true },
] as const;

export function FunnelPreview() {
  return (
    <figure className="flex flex-col gap-4 rounded-card bg-rail p-6 text-rail-ink">
      <figcaption className="flex items-baseline justify-between gap-4">
        <h3 className="text-base font-semibold">Funil de eliminação</h3>
        <span className="font-mono text-2xs text-rail-ink-subtle">48 → 9</span>
      </figcaption>

      <ol className="flex flex-col gap-3">
        {STAGES.map((stage, index) => (
          <li key={stage.label} className="flex flex-col gap-1.5">
            <div
              className={`flex justify-between text-[0.8125rem] ${
                stage.final ? "font-semibold text-rail-ink" : "text-rail-ink-muted"
              }`}
            >
              <span>{stage.label}</span>
              <span className="font-mono tabular-nums">{stage.count}</span>
            </div>
            <span
              aria-hidden
              className="grow-x block h-6 rounded-seat bg-brand-500"
              style={{
                width: `${stage.width}%`,
                opacity: stage.opacity,
                animationDelay: `${index * 100}ms`,
              }}
            />
          </li>
        ))}
      </ol>

      <p className="border-t border-rail-edge/10 pt-3.5 text-[0.8125rem] leading-relaxed text-rail-ink-subtle">
        Os 4 candidatos excluídos por dado ausente vêm nomeados junto com o resultado, com a
        propriedade que faltava. Nada desaparece em silêncio.
      </p>
    </figure>
  );
}
