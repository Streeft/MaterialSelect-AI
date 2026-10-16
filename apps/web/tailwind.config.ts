import type { Config } from "tailwindcss";

// Each semantic color is a custom property with an "R G B" triple, so Tailwind's
// `/<alpha>` syntax keeps working AND the graphics layer can read the same value
// at runtime (see lib/design/palette.ts). Defining a color twice — here and in
// Plotly — is how an interface and its figures drift apart.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Material 3 roles per route (D-133); `bg-m3-primary`, `text-m3-on-primary`.
        m3: {
          "primary": v("--m3-primary"),
          "on-primary": v("--m3-on-primary"),
          "primary-container": v("--m3-primary-container"),
          "on-primary-container": v("--m3-on-primary-container"),
          "secondary": v("--m3-secondary"),
          "on-secondary": v("--m3-on-secondary"),
          "secondary-container": v("--m3-secondary-container"),
          "on-secondary-container": v("--m3-on-secondary-container"),
          "tertiary": v("--m3-tertiary"),
          "on-tertiary": v("--m3-on-tertiary"),
          "tertiary-container": v("--m3-tertiary-container"),
          "on-tertiary-container": v("--m3-on-tertiary-container"),
          "error": v("--m3-error"),
          "on-error": v("--m3-on-error"),
          "error-container": v("--m3-error-container"),
          "on-error-container": v("--m3-on-error-container"),
          "surface": v("--m3-surface"),
          "on-surface": v("--m3-on-surface"),
          "surface-variant": v("--m3-surface-variant"),
          "on-surface-variant": v("--m3-on-surface-variant"),
          "surface-container-lowest": v("--m3-surface-container-lowest"),
          "surface-container-low": v("--m3-surface-container-low"),
          "surface-container": v("--m3-surface-container"),
          "surface-container-high": v("--m3-surface-container-high"),
          "surface-container-highest": v("--m3-surface-container-highest"),
          "outline": v("--m3-outline"),
          "outline-variant": v("--m3-outline-variant"),
          "inverse-surface": v("--m3-inverse-surface"),
          "inverse-on-surface": v("--m3-inverse-on-surface"),
          "inverse-primary": v("--m3-inverse-primary"),
          "surface-tint": v("--m3-surface-tint"),
          "scrim": v("--m3-scrim"),
          "shadow": v("--m3-shadow"),
        },
        surface: {
          DEFAULT: v("--surface"),
          raised: v("--surface-raised"),
          sunken: v("--surface-sunken"),
          inverted: v("--surface-inverted"),
        },
        edge: {
          DEFAULT: v("--edge"),
          subtle: v("--edge-subtle"),
          strong: v("--edge-strong"),
          control: v("--edge-control"),
        },
        ink: {
          DEFAULT: v("--ink"),
          muted: v("--ink-muted"),
          subtle: v("--ink-subtle"),
          inverted: v("--ink-inverted"),
        },

        // The semantic layer (D-91): the role, not the palette step. `bg-page`,
        // `bg-panel`, `bg-well`, `border-line`, `border-line-control`,
        // `bg-action`. New code names these; the palette names above stay for
        // what has no role yet (a chart swatch, a spec sample).
        page: v("--surface-page"),
        panel: v("--surface-panel"),
        well: v("--surface-well"),
        line: {
          DEFAULT: v("--border-panel"),
          divider: v("--border-divider"),
          control: v("--border-control"),
        },
        action: {
          DEFAULT: v("--action-primary"),
          ink: v("--action-primary-ink"),
        },

        // The navigation frame, dark in both themes. `accent` follows the
        // section hue — see the note in app/globals.css.
        rail: {
          DEFAULT: v("--rail"),
          ink: v("--rail-ink"),
          "ink-muted": v("--rail-ink-muted"),
          "ink-subtle": v("--rail-ink-subtle"),
          edge: v("--rail-edge"),
          accent: v("--rail-accent"),
        },

        // The ramp for the current section's hue. The name stays `brand` on purpose:
        // that's what makes every existing component inherit the route's hue without
        // a line of change. See the header of app/globals.css.
        brand: {
          50: v("--brand-50"),
          100: v("--brand-100"),
          200: v("--brand-200"),
          300: v("--brand-300"),
          400: v("--brand-400"),
          500: v("--brand-500"),
          600: v("--brand-600"),
          700: v("--brand-700"),
          800: v("--brand-800"),
          900: v("--brand-900"),
          950: v("--brand-950"),
          DEFAULT: v("--accent"),
          fg: v("--accent-fg"),
        },

        success: { DEFAULT: v("--success"), soft: v("--success-soft"), fg: v("--success-fg") },
        warning: { DEFAULT: v("--warning"), soft: v("--warning-soft"), fg: v("--warning-fg") },
        danger: { DEFAULT: v("--danger"), soft: v("--danger-soft"), fg: v("--danger-fg") },
        info: { DEFAULT: v("--info"), soft: v("--info-soft"), fg: v("--info-fg") },

        quality: {
          medido: v("--quality-medido"),
          "medido-soft": v("--quality-medido-soft"),
          importado: v("--quality-importado"),
          "importado-soft": v("--quality-importado-soft"),
          estimado: v("--quality-estimado"),
          "estimado-soft": v("--quality-estimado-soft"),
          ausente: v("--quality-ausente"),
          "ausente-soft": v("--quality-ausente-soft"),
        },
      },

      fontFamily: {
        // Public Sans, loaded by next/font in app/layout.tsx and arriving here
        // as --font-sans. Native tabular numbers and open forms that
        // hold up at 12px in a dense table.
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        // IBM Plex Mono, also via next/font (--font-mono). Required for
        // index expression, slug, unit, and conversion method.
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },

      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
        // The type scale by role (D-91). Tailwind's numeric steps stay for
        // what is sized by fit (a badge, a tick); anything a reader reads as
        // sentence uses a role. `support` is the helper line under a field or
        // a heading: 13 px, because at 11–12 px a form's hints were the part
        // readers skipped.
        display: ["1.75rem", { lineHeight: "2.25rem", fontWeight: "700", letterSpacing: "-0.015em" }],
        title: ["1.25rem", { lineHeight: "1.75rem", fontWeight: "600" }],
        heading: ["1.0625rem", { lineHeight: "1.5rem", fontWeight: "600" }],
        body: ["0.875rem", { lineHeight: "1.375rem" }],
        support: ["0.8125rem", { lineHeight: "1.25rem" }],
        caption: ["0.75rem", { lineHeight: "1rem" }],
        // Material 3 type roles at the app's compact sizes (D-133): 15 names, Public Sans.
        "m3-display-large": ["1.75rem", { lineHeight: "2.25rem", fontWeight: "400", letterSpacing: "-0.01em" }],
        "m3-display-medium": ["1.5rem", { lineHeight: "2rem", fontWeight: "400", letterSpacing: "0" }],
        "m3-display-small": ["1.375rem", { lineHeight: "1.75rem", fontWeight: "400", letterSpacing: "0" }],
        "m3-headline-large": ["1.25rem", { lineHeight: "1.75rem", fontWeight: "400", letterSpacing: "0" }],
        "m3-headline-medium": ["1.125rem", { lineHeight: "1.5rem", fontWeight: "400", letterSpacing: "0" }],
        "m3-headline-small": ["1.0625rem", { lineHeight: "1.5rem", fontWeight: "400", letterSpacing: "0" }],
        "m3-title-large": ["1rem", { lineHeight: "1.5rem", fontWeight: "400", letterSpacing: "0" }],
        "m3-title-medium": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "500", letterSpacing: "0.009em" }],
        "m3-title-small": ["0.8125rem", { lineHeight: "1.25rem", fontWeight: "500", letterSpacing: "0.008em" }],
        "m3-body-large": ["0.9375rem", { lineHeight: "1.375rem", fontWeight: "400", letterSpacing: "0.03em" }],
        "m3-body-medium": ["0.875rem", { lineHeight: "1.375rem", fontWeight: "400", letterSpacing: "0.018em" }],
        "m3-body-small": ["0.75rem", { lineHeight: "1rem", fontWeight: "400", letterSpacing: "0.033em" }],
        "m3-label-large": ["0.875rem", { lineHeight: "1.25rem", fontWeight: "500", letterSpacing: "0.007em" }],
        "m3-label-medium": ["0.75rem", { lineHeight: "1rem", fontWeight: "500", letterSpacing: "0.042em" }],
        "m3-label-small": ["0.6875rem", { lineHeight: "1rem", fontWeight: "500", letterSpacing: "0.045em" }],
      },

      letterSpacing: {
        // The smallcap label that opens each section and each table column.
        eyebrow: "0.16em",
      },

      borderRadius: {
        // Prisma. `card` and `control` cover almost every rounded call site in the
        // app; `panel` is the frame of an entire screen (a route's shell), `seat`
        // the seats inside a ButtonGroup.
        // Read from globals.css (D-91), so the scale lives in one place and
        // MSDS's own rules and the utilities cannot disagree.
        panel: "var(--radius-panel)",
        card: "var(--radius-card)",
        control: "var(--radius-control)",
        seat: "var(--radius-seat)",
        // Material 3 shape scale (D-133).
        "m3-none": "var(--shape-none)",
        "m3-xs": "var(--shape-extra-small)",
        "m3-sm": "var(--shape-small)",
        "m3-md": "var(--shape-medium)",
        "m3-lg": "var(--shape-large)",
        "m3-lg-plus": "var(--shape-large-increased)",
        "m3-xl": "var(--shape-extra-large)",
        "m3-xl-plus": "var(--shape-extra-large-increased)",
        "m3-xxl": "var(--shape-extra-extra-large)",
        "m3-full": "var(--shape-full)",
      },

      boxShadow: {
        // Read from globals.css so each theme sets its own (D-90): the light
        // theme leans on shadow to separate panels from the page.
        card: "var(--shadow-card)",
        control: "var(--shadow-control)",
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
        lift: "var(--shadow-lift)",
        // Material 3 elevation levels (D-133).
        "elev-0": "var(--elevation-0)",
        "elev-1": "var(--elevation-1)",
        "elev-2": "var(--elevation-2)",
        "elev-3": "var(--elevation-3)",
        "elev-4": "var(--elevation-4)",
        "elev-5": "var(--elevation-5)",
        // What sits under the navigation item you're on, and under a primary button.
        // Reads the brand token, so follows the section hue instead of darkening:
        // that's what makes "you are here" survive a glance.
        glow: "0 0 0 1px rgb(var(--brand-300) / 0.40), 0 10px 22px -12px rgb(var(--accent) / 0.85)",
      },

      transitionDuration: {
        DEFAULT: "150ms",
        slow: "260ms",
        "m3-short1": "var(--m3-dur-short1)",
        "m3-short2": "var(--m3-dur-short2)",
        "m3-short3": "var(--m3-dur-short3)",
        "m3-short4": "var(--m3-dur-short4)",
        "m3-medium1": "var(--m3-dur-medium1)",
        "m3-medium2": "var(--m3-dur-medium2)",
        "m3-medium3": "var(--m3-dur-medium3)",
        "m3-medium4": "var(--m3-dur-medium4)",
      },

      transitionTimingFunction: {
        emphasized: "cubic-bezier(0.2, 0, 0, 1)",
        "m3-standard": "var(--m3-ease-standard)",
        "m3-standard-decelerate": "var(--m3-ease-standard-decelerate)",
        "m3-standard-accelerate": "var(--m3-ease-standard-accelerate)",
        "m3-emphasized-decelerate": "var(--m3-ease-emphasized-decelerate)",
        "m3-emphasized-accelerate": "var(--m3-ease-emphasized-accelerate)",
      },

      maxWidth: {
        prose: "68ch",
      },

      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "none" },
        },
        "grow-x": {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        "grow-y": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        // The guide line of the merit index drawing itself in the showcase. The
        // `stroke-dasharray` value lives on the element because it depends on stroke
        // length; here just the target.
        dash: {
          from: { strokeDashoffset: "900" },
          to: { strokeDashoffset: "0" },
        },
        // The hue halos behind the hero. It's the only looping animation in the
        // product, and it's decorative — the reduced-motion block freezes it.
        drift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(22px, -18px, 0) scale(1.07)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        rise: "rise 260ms cubic-bezier(0.2, 0, 0, 1) both",
        "grow-x": "grow-x 460ms cubic-bezier(0.2, 0, 0, 1) both",
        "grow-y": "grow-y 260ms cubic-bezier(0.2, 0, 0, 1) both",
        drift: "drift 22s ease-in-out infinite",
        "fade-in": "fade-in 120ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
