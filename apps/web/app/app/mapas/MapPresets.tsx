"use client";

import type { MapPreset } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { ToggleChip } from "@/components/ui";

const t = ptBR.map;

/**
 * The classic Ashby charts (D-213), one click each. They come from the backend
 * as data — axes, scale and index, never a material's number — and a chart
 * this catalogue cannot draw stays listed, disabled, with what it lacks.
 */
export function MapPresets({
  presets,
  activeSlug,
  onApply,
  error = false,
}: {
  presets: MapPreset[] | undefined;
  activeSlug: string | null;
  onApply: (preset: MapPreset) => void;
  error?: boolean;
}) {
  if (error) return <p className="text-support text-ink-muted">{t.presetsError}</p>;
  if (!presets || presets.length === 0) return null;
  return (
    <div className="subsection flex flex-col gap-2">
      <h3 id="mapas-classicos" className="text-body font-semibold text-ink">
        {t.presetsTitle}
      </h3>
      <p className="text-support text-ink-muted">{t.presetsHint}</p>
      <div role="group" aria-labelledby="mapas-classicos" className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const why = preset.available
            ? preset.description
            : t.presetUnavailable(preset.missing_properties.join(", "));
          return (
            <ToggleChip
              key={preset.slug}
              // A long pair of axes wraps inside the chip rather than past
              // the side panel's edge (the card hides what overflows).
              className="h-auto max-w-full whitespace-normal text-left"
              selected={preset.slug === activeSlug}
              disabled={!preset.available}
              title={why}
              aria-describedby={`preset-${preset.slug}-hint`}
              onClick={() => onApply(preset)}
            >
              {preset.name}
            </ToggleChip>
          );
        })}
      </div>
      {/* The descriptions the chips point at: read by assistive technology,
          not drawn (the chip's tooltip shows the same sentence). */}
      <div hidden>
        {presets.map((preset) => (
          <span key={preset.slug} id={`preset-${preset.slug}-hint`}>
            {preset.available
              ? preset.description
              : t.presetUnavailable(preset.missing_properties.join(", "))}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The preset the map currently draws: same axes, same index expression (or none). */
export function activePresetSlug(
  presets: MapPreset[] | undefined,
  x: string,
  y: string,
  indexExpression: string | null,
): string | null {
  const match = presets?.find(
    (p) => p.x === x && p.y === y && (p.index?.expression ?? null) === indexExpression,
  );
  return match?.slug ?? null;
}
