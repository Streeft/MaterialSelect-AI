"use client";

import { useId, useMemo, useState } from "react";
import type {
  InfographicBlock,
  InfographicLayout,
  InfographicStyle,
  StudioArtifact,
  StudioInfographicContent,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { Alert, Button } from "@/components/ui";
import type { Cites } from "./views";
import { CitationChips } from "../AnswerView";

const t = ptBR.notebooks.studio;

/**
 * The six tones the API numbers `0..5`, as token classes (D-28): a card fill,
 * its outline and the colour of its emphasised line. The palette is the
 * section's ramp alternated with the cyan of `--info` and the neutral
 * surfaces — no status hue (success, warning, danger) and no data-quality hue,
 * because a card's tone is rhythm and says nothing about the data in it. Each
 * pair is one already measured for text in `globals.css` (`brand-700` on
 * `brand-50`, `info-fg` on `info-soft`, …), and the ramp inverts in dark theme,
 * so the same classes hold there.
 */
export const INFOGRAPHIC_TONES = [
  { card: "fill-brand-50 stroke-brand-300", accent: "fill-brand-700" },
  { card: "fill-info-soft stroke-info", accent: "fill-info-fg" },
  { card: "fill-brand-100 stroke-brand-400", accent: "fill-brand-800" },
  { card: "fill-surface-sunken stroke-edge-strong", accent: "fill-ink-muted" },
  { card: "fill-brand-200 stroke-brand-500", accent: "fill-brand-900" },
  { card: "fill-panel stroke-line", accent: "fill-brand-700" },
] as const;

export function toneOf(tone: number) {
  const size = INFOGRAPHIC_TONES.length;
  return INFOGRAPHIC_TONES[((tone % size) + size) % size] ?? INFOGRAPHIC_TONES[0];
}

/**
 * An infographic (D-98), drawn from the API's layout: every box, every wrapped
 * line, every connector end point and the typesetting itself (`styles`) come
 * computed — this only draws them (ADR 0004), so the screen and the exported
 * SVG cannot disagree. Its text alternative (D-31) is a click away: the same
 * content as headed lists, each item with its citation chips.
 */
export function InfographicView({ artifact, cites }: { artifact: StudioArtifact; cites: Cites }) {
  const [asText, setAsText] = useState(false);
  const content = artifact.content as StudioInfographicContent | null;
  const layout = artifact.infographic ?? null;

  const withheld =
    artifact.withheld.length > 0 ? (
      <Alert tone="warning" title={t.infographicWithheldTitle}>
        {artifact.withheld.join(" ")}
      </Alert>
    ) : null;

  if (!layout) {
    return (
      <div className="flex flex-col gap-3">
        {withheld}
        <p className="well text-support text-ink-muted">{t.infographicNoDrawing}</p>
        {content ? <InfographicText content={content} cites={cites} /> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {withheld}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setAsText((v) => !v)}>
          {asText ? t.viewAsImage : t.viewAsText}
        </Button>
      </div>
      {asText && content ? (
        <InfographicText content={content} cites={cites} />
      ) : (
        <>
          <InfographicDrawing layout={layout} title={artifact.title} />
          <SourcesLegend layout={layout} cites={cites} />
        </>
      )}
    </div>
  );
}

// --- Desenho --------------------------------------------------------------------

/** Where block text sits, from the API's typesetting: heading line k starts at
 * `y + pad_y + k·heading_line`, the body after the headings plus `gap` (only
 * when both exist). The baseline is three quarters down each line box. */
function lineTops(block: InfographicBlock, style: InfographicStyle) {
  const top = block.y + style.pad_y;
  const headings = block.heading_lines.map((_, k) => top + k * style.heading_line);
  const bodyStart =
    top +
    block.heading_lines.length * style.heading_line +
    (block.heading_lines.length > 0 && block.body_lines.length > 0 ? style.gap : 0);
  const bodies = block.body_lines.map((_, k) => bodyStart + k * style.body_line);
  return { headings, bodies };
}

const baseline = (top: number, lineHeight: number) => top + 0.75 * lineHeight;

function InfographicDrawing({ layout, title }: { layout: InfographicLayout; title: string }) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const arrow = `infographic-arrow-${id}`;
  const titleId = `infographic-title-${id}`;

  return (
    <div className="well p-2">
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        preserveAspectRatio="xMidYMin meet"
        className="block h-auto w-full"
      >
        <title id={titleId}>{t.infographicLabel(title)}</title>
        <defs>
          <marker
            id={arrow}
            viewBox="0 0 10 10"
            refX={9}
            refY={5}
            markerWidth={8}
            markerHeight={8}
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-ink-subtle" />
          </marker>
        </defs>
        <rect
          x={0}
          y={0}
          width={layout.width}
          height={layout.height}
          className="fill-panel"
          data-part="background"
        />
        {layout.connectors.map((c, i) => (
          <line
            key={i}
            x1={c.x1}
            y1={c.y1}
            x2={c.x2}
            y2={c.y2}
            className="stroke-ink-subtle"
            strokeWidth={2}
            markerEnd={`url(#${arrow})`}
            data-part="connector"
          />
        ))}
        {layout.blocks.map((block, i) => (
          <Block key={i} block={block} style={layout.styles[block.kind]} />
        ))}
      </svg>
    </div>
  );
}

function Block({ block, style }: { block: InfographicBlock; style: InfographicStyle | undefined }) {
  if (!style) return null;
  const { headings, bodies } = lineTops(block, style);
  const card = block.kind === "stat" || block.kind === "point" || block.kind === "step";
  const tone = toneOf(block.tone);
  const headingClass = card ? tone.accent : "fill-ink";
  const bodyClass = block.kind === "subtitle" ? "fill-ink-muted" : "fill-ink";
  // The citation marks sit in the card's bottom padding, which the layout
  // reserves on every card, in a size derived from the body's.
  const markSize = style.body_size * 0.75;

  return (
    <g data-kind={block.kind} data-tone={card ? block.tone : undefined}>
      {card ? (
        <rect
          x={block.x}
          y={block.y}
          width={block.width}
          height={block.height}
          rx={12}
          strokeWidth={1.5}
          className={tone.card}
          data-part="card"
        />
      ) : null}
      {block.heading_lines.map((line, k) => (
        <text
          key={`h${k}`}
          x={block.x + style.pad_x}
          y={baseline(headings[k] ?? 0, style.heading_line)}
          fontSize={style.heading_size}
          fontWeight={700}
          className={headingClass}
        >
          {line}
        </text>
      ))}
      {block.body_lines.map((line, k) => (
        <text
          key={`b${k}`}
          x={block.x + style.pad_x}
          y={baseline(bodies[k] ?? 0, style.body_line)}
          fontSize={style.body_size}
          className={bodyClass}
        >
          {line}
        </text>
      ))}
      {card && block.citations.length > 0 ? (
        <text
          x={block.x + block.width - style.pad_x / 2}
          y={block.y + block.height - (style.pad_y - markSize) / 2}
          fontSize={markSize}
          textAnchor="end"
          className="fill-ink-muted"
        >
          {block.citations.map((n) => `[${n}]`).join(" ")}
        </text>
      ) : null}
    </g>
  );
}

/** The drawing's [n] marks, as the chips that open each excerpt — once each,
 * in number order. The per-item mapping is in the text alternative. */
function SourcesLegend({ layout, cites }: { layout: InfographicLayout; cites: Cites }) {
  const numbers = useMemo(
    () => [...new Set(layout.blocks.flatMap((b) => b.citations))].sort((a, b) => a - b),
    [layout],
  );
  if (numbers.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-1 text-caption text-ink-muted">
      {t.sources}{" "}
      <CitationChips numbers={numbers} byNumber={cites.byNumber} liveSourceIds={cites.liveSourceIds} />
    </p>
  );
}

// --- Texto (D-31) ---------------------------------------------------------------

export function InfographicText({
  content,
  cites,
}: {
  content: StudioInfographicContent;
  cites: Cites;
}) {
  const chips = (numbers: number[]) => (
    <CitationChips numbers={numbers} byNumber={cites.byNumber} liveSourceIds={cites.liveSourceIds} />
  );
  return (
    <div className="flex flex-col gap-4">
      {content.title || content.subtitle ? (
        <div className="flex flex-col gap-1">
          {content.title ? <p className="text-heading text-ink">{content.title}</p> : null}
          {content.subtitle ? <p className="text-support text-ink-muted">{content.subtitle}</p> : null}
        </div>
      ) : null}
      {content.stats.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-base font-semibold text-ink">{t.stats}</h4>
          <ul className="ml-5 list-disc space-y-1.5">
            {content.stats.map((stat, i) => (
              <li key={i} className="text-sm text-ink">
                <span className="inline-flex flex-wrap items-center gap-1">
                  <strong className="font-semibold">{stat.value}</strong>
                  {stat.label ? <span>{" "}— {stat.label}</span> : null}
                  {chips(stat.citations)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {content.points.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-base font-semibold text-ink">{t.points}</h4>
          <ul className="ml-5 list-disc space-y-1.5">
            {content.points.map((point, i) => (
              <li key={i} className="text-sm text-ink">
                <span className="inline-flex flex-wrap items-center gap-1">
                  {point.heading ? <strong className="font-semibold">{point.heading}</strong> : null}
                  {point.heading && point.text ? <span aria-hidden>{" "}·</span> : null}
                  {point.text ? <span>{" "}{point.text}</span> : null}
                  {chips(point.citations)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {content.steps.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-base font-semibold text-ink">{t.steps}</h4>
          <ol className="ml-5 list-decimal space-y-1.5">
            {content.steps.map((step, i) => (
              <li key={i} className="text-sm text-ink">
                <span className="inline-flex flex-wrap items-center gap-1">
                  <span>{step.text}</span>
                  {chips(step.citations)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
