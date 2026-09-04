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
      },

      letterSpacing: {
        // The smallcap label that opens each section and each table column.
        eyebrow: "0.16em",
      },

      borderRadius: {
        // Prisma. `card` and `control` cover almost every rounded call site in the
        // app; `panel` is the frame of an entire screen (a route's shell), `seat`
        // the seats inside a ButtonGroup.
        panel: "1.5rem",
        card: "1.25rem",
        control: "0.75rem",
        seat: "0.5rem",
      },

      boxShadow: {
        card: "0 1px 2px 0 rgb(23 26 33 / 0.05)",
        raised: "0 6px 16px -8px rgb(23 26 33 / 0.24)",
        overlay: "0 18px 40px -18px rgb(23 26 33 / 0.35), 0 2px 6px 0 rgb(23 26 33 / 0.12)",
        lift: "0 16px 34px -18px rgb(23 26 33 / 0.30)",
        // What sits under the navigation item you're on, and under a primary button.
        // Reads the brand token, so follows the section hue instead of darkening:
        // that's what makes "you are here" survive a glance.
        glow: "0 0 0 1px rgb(var(--brand-300) / 0.40), 0 10px 22px -12px rgb(var(--accent) / 0.85)",
      },

      transitionDuration: {
        DEFAULT: "150ms",
        slow: "260ms",
      },

      transitionTimingFunction: {
        emphasized: "cubic-bezier(0.2, 0, 0, 1)",
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
