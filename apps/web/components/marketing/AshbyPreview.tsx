/**
 * The showcase's Ashby map.
 *
 * Static SVG, with labeled logarithmic axes, per-class envelopes, ten points,
 * and the merit-index guide line drawing itself in. It is not the product's
 * chart component: that one loads Plotly, needs client data, and runs in the
 * browser — three things an indexable public page doesn't want.
 *
 * The values are the demo catalog's, in the same relative positions the real
 * chart produces. The palette is the Okabe–Ito class palette, imported rather
 * than retyped: the showcase's figure and the product's can't disagree about
 * the color of "metals".
 *
 * `role="img"` with `aria-label`: the figure is a visual proof, and the
 * description substitutes for what it shows to someone who can't see it. The
 * inner elements are decorative as a consequence.
 */
import { classVisual } from "@/lib/design/palette";

const ENVELOPES = [
  { slug: "metais", cx: 462, cy: 118, rx: 116, ry: 50, rot: -18 },
  { slug: "polimeros", cx: 274, cy: 280, rx: 94, ry: 42, rot: -12 },
  { slug: "ceramicas", cx: 412, cy: 80, rx: 80, ry: 36, rot: -14 },
  { slug: "compositos", cx: 324, cy: 138, rx: 86, ry: 44, rot: -22 },
  { slug: "elastomeros", cx: 294, cy: 328, rx: 60, ry: 24, rot: 0 },
] as const;

const POINTS = [
  { x: 346, y: 134, slug: "compositos", r: 7 },
  { x: 478, y: 110, slug: "metais", r: 7 },
  { x: 408, y: 140, slug: "metais", r: 7 },
  { x: 516, y: 94, slug: "metais", r: 6 },
  { x: 422, y: 76, slug: "ceramicas", r: 6 },
  { x: 390, y: 88, slug: "ceramicas", r: 6 },
  { x: 280, y: 276, slug: "polimeros", r: 6 },
  { x: 244, y: 296, slug: "polimeros", r: 6 },
  { x: 312, y: 264, slug: "polimeros", r: 6 },
  { x: 294, y: 328, slug: "elastomeros", r: 6 },
] as const;

const X_TICKS = [
  { x: 66, label: "100" },
  { x: 190, label: "300" },
  { x: 314, label: "1 000" },
  { x: 438, label: "3 000" },
  { x: 562, label: "10 000" },
] as const;

const Y_TICKS = [
  { y: 344, label: "0,01" },
  { y: 262, label: "1" },
  { y: 180, label: "10" },
  { y: 98, label: "100" },
  { y: 16, label: "1 000" },
] as const;

const LEGEND = [
  { slug: "metais", label: "Metais" },
  { slug: "polimeros", label: "Polímeros" },
  { slug: "ceramicas", label: "Cerâmicas" },
  { slug: "compositos", label: "Compósitos" },
] as const;

export function AshbyPreview() {
  return (
    <figure className="rounded-[1.375rem] border border-rail-edge/15 bg-surface-raised p-5 shadow-overlay">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-4 border-b border-edge-subtle pb-3.5">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[0.625rem] uppercase tracking-eyebrow text-brand-700">
            mapa de ashby
          </span>
          <span className="text-[0.9375rem] font-semibold text-ink">
            Módulo de Young × Densidade
          </span>
        </div>
        <span className="font-mono text-2xs text-ink-subtle">guia: E^(1/2)/ρ</span>
      </figcaption>

      <svg
        viewBox="0 0 700 400"
        className="mt-3 h-auto w-full"
        role="img"
        aria-label="Mapa de Ashby de módulo de Young contra densidade, em escala logarítmica. Dez materiais do catálogo de demonstração, agrupados por classe, com a linha-guia do índice raiz de E sobre rho. A fibra de carbono e epóxi aparece em primeiro lugar."
      >
        <g stroke="rgb(var(--edge-subtle))" strokeWidth="1">
          <line x1="66" y1="16" x2="66" y2="344" />
          <line x1="66" y1="344" x2="684" y2="344" />
          {X_TICKS.slice(1).map((tick) => (
            <line key={tick.x} x1={tick.x} y1="16" x2={tick.x} y2="344" />
          ))}
          {Y_TICKS.slice(1, 4).map((tick) => (
            <line key={tick.y} x1="66" y1={tick.y} x2="684" y2={tick.y} />
          ))}
        </g>

        <g fill="rgb(var(--ink-subtle))" fontFamily="var(--font-mono), monospace" fontSize="10">
          {X_TICKS.map((tick) => (
            <text key={tick.x} x={tick.x} y="362" textAnchor="middle">
              {tick.label}
            </text>
          ))}
          {Y_TICKS.map((tick) => (
            <text key={tick.y} x="56" y={tick.y + 4} textAnchor="end">
              {tick.label}
            </text>
          ))}
        </g>

        <g fill="rgb(var(--ink-muted))" fontSize="11" fontFamily="var(--font-sans), sans-serif">
          <text x="375" y="386" textAnchor="middle">
            Densidade · kg/m³
          </text>
          <text x="18" y="180" textAnchor="middle" transform="rotate(-90 18 180)">
            Módulo de Young · GPa
          </text>
        </g>

        {/* The guide line draws itself in once. It's the relationship the index
            expresses — see the note on motion in globals.css. */}
        <line
          x1="146"
          y1="334"
          x2="624"
          y2="52"
          stroke="rgb(var(--brand-700))"
          strokeWidth="2"
          strokeDasharray="900"
          strokeLinecap="round"
          className="animate-[dash_1800ms_cubic-bezier(0.2,0,0,1)_300ms_both]"
        />

        <g opacity="0.15">
          {ENVELOPES.map((envelope) => (
            <ellipse
              key={envelope.slug}
              cx={envelope.cx}
              cy={envelope.cy}
              rx={envelope.rx}
              ry={envelope.ry}
              fill={classVisual(envelope.slug).color}
              transform={`rotate(${envelope.rot} ${envelope.cx} ${envelope.cy})`}
            />
          ))}
        </g>

        <g>
          {POINTS.map((point) => (
            <circle
              key={`${point.x}-${point.y}`}
              cx={point.x}
              cy={point.y}
              r={point.r}
              fill={classVisual(point.slug).color}
              stroke="rgb(var(--surface-raised))"
              strokeWidth="2"
            />
          ))}
          <circle cx="346" cy="134" r="13" fill="none" stroke="rgb(var(--brand-700))" strokeWidth="2" />
          <rect x="360" y="110" width="204" height="30" rx="9" fill="rgb(var(--rail))" />
          <text
            x="372"
            y="129"
            fill="rgb(var(--rail-ink))"
            fontSize="11.5"
            fontFamily="var(--font-sans), sans-serif"
          >
            Fibra de carbono / epóxi · 1º
          </text>
        </g>
      </svg>

      <ul className="flex flex-wrap gap-x-3.5 gap-y-2 border-t border-edge-subtle pt-3">
        {LEGEND.map((item) => (
          <li key={item.slug} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: classVisual(item.slug).color }} />
            {item.label}
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <span aria-hidden className="h-0.5 w-4 bg-brand-700" />
          Linha-guia do índice
        </li>
      </ul>
    </figure>
  );
}
