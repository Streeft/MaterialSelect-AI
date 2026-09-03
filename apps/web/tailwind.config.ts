import type { Config } from "tailwindcss";

// Cada cor semântica é uma custom property com um triplo "R G B", para que a
// sintaxe `/<alpha>` do Tailwind continue funcionando E a camada de gráficos
// possa ler o mesmo valor em tempo de execução (ver lib/design/palette.ts).
// Definir uma cor duas vezes — aqui e no Plotly — é como uma interface e suas
// figuras se afastam.
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

        // A moldura de navegação, escura nos dois temas. `accent` acompanha o
        // matiz da seção — ver a nota em app/globals.css.
        rail: {
          DEFAULT: v("--rail"),
          ink: v("--rail-ink"),
          "ink-muted": v("--rail-ink-muted"),
          "ink-subtle": v("--rail-ink-subtle"),
          edge: v("--rail-edge"),
          accent: v("--rail-accent"),
        },

        // A rampa do matiz da seção atual. O nome continua `brand` de propósito:
        // é o que faz todo componente já escrito herdar o matiz da rota sem uma
        // linha de alteração. Ver o cabeçalho de app/globals.css.
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
        // Public Sans, carregada por next/font em app/layout.tsx e chegando aqui
        // como --font-sans. Números tabulares nativos e formas abertas que
        // aguentam 12 px numa tabela densa.
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
        // IBM Plex Mono, também via next/font (--font-mono). Obrigatória em
        // expressão de índice, slug, unidade e método de conversão.
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
        // O rótulo em versalete que abre cada seção e cada coluna de tabela.
        eyebrow: "0.16em",
      },

      borderRadius: {
        // Prisma. `card` e `control` cobrem quase todo call site rounded do
        // aplicativo; `panel` é a moldura de uma tela inteira (o shell de uma
        // rota), `seat` os assentos dentro de um ButtonGroup.
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
        // O que fica sob o item de navegação em que você está, e sob um botão
        // primário. Lê o token da marca, então acompanha o matiz da seção em vez
        // de escurecer: é o que faz "você está aqui" sobreviver a um relance.
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
        // A linha-guia do índice de mérito se desenhando na vitrine. O valor de
        // `stroke-dasharray` fica no elemento, porque depende do comprimento do
        // traço; aqui só o alvo.
        dash: {
          from: { strokeDashoffset: "900" },
          to: { strokeDashoffset: "0" },
        },
        // Os halos de matiz atrás do herói. É a única animação em loop do
        // produto, e é decorativa — o bloco de reduced-motion a congela.
        drift: {
          "0%, 100%": { transform: "translate3d(0, 0, 0) scale(1)" },
          "50%": { transform: "translate3d(22px, -18px, 0) scale(1.07)" },
        },
      },
      animation: {
        rise: "rise 260ms cubic-bezier(0.2, 0, 0, 1) both",
        "grow-x": "grow-x 460ms cubic-bezier(0.2, 0, 0, 1) both",
        "grow-y": "grow-y 260ms cubic-bezier(0.2, 0, 0, 1) both",
        drift: "drift 22s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
