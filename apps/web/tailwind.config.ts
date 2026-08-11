import type { Config } from "tailwindcss";

// Every semantic colour is a CSS custom property holding an "R G B" triple, so
// that Tailwind's `/<alpha>` syntax keeps working AND the chart layer can read
// the same value at runtime (see lib/design/palette.ts). Defining a colour twice
// — once here, once in Plotly — is how an interface and its figures drift apart.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  // The theme is decided before first paint by an inline script in app/layout.tsx
  // and written to <html data-theme>. Keying off the attribute rather than
  // `prefers-color-scheme` alone is what lets the manual toggle win.
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // --- Surfaces, edges and ink -------------------------------------
        // Named by role, not by lightness: `surface` is the page, `raised` is a
        // card sitting on it, `sunken` is a table header cut into it. The names
        // survive the theme flip; `slate-50` would not.
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
          // Reserved for the outline of something the reader can operate. Using
          // it on a decorative divider is how the distinction gets lost.
          control: v("--edge-control"),
        },
        ink: {
          DEFAULT: v("--ink"),
          muted: v("--ink-muted"),
          subtle: v("--ink-subtle"),
          inverted: v("--ink-inverted"),
        },

        // --- Accent ------------------------------------------------------
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
          // The accent that reads correctly on the *current* theme, and the ink
          // that reads on top of it. Interactive chrome uses these, not a shade
          // number, so a control does not have to be restyled per theme.
          DEFAULT: v("--accent"),
          fg: v("--accent-fg"),
        },

        // --- Semantic states ---------------------------------------------
        // `soft` is the tinted background, `fg` the text that sits on it,
        // `DEFAULT` the saturated stroke. Four ramps and no more: a fifth would
        // just get guessed at call sites.
        success: {
          DEFAULT: v("--success"),
          soft: v("--success-soft"),
          fg: v("--success-fg"),
        },
        warning: {
          DEFAULT: v("--warning"),
          soft: v("--warning-soft"),
          fg: v("--warning-fg"),
        },
        danger: {
          DEFAULT: v("--danger"),
          soft: v("--danger-soft"),
          fg: v("--danger-fg"),
        },
        info: {
          DEFAULT: v("--info"),
          soft: v("--info-soft"),
          fg: v("--info-fg"),
        },

        // --- Data quality -------------------------------------------------
        // The product's signature distinction (§3.3 da proposta). Colour is the
        // *third* cue here — icon and written label come first — but it still
        // has to be a token so table, chart and badge cannot disagree.
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
        // Inter, loaded by `next/font` in app/layout.tsx and reaching this file
        // as `--font-sans`. The system stack stays behind it as the fallback that
        // renders while the face swaps, and as the whole answer if the build ever
        // ships without the font.
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "sans-serif",
        ],
        // Merit-index expressions, slugs, units and conversion methods. Reading
        // `sqrt(modulo_young) / densidade` in a proportional face is a chore.
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },

      fontSize: {
        // One step below Tailwind's `xs`, for the provenance line and legends.
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },

      borderRadius: {
        card: "0.75rem",
        control: "0.5rem",
      },

      boxShadow: {
        // Deliberately shallow. This is an instrument, not a dashboard demo.
        //
        // Black rather than slate: a slate-tinted shadow is a grey rectangle that
        // *lightens* the area around a card once the page behind it is #05080A.
        // Pure black at a higher alpha is the only version that reads as depth in
        // both themes.
        card: "0 1px 2px 0 rgb(0 0 0 / 0.20), 0 1px 3px 0 rgb(0 0 0 / 0.14)",
        raised: "0 4px 12px -2px rgb(0 0 0 / 0.34), 0 2px 6px -2px rgb(0 0 0 / 0.22)",
        overlay: "0 12px 32px -8px rgb(0 0 0 / 0.55)",
        // The one exception to "deliberately shallow": the halo under the
        // navigation item you are currently on. It reads the brand token rather
        // than black, so it tints instead of darkening, and it exists because a
        // filled pill alone is easy to lose against a raised panel — the glow is
        // what makes "you are here" survive a glance in either theme.
        glow: "0 0 0 1px rgb(var(--brand-300) / 0.40), 0 4px 14px -6px rgb(var(--brand-400) / 0.55)",
      },

      transitionDuration: {
        DEFAULT: "150ms",
      },

      maxWidth: {
        prose: "68ch",
      },

      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "fade-in": "fade-in 120ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
