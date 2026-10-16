/**
 * Specimen of the Material 3 foundations (D-133): colour roles of the current
 * route, shape, elevation, type and state layers. It reads the live tokens, so
 * switching theme or opening it under another `[data-section]` re-colours it.
 */

const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["primary", "on-primary"],
  ["primary-container", "on-primary-container"],
  ["secondary", "on-secondary"],
  ["secondary-container", "on-secondary-container"],
  ["tertiary", "on-tertiary"],
  ["tertiary-container", "on-tertiary-container"],
  ["error", "on-error"],
  ["error-container", "on-error-container"],
  ["surface-container-lowest", "on-surface"],
  ["surface-container-low", "on-surface"],
  ["surface-container", "on-surface"],
  ["surface-container-high", "on-surface"],
  ["surface-container-highest", "on-surface"],
  ["inverse-surface", "inverse-on-surface"],
];

const SHAPES = ["none", "xs", "sm", "md", "lg", "lg-plus", "xl", "xl-plus", "xxl", "m3-full"] as const;
const TYPES = [
  "display-large", "display-medium", "display-small",
  "headline-large", "headline-medium", "headline-small",
  "title-large", "title-medium", "title-small",
  "body-large", "body-medium", "body-small",
  "label-large", "label-medium", "label-small",
] as const;

// Full class names, spelled out: Tailwind only emits what it can read in the source.
const FILL: Record<string, string> = {
  primary: "bg-m3-primary text-m3-on-primary",
  "primary-container": "bg-m3-primary-container text-m3-on-primary-container",
  secondary: "bg-m3-secondary text-m3-on-secondary",
  "secondary-container": "bg-m3-secondary-container text-m3-on-secondary-container",
  tertiary: "bg-m3-tertiary text-m3-on-tertiary",
  "tertiary-container": "bg-m3-tertiary-container text-m3-on-tertiary-container",
  error: "bg-m3-error text-m3-on-error",
  "error-container": "bg-m3-error-container text-m3-on-error-container",
  "surface-container-lowest": "bg-m3-surface-container-lowest text-m3-on-surface",
  "surface-container-low": "bg-m3-surface-container-low text-m3-on-surface",
  "surface-container": "bg-m3-surface-container text-m3-on-surface",
  "surface-container-high": "bg-m3-surface-container-high text-m3-on-surface",
  "surface-container-highest": "bg-m3-surface-container-highest text-m3-on-surface",
  "inverse-surface": "bg-m3-inverse-surface text-m3-inverse-on-surface",
};
const RADIUS: Record<string, string> = {
  none: "rounded-m3-none", xs: "rounded-m3-xs", sm: "rounded-m3-sm", md: "rounded-m3-md",
  lg: "rounded-m3-lg", "lg-plus": "rounded-m3-lg-plus", xl: "rounded-m3-xl",
  "xl-plus": "rounded-m3-xl-plus", xxl: "rounded-m3-xxl", "m3-full": "rounded-m3-full",
};
const ELEVATION = ["shadow-elev-0", "shadow-elev-1", "shadow-elev-2", "shadow-elev-3", "shadow-elev-4", "shadow-elev-5"];
// Same reason: literal classes, so the scanner keeps them.
const TYPE_LITERAL = [
  "text-m3-display-large", "text-m3-display-medium", "text-m3-display-small",
  "text-m3-headline-large", "text-m3-headline-medium", "text-m3-headline-small",
  "text-m3-title-large", "text-m3-title-medium", "text-m3-title-small",
  "text-m3-body-large", "text-m3-body-medium", "text-m3-body-small",
  "text-m3-label-large", "text-m3-label-medium", "text-m3-label-small",
];

export function M3Foundations() {
  return (
    <div className="flex flex-col gap-6" data-testid="m3-foundations">
      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Papéis de cor (pares de preenchimento e conteúdo)</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAIRS.map(([fill, on]) => (
            <div key={fill} className={`rounded-m3-md p-3 text-m3-label-medium ${FILL[fill]}`}>
              <div>{fill}</div>
              <div className="opacity-80">{on}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Forma</h3>
        <div className="flex flex-wrap gap-3">
          {SHAPES.map((s) => (
            <div key={s} className={`flex h-16 w-24 items-center justify-center border border-edge-control bg-m3-surface-container text-m3-label-small text-m3-on-surface ${RADIUS[s]}`}>
              {s.replace("m3-", "")}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Elevação 0 a 5</h3>
        <div className="flex flex-wrap gap-4">
          {ELEVATION.map((cls, i) => (
            <div key={cls} className={`flex h-16 w-24 items-center justify-center rounded-m3-md bg-m3-surface-container-low text-m3-label-medium text-m3-on-surface ${cls}`}>
              nível {i}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Tipografia (15 papéis, tamanhos compactos)</h3>
        <div className="flex flex-col gap-1">
          {TYPES.map((t, i) => (
            <div key={t} className={`${TYPE_LITERAL[i]} text-ink`}>
              {t} — Módulo de Young
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-m3-title-medium text-ink">Camadas de estado</h3>
        <p className="mb-2 text-m3-body-small text-ink-muted">
          Passe o mouse, use Tab e clique: 8% ao passar, 10% no foco e ao pressionar. Sem movimento.
        </p>
        <button
          type="button"
          className="m3-state rounded-m3-full bg-m3-secondary-container px-6 py-2.5 text-m3-label-large text-m3-on-secondary-container"
        >
          Botão tonal
        </button>
      </div>
    </div>
  );
}
