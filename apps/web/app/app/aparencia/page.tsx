"use client";

import { useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import {
  APP_COLOR_SECTION,
  APP_COLORS,
  readAppearance,
  serverAppearance,
  setAppearance,
  subscribeAppearance,
  type AppColor,
  type ContrastLevel,
  type MotionPreference,
} from "@/lib/appearance";
import { setTableDensity, useTableDensity, type TableDensity } from "@/lib/density";
import { OKABE_ITO } from "@/lib/design/palette";
import { useAnnounce } from "@/components/ui/Announcer";
import { PaneScaffold } from "@/components/layout/PaneScaffold";
import {
  ButtonGroup,
  ButtonGroupItem,
  DataQualityLegend,
  PageHeader,
  ThemeToggle,
} from "@/components/ui";
import { IconCheck } from "@/components/ui/icons";

const t = ptBR.appearance;

/** The route palettes the "one colour per screen" swatch shows a few of. */
const ROUTE_SWATCH = ["catalogo", "selecao", "mapas", "painel"] as const;

function Setting({ title, hint, children, wide = false }: { title: string; hint: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`flex flex-col gap-3 rounded-card bg-panel p-5 ${wide ? "sm:col-span-2" : ""}`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        <p className="text-support text-ink-muted">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Aparência (D-196; m3.material.io › Styles › Color › Contrast and dynamic
 * colour, Foundations › Customization). The reader's choices for this device,
 * with a preview beside them in the M3 supporting-pane layout (D-182).
 *
 * Every colour shown is a token: a swatch is an element under the palette's own
 * `[data-section]`, painted with `bg-brand` (the `--accent` token), so it can never disagree with
 * what the app will wear.
 */
export default function AppearancePage() {
  const appearance = useSyncExternalStore(subscribeAppearance, readAppearance, serverAppearance);
  const density = useTableDensity();
  const announce = useAnnounce();

  function chooseColor(color: AppColor) {
    setAppearance({ color });
    announce(t.colorChosen(t.colors[color]));
  }

  // WAI-ARIA radio group: one tab stop, arrows move the choice and the focus.
  function onColorKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = APP_COLORS.indexOf(appearance.color);
    const next = APP_COLORS[(at + step + APP_COLORS.length) % APP_COLORS.length]!;
    chooseColor(next);
    event.currentTarget.querySelector<HTMLElement>(`[data-color="${next}"]`)?.focus();
  }

  const settings = (
    <div className="grid gap-4 sm:grid-cols-2">
      <Setting title={t.themeTitle} hint={t.themeHint}>
        <ThemeToggle />
      </Setting>

      <Setting title={t.contrastTitle} hint={t.contrastHint}>
        <ButtonGroup label={t.contrastTitle}>
          {(["standard", "medium", "high"] as ContrastLevel[]).map((level) => (
            <ButtonGroupItem
              key={level}
              label={t.contrast[level]}
              selected={appearance.contrast === level}
              onClick={() => setAppearance({ contrast: level })}
            />
          ))}
        </ButtonGroup>
      </Setting>

      <Setting title={t.colorTitle} hint={t.colorHint} wide>
        <div
          role="radiogroup"
          aria-label={t.colorGroup}
          onKeyDown={onColorKey}
          className="flex flex-wrap items-center gap-3"
        >
          {APP_COLORS.map((color) => {
            const checked = appearance.color === color;
            return (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                data-color={color}
                aria-label={t.colors[color]}
                title={t.colors[color]}
                onClick={() => chooseColor(color)}
                className="m3-swatch"
              >
                {color === "route" ? (
                  <span aria-hidden className="m3-swatch-quad">
                    {ROUTE_SWATCH.map((section) => (
                      <span key={section} data-section={section} className="bg-brand" />
                    ))}
                  </span>
                ) : (
                  <span aria-hidden data-section={APP_COLOR_SECTION[color]} className="m3-swatch-fill bg-brand" />
                )}
                {checked ? <IconCheck aria-hidden className="m3-swatch-check h-4 w-4" /> : null}
              </button>
            );
          })}
          <span className="text-support text-ink-muted" aria-hidden>
            {t.colors[appearance.color]}
          </span>
        </div>
      </Setting>

      <Setting title={t.motionTitle} hint={t.motionHint}>
        <ButtonGroup label={t.motionTitle}>
          {(["standard", "reduced"] as MotionPreference[]).map((motion) => (
            <ButtonGroupItem
              key={motion}
              label={t.motion[motion]}
              selected={appearance.motion === motion}
              onClick={() => setAppearance({ motion })}
            />
          ))}
        </ButtonGroup>
      </Setting>

      <Setting title={t.densityTitle} hint={t.densityHint}>
        <ButtonGroup label={t.densityTitle}>
          {(["comfortable", "compact"] as TableDensity[]).map((option) => (
            <ButtonGroupItem
              key={option}
              label={t.density[option]}
              selected={density === option}
              onClick={() => setTableDensity(option)}
            />
          ))}
        </ButtonGroup>
      </Setting>
    </div>
  );

  const preview = (
    <div className="flex flex-col gap-4 rounded-card bg-panel p-5">
      <h2 className="text-title font-semibold text-ink">{t.previewTitle}</h2>
      {/* Static: what the choices above repaint. Nothing here is a control. */}
      <div aria-hidden className="flex flex-col gap-3 rounded-card border border-line p-4">
        <span className="font-mono text-2xs uppercase tracking-eyebrow text-brand-700">{t.previewEyebrow}</span>
        <span className="text-heading font-semibold text-ink">{t.previewHeading}</span>
        <span className="text-support text-ink-muted">{ptBR.home.lead}</span>
        <div className="flex flex-wrap gap-2">
          <span className="m3-preview-pill m3-preview-primary">{t.previewPrimary}</span>
          <span className="m3-preview-pill m3-preview-tonal">{t.previewTonal}</span>
        </div>
        <span className="m3-preview-pill m3-preview-tonal self-stretch">{t.previewActive}</span>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-support font-semibold text-ink">{t.fixedTitle}</h3>
        <DataQualityLegend />
        <div role="img" aria-label={t.fixedChart} className="flex gap-1">
          {OKABE_ITO.map((color) => (
            <span key={color} className="h-3.5 w-7 rounded" style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />
      <PaneScaffold
        layout="supporting-pane"
        primary={settings}
        secondary={preview}
        primaryLabel={t.title}
        secondaryLabel={t.previewTitle}
      />
    </div>
  );
}
