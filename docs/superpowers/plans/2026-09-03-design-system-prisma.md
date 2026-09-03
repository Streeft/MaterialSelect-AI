# Prisma Design-System Patch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the "Prisma" frontend patch (per-route color, typography, five component refinements) and its Phase 2 commercial layer (public vitrine at `/`, authenticated app at `/app`, responsive catalog) to `apps/web`, exactly as decided in the spec.

**Architecture:** The patch ships as ready-made replacement/new files under `/tmp/design_system_zip/apply/apps/web/` (this session's scratch — see Global Constraints). Tasks 1–2 apply the design tokens and primitives and re-lock the M3 theme test against the new per-section palette. Task 3 adopts the new primitives across existing routes. Task 4 records the palette decision. Task 5 is the one irreversible-feeling step — moving the authenticated shell (and `AuthGate`, which the patch's own README never mentions) behind `/app` so `/` can be a public page. Tasks 6–7 land the commercial layer. Task 8 is the full gate.

**Tech Stack:** Next.js App Router, Tailwind CSS, TypeScript (strict), Vitest, Playwright, `@material/web`.

**Spec:** `docs/superpowers/specs/2026-09-02-design-system-prisma-design.md`

## Global Constraints

- **Patch source lives at `/tmp/design_system_zip/apply/apps/web/`** in this session's container — a scratch extraction of the zip the user attached, not part of the repo. Every task that says "copy from patch source" means `cp` from that path — never retype the file by hand. **If the path is missing when a task starts, STOP and report it** — do not reconstruct file content from memory or from this plan's prose.
- Backend (`apps/api`) is untouched by this entire plan — every task lives under `apps/web`.
- Every task's local gate (unless the task says otherwise): `cd apps/web && npm run typecheck && npm run lint && npm run test`. Full `npm run build`, `npm run test:e2e`, and Lighthouse are reserved for the final task (Task 8) — they're slow, and route-prefix mismatches from Task 5 would fail them until Task 5 is fully done anyway.
- User-facing text and commit messages: Portuguese. Code identifiers, comments: English (existing convention, `docs/CLAUDE.md` §2).
- **Never touch** `--quality-*`, `--success`/`--warning`/`--danger`/`--info`, or the Okabe–Ito categorical palette (`lib/design/palette.ts`) — the patch itself doesn't, and neither does this plan.
- **Missing data never renders as 0** (D-24). Any bar, badge, or number driven by a nullable field must render its "no data" state, not a computed zero.
- Chart/figure geometry stays backend-computed (ADR 0004) — nothing in this plan adds client-side geometry; it only restyles.
- Route paths in this plan use the repo's current relative root `apps/web/` throughout (e.g. `apps/web/app/layout.tsx`), not absolute machine paths.

---

### Task 1: Apply Prisma design tokens and primitives (Phase 1 core)

**Files:**
- Modify (replace wholesale, `cp` from patch source): `apps/web/app/globals.css`, `apps/web/tailwind.config.ts`, `apps/web/components/layout/AppSidebar.tsx`, `apps/web/components/ui/Card.tsx`, `apps/web/components/ui/index.ts`, `apps/web/components/dashboard/CoverageSummary.tsx`
- Create (`cp` from patch source): `apps/web/lib/design/sections.ts`, `apps/web/components/layout/SectionTheme.tsx`, `apps/web/components/ui/PageHeader.tsx`, `apps/web/components/ui/Bar.tsx`
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: `sectionForPath(pathname: string): SectionId` and `sectionMeta(id: SectionId): SectionMeta` from `@/lib/design/sections` (consumed by Task 3's `PageHeader` usage and Task 5's routing migration). `Bar` and `PageHeader` newly exported from `@/components/ui` (consumed by Task 3). `Card`'s new optional `riseIndex` prop and the new `PanelShell` export (consumed by `CoverageSummary.tsx`, already applied in this task, and optionally by later tasks — not required elsewhere in this plan).
- Consumes: nothing from earlier tasks (this is the first task).

- [ ] **Step 1: Verify the patch source is present**

```bash
test -d /tmp/design_system_zip/apply/apps/web && echo OK
```

Expected: `OK`. If this fails, stop — do not proceed with this task.

- [ ] **Step 2: Copy the ten Phase-1 files from patch source**

```bash
cd /home/user/MaterialSelect-AI
SRC=/tmp/design_system_zip/apply/apps/web
cp "$SRC/app/globals.css" apps/web/app/globals.css
cp "$SRC/tailwind.config.ts" apps/web/tailwind.config.ts
cp "$SRC/lib/design/sections.ts" apps/web/lib/design/sections.ts
cp "$SRC/components/layout/SectionTheme.tsx" apps/web/components/layout/SectionTheme.tsx
cp "$SRC/components/layout/AppSidebar.tsx" apps/web/components/layout/AppSidebar.tsx
cp "$SRC/components/ui/PageHeader.tsx" apps/web/components/ui/PageHeader.tsx
cp "$SRC/components/ui/Bar.tsx" apps/web/components/ui/Bar.tsx
cp "$SRC/components/ui/Card.tsx" apps/web/components/ui/Card.tsx
cp "$SRC/components/ui/index.ts" apps/web/components/ui/index.ts
cp "$SRC/components/dashboard/CoverageSummary.tsx" apps/web/components/dashboard/CoverageSummary.tsx
```

- [ ] **Step 3: Diff each copied file against its previous content in git**

```bash
git -C /home/user/MaterialSelect-AI diff --stat -- apps/web/app/globals.css apps/web/tailwind.config.ts apps/web/components/layout/AppSidebar.tsx apps/web/components/ui/Card.tsx apps/web/components/ui/index.ts apps/web/components/dashboard/CoverageSummary.tsx
```

Read through `git diff` (not just `--stat`) for `AppSidebar.tsx`, `Card.tsx`, and `CoverageSummary.tsx` specifically: confirm no project-specific logic was silently dropped (e.g. `AppSidebar`'s nav item list — `/selecao`, `/mapas`, `/comparar`, `/catalogo`, `/painel`, `/importar`, `/admin/classes`, `/admin/propriedades` — must still all be present; `CoverageSummary`'s use of `overview.coverage.filled_pct === null` for the empty state must still be there). If anything material is missing, stop and report it — don't patch around a bad copy.

- [ ] **Step 4: Integrate `SectionTheme` and the new fonts into the root layout**

Read `apps/web/app/layout.tsx` first — it currently imports `Inter` from `next/font/google` and uses it as `--font-sans`. Replace:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AuthGate } from "@/components/auth/AuthGate";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { LimitationNotice } from "@/components/LimitationNotice";
import { ptBR } from "@/lib/i18n";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
```

with:

```tsx
import type { Metadata } from "next";
import { Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AuthGate } from "@/components/auth/AuthGate";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { LimitationNotice } from "@/components/LimitationNotice";
import { SectionTheme } from "@/components/layout/SectionTheme";
import { ptBR } from "@/lib/i18n";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
```

Replace the `const inter = Inter({...})` block:

```tsx
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});
```

with:

```tsx
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});
```

Update the `<html>` tag's `className` from `className={inter.variable}` to `className={`${sans.variable} ${mono.variable}`}`.

Mount `<SectionTheme />` as the first child of `<body>`, before `<Providers>`:

```tsx
      <body>
        <SectionTheme />
        <Providers>
```

Leave everything else in the file (the skip-link, `AppSidebar`, `AuthGate`, footer, `LimitationNotice`) untouched — this task does not move the shell; Task 5 does.

- [ ] **Step 5: Run the frontend gate**

```bash
cd /home/user/MaterialSelect-AI/apps/web
npm run typecheck && npm run lint && npm run test
```

Expected: all green. `Card`'s new `riseIndex` prop is optional, so existing call sites that don't pass it must still typecheck.

- [ ] **Step 6: Commit**

```bash
cd /home/user/MaterialSelect-AI
git add apps/web/app/globals.css apps/web/tailwind.config.ts apps/web/app/layout.tsx \
  apps/web/lib/design/sections.ts apps/web/components/layout/SectionTheme.tsx \
  apps/web/components/layout/AppSidebar.tsx apps/web/components/ui/PageHeader.tsx \
  apps/web/components/ui/Bar.tsx apps/web/components/ui/Card.tsx apps/web/components/ui/index.ts \
  apps/web/components/dashboard/CoverageSummary.tsx
git commit -m "feat(design): aplica tokens e primitivas Prisma (Fase 1)

Paleta por rota via [data-section], tipografia Public Sans + IBM Plex
Mono, rail escuro no AppSidebar, PageHeader/Bar novos, Card com
riseIndex/PanelShell, CoverageSummary com traço de matiz. Nenhuma rota
foi adotada ainda (Task 3) e nenhuma foi movida (Task 5)."
```

---

### Task 2: Rewrite `materialTheme.test.ts` for the per-section palette

**Files:**
- Modify: `apps/web/lib/design/materialTheme.test.ts`

**Interfaces:**
- Consumes: `buildMdSysColorScheme(isDark: boolean): Record<string, string>` and `M3_SEED_HEX` from `./materialTheme` (unchanged — this task only touches the test); the literal `--md-sys-color-primary`/`-primary-container` and `--accent`/`--accent-fg` values now baked into `apps/web/app/globals.css` by Task 1.
- Produces: nothing consumed by later tasks.

**Context:** Before Task 1, this test asserted `buildMdSysColorScheme(false/true)` produced the *entire* M3 scheme pasted into `globals.css`, including `primary` and `primary-container`. After Task 1, `primary`/`primary-container` are no longer generated from `M3_SEED_HEX` — they're hand-authored per `[data-section]` block (seven sections × two themes), while every other M3 role (`secondary`, `tertiary`, `surface*`, `outline*`, `error*`, etc.) still comes from `buildMdSysColorScheme` unchanged, since the patch never touches those. So: keep the existing non-primary assertions, replace the primary assertions with a per-section table, and add the WCAG contrast check the spec commits to (section 4).

- [ ] **Step 1: Replace the test file**

```typescript
import { describe, expect, it } from "vitest";

import { buildMdSysColorScheme, M3_SEED_HEX } from "./materialTheme";
import { SECTIONS, type SectionId } from "./sections";

/**
 * Locks the generator's output against the literal hex values pasted into
 * app/globals.css, for every M3 role EXCEPT `primary` and
 * `primary-container` — those two are no longer generated from
 * M3_SEED_HEX (see PER_SECTION below). If a role in this list ever fails,
 * the seed or the algorithm changed — update globals.css to match
 * (regenerate with this same function) rather than editing the values
 * below to make it pass.
 */
const LIGHT_NON_PRIMARY: Record<string, string> = {
  "--md-sys-color-on-primary": "#ffffff",
  "--md-sys-color-primary-fixed": "#d8e2ff",
  "--md-sys-color-primary-fixed-dim": "#adc7ff",
  "--md-sys-color-on-primary-fixed": "#001a41",
  "--md-sys-color-on-primary-fixed-variant": "#004493",
  "--md-sys-color-inverse-primary": "#adc7ff",
  "--md-sys-color-secondary": "#475e8c",
  "--md-sys-color-on-secondary": "#ffffff",
  "--md-sys-color-secondary-container": "#b2c9fe",
  "--md-sys-color-on-secondary-container": "#3d5481",
  "--md-sys-color-secondary-fixed": "#d8e2ff",
  "--md-sys-color-secondary-fixed-dim": "#afc7fb",
  "--md-sys-color-on-secondary-fixed": "#001a41",
  "--md-sys-color-on-secondary-fixed-variant": "#2e4673",
  "--md-sys-color-tertiary": "#8c36ab",
  "--md-sys-color-on-tertiary": "#ffffff",
  "--md-sys-color-tertiary-container": "#a851c6",
  "--md-sys-color-on-tertiary-container": "#ffffff",
  "--md-sys-color-tertiary-fixed": "#fad7ff",
  "--md-sys-color-tertiary-fixed-dim": "#efb0ff",
  "--md-sys-color-on-tertiary-fixed": "#330045",
  "--md-sys-color-on-tertiary-fixed-variant": "#721791",
  "--md-sys-color-error": "#ba1a1a",
  "--md-sys-color-on-error": "#ffffff",
  "--md-sys-color-error-container": "#ffdad6",
  "--md-sys-color-on-error-container": "#93000a",
  "--md-sys-color-background": "#f9f9ff",
  "--md-sys-color-on-background": "#191c23",
  "--md-sys-color-surface": "#f9f9ff",
  "--md-sys-color-on-surface": "#191c23",
  "--md-sys-color-surface-variant": "#dee2f2",
  "--md-sys-color-on-surface-variant": "#414754",
  "--md-sys-color-surface-dim": "#d8d9e3",
  "--md-sys-color-surface-bright": "#f9f9ff",
  "--md-sys-color-surface-container-lowest": "#ffffff",
  "--md-sys-color-surface-container-low": "#f2f3fd",
  "--md-sys-color-surface-container": "#ecedf7",
  "--md-sys-color-surface-container-high": "#e6e8f2",
  "--md-sys-color-surface-container-highest": "#e0e2ec",
  "--md-sys-color-surface-tint": "#005bc0",
  "--md-sys-color-outline": "#727785",
  "--md-sys-color-outline-variant": "#c1c6d6",
  "--md-sys-color-shadow": "#000000",
  "--md-sys-color-scrim": "#000000",
  "--md-sys-color-inverse-surface": "#2d3038",
  "--md-sys-color-inverse-on-surface": "#eff0fa",
};

const DARK_NON_PRIMARY: Record<string, string> = {
  "--md-sys-color-on-primary": "#002e68",
  "--md-sys-color-primary-fixed": "#d8e2ff",
  "--md-sys-color-primary-fixed-dim": "#adc7ff",
  "--md-sys-color-on-primary-fixed": "#001a41",
  "--md-sys-color-on-primary-fixed-variant": "#004493",
  "--md-sys-color-inverse-primary": "#005bc0",
  "--md-sys-color-secondary": "#afc7fb",
  "--md-sys-color-on-secondary": "#15305b",
  "--md-sys-color-secondary-container": "#2e4673",
  "--md-sys-color-on-secondary-container": "#9eb5e8",
  "--md-sys-color-secondary-fixed": "#d8e2ff",
  "--md-sys-color-secondary-fixed-dim": "#afc7fb",
  "--md-sys-color-on-secondary-fixed": "#001a41",
  "--md-sys-color-on-secondary-fixed-variant": "#2e4673",
  "--md-sys-color-tertiary": "#efb0ff",
  "--md-sys-color-on-tertiary": "#53006e",
  "--md-sys-color-tertiary-container": "#a851c6",
  "--md-sys-color-on-tertiary-container": "#ffffff",
  "--md-sys-color-tertiary-fixed": "#fad7ff",
  "--md-sys-color-tertiary-fixed-dim": "#efb0ff",
  "--md-sys-color-on-tertiary-fixed": "#330045",
  "--md-sys-color-on-tertiary-fixed-variant": "#721791",
  "--md-sys-color-error": "#ffb4ab",
  "--md-sys-color-on-error": "#690005",
  "--md-sys-color-error-container": "#93000a",
  "--md-sys-color-on-error-container": "#ffdad6",
  "--md-sys-color-background": "#10131a",
  "--md-sys-color-on-background": "#e0e2ec",
  "--md-sys-color-surface": "#10131a",
  "--md-sys-color-on-surface": "#e0e2ec",
  "--md-sys-color-surface-variant": "#414754",
  "--md-sys-color-on-surface-variant": "#c1c6d6",
  "--md-sys-color-surface-dim": "#10131a",
  "--md-sys-color-surface-bright": "#363941",
  "--md-sys-color-surface-container-lowest": "#0b0e15",
  "--md-sys-color-surface-container-low": "#191c23",
  "--md-sys-color-surface-container": "#1d2027",
  "--md-sys-color-surface-container-high": "#272a31",
  "--md-sys-color-surface-container-highest": "#32353c",
  "--md-sys-color-surface-tint": "#adc7ff",
  "--md-sys-color-outline": "#8b909f",
  "--md-sys-color-outline-variant": "#414754",
  "--md-sys-color-shadow": "#000000",
  "--md-sys-color-scrim": "#000000",
  "--md-sys-color-inverse-surface": "#e0e2ec",
  "--md-sys-color-inverse-on-surface": "#2d3038",
};

/**
 * The seven per-section `--accent` / `--md-sys-color-primary*` pairs, hand
 * authored in app/globals.css `[data-section="…"]` blocks (and, for
 * "inicio", the plain `:root` default — there is no `[data-section="inicio"]`
 * block because nothing needs to override `:root` for it). This table is
 * this test's copy of that source of truth: if it ever drifts from
 * globals.css, one of the two was edited without the other.
 */
const PER_SECTION: Record<
  SectionId,
  { light: { accent: string; primaryContainer: string }; dark: { accent: string; primaryContainer: string } }
> = {
  inicio: {
    light: { accent: "#4567a8", primaryContainer: "#5a84d4" },
    dark: { accent: "#97beff", primaryContainer: "#2c4f94" },
  },
  selecao: {
    light: { accent: "#73599e", primaryContainer: "#9372c8" },
    dark: { accent: "#c8aefa", primaryContainer: "#5d408a" },
  },
  mapas: {
    light: { accent: "#006b60", primaryContainer: "#009e90" },
    dark: { accent: "#5cd5c7", primaryContainer: "#00665b" },
  },
  comparar: {
    light: { accent: "#974c72", primaryContainer: "#bf6291" },
    dark: { accent: "#f4a0c8", primaryContainer: "#81315c" },
  },
  catalogo: {
    light: { accent: "#006f92", primaryContainer: "#0095c1" },
    dark: { accent: "#65cdf3", primaryContainer: "#005e84" },
  },
  painel: {
    light: { accent: "#904529", primaryContainer: "#c66846" },
    dark: { accent: "#fba587", primaryContainer: "#873616" },
  },
  importar: {
    light: { accent: "#1d6835", primaryContainer: "#429c5a" },
    dark: { accent: "#89d298", primaryContainer: "#03642b" },
  },
};

/** `--accent-fg` is white in light, dark ink in dark — same for all seven sections. */
const ACCENT_FG = { light: "#ffffff", dark: "#14161c" };

/** sRGB hex -> relative luminance (WCAG 2.x). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two sRGB hex colours, always >= 1. */
function contrastRatio(hexA: string, hexB: string): number {
  const [lA, lB] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (lA + 0.05) / (lB + 0.05);
}

describe("buildMdSysColorScheme", () => {
  it("seeds from Google's own blue, #1A73E8", () => {
    expect(M3_SEED_HEX).toBe("#1A73E8");
  });

  it("matches every non-primary role pasted into app/globals.css (light)", () => {
    const scheme = buildMdSysColorScheme(false);
    for (const [key, value] of Object.entries(LIGHT_NON_PRIMARY)) {
      expect(scheme[key]).toBe(value);
    }
  });

  it("matches every non-primary role pasted into app/globals.css (dark)", () => {
    const scheme = buildMdSysColorScheme(true);
    for (const [key, value] of Object.entries(DARK_NON_PRIMARY)) {
      expect(scheme[key]).toBe(value);
    }
  });
});

describe("per-section palette (Prisma, D-49)", () => {
  it.each(SECTIONS.map((s) => s.id))("%s has both a light and a dark accent", (id) => {
    const section = PER_SECTION[id];
    expect(section.light.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(section.dark.accent).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(SECTIONS.map((s) => s.id))(
    "%s meets WCAG AA (4.5:1) for --accent against --accent-fg, both themes",
    (id) => {
      const section = PER_SECTION[id];
      expect(contrastRatio(section.light.accent, ACCENT_FG.light)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(section.dark.accent, ACCENT_FG.dark)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("the tightest pair in the set is >= 5.59:1, per the patch's own measurement", () => {
    const ratios = SECTIONS.flatMap((s) => [
      contrastRatio(PER_SECTION[s.id].light.accent, ACCENT_FG.light),
      contrastRatio(PER_SECTION[s.id].dark.accent, ACCENT_FG.dark),
    ]);
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(5.59);
  });
});
```

- [ ] **Step 2: Run the test file alone**

```bash
cd /home/user/MaterialSelect-AI/apps/web
npx vitest run lib/design/materialTheme.test.ts
```

Expected: all tests pass. If a `PER_SECTION` or `ACCENT_FG` value doesn't match what Task 1 actually put in `globals.css` (a typo either there or here), this fails — open `apps/web/app/globals.css` and reconcile the two rather than guessing which is right.

- [ ] **Step 3: Run the full frontend test suite**

```bash
npm run test
```

Expected: green — this confirms nothing else broke.

- [ ] **Step 4: Commit**

```bash
cd /home/user/MaterialSelect-AI
git add apps/web/lib/design/materialTheme.test.ts
git commit -m "test(design): relock materialTheme.test.ts para a paleta por rota

O gerador buildMdSysColorScheme não muda; primary/primary-container
deixaram de vir dele (Task 1 os reescreve por seção em globals.css).
O teste agora trava os dois grupos separadamente e acrescenta a
verificação de contraste WCAG que a spec (seção 4) e o D-49 citam."
```

---

### Task 3: Adopt `PageHeader` and `Bar` in existing routes

**Files:**
- Modify: `apps/web/app/selecao/page.tsx`, `apps/web/app/mapas/page.tsx`, `apps/web/app/comparar/page.tsx`, `apps/web/app/catalogo/page.tsx`, `apps/web/app/painel/page.tsx`, `apps/web/app/importar/page.tsx`, `apps/web/app/admin/classes/page.tsx`, `apps/web/app/admin/propriedades/page.tsx`, `apps/web/app/materiais/novo/page.tsx`, `apps/web/app/materiais/[id]/editar/page.tsx`, `apps/web/components/selection/ResultsView.tsx`, `apps/web/components/dashboard/GapsList.tsx`

**Interfaces:**
- Consumes: `PageHeader` and `Bar` from `@/components/ui` (Task 1).
- Produces: nothing new consumed by later tasks — this is a leaf task.

**Context:** `PageHeader` reads its own section via `sectionForPath(usePathname())`, so it never needs a `section` prop. Ten routes currently hand-write `<h1 className="text-xl font-semibold text-ink">…</h1>`; two more files that match the same string — `app/assinatura/page.tsx` and `app/entrar/page.tsx` — are **deliberately excluded**: both are centered `Card` layouts outside the sidebar shell (pre-auth / billing screens), and `PageHeader`'s row layout (title + right-aligned actions) doesn't fit a centered card. Likewise, `app/catalogo/page.tsx`'s "coverage column" that the patch's own README says gets a `Bar` **does not exist in this codebase** — `MaterialRows.tsx` has no coverage column today — so that swap is dropped; only the two real `Bar` call sites (the selection funnel/ranking rows, and the panel's gap list) are done here.

- [ ] **Step 1: `apps/web/app/importar/page.tsx`, `apps/web/app/painel/page.tsx`**

Both files have the identical shape. In each, replace:

```tsx
      <div>
        <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t.subtitle}</p>
      </div>
```

(importar uses `<p className="text-sm text-ink-muted">` — no `max-w-prose` — keep that file's own exact class list on the `<p>`, only the `<h1>`/wrapping `<div>` change) with:

```tsx
      <PageHeader title={t.title} description={t.subtitle} group="dados" />
```

Add `PageHeader` to each file's existing `@/components/ui` import (importar: line 47's `} from "@/components/ui";` block; painel: `import { EmptyState, ErrorState, LoadingState } from "@/components/ui";` becomes `import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/ui";`).

- [ ] **Step 2: `apps/web/app/catalogo/page.tsx`**

Replace:

```tsx
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
          <p className="max-w-prose text-sm text-ink-muted">{t.subtitle}</p>
        </div>
        <ButtonLink href="/materiais/novo" variant="primary" size="sm">
          + {ptBR.actions.new}
        </ButtonLink>
      </div>
```

with:

```tsx
      <PageHeader
        title={t.title}
        description={t.subtitle}
        group="dados"
        actions={
          <ButtonLink href="/materiais/novo" variant="primary" size="sm">
            + {ptBR.actions.new}
          </ButtonLink>
        }
      />
```

Add `PageHeader` to the existing multi-line `@/components/ui` import block.

- [ ] **Step 3: `apps/web/app/mapas/page.tsx`**

Replace (note the outer `flex flex-col gap-2` wrapper around both the header row and the saved-charts picker below it stays — only the inner header row changes):

```tsx
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
            <p className="max-w-prose text-sm text-ink-muted">{t.subtitle}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSaveDialogOpen(true)}
              title={t.saveTooltip}
            >
              {t.save}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void shareMap()}
              title={t.shareTooltip}
            >
              {t.share}
            </Button>
          </div>
        </div>
```

with:

```tsx
        <PageHeader
          title={t.title}
          description={t.subtitle}
          group="estudar"
          actions={
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSaveDialogOpen(true)}
                title={t.saveTooltip}
              >
                {t.save}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void shareMap()}
                title={t.shareTooltip}
              >
                {t.share}
              </Button>
            </>
          }
        />
```

Add `PageHeader` to the existing multi-line `@/components/ui` import block.

- [ ] **Step 4: `apps/web/app/comparar/page.tsx`, `apps/web/app/selecao/page.tsx`**

Both have no action buttons in the header. In each, replace:

```tsx
      <div>
        <h1 className="text-xl font-semibold text-ink">{t.title}</h1>
        <p className="max-w-prose text-sm text-ink-muted">{t.subtitle}</p>
      </div>
```

(selecao's `<p>` is `className="text-sm text-ink-muted"`, no `max-w-prose` — keep that file's own class list) with:

```tsx
      <PageHeader title={t.title} description={t.subtitle} group="estudar" />
```

Add `PageHeader` to each file's existing multi-line `@/components/ui` import block.

- [ ] **Step 5: `apps/web/app/admin/classes/page.tsx`, `apps/web/app/admin/propriedades/page.tsx`**

Both have a bare `<h1>` with no subtitle and no wrapping `<div>`. In `admin/classes/page.tsx`, replace:

```tsx
      <h1 className="text-xl font-semibold text-ink">{ptBR.admin.classesTitle}</h1>
```

with:

```tsx
      <PageHeader title={ptBR.admin.classesTitle} />
```

In `admin/propriedades/page.tsx`, replace:

```tsx
      <h1 className="text-xl font-semibold text-ink">{ptBR.admin.propertiesTitle}</h1>
```

with:

```tsx
      <PageHeader title={ptBR.admin.propertiesTitle} />
```

Add `PageHeader` to each file's existing multi-line `@/components/ui` import block. No `group` — these are outside the "estudar"/"dados" groupings.

- [ ] **Step 6: `apps/web/app/materiais/novo/page.tsx`, `apps/web/app/materiais/[id]/editar/page.tsx`**

Both have a `<ButtonLink>` "back" link immediately above the bare `<h1>`; the `<h1>` itself has no subtitle. In `materiais/novo/page.tsx`, replace:

```tsx
      <h1 className="text-xl font-semibold text-ink">{ptBR.form.createTitle}</h1>
```

with:

```tsx
      <PageHeader title={ptBR.form.createTitle} />
```

In `materiais/[id]/editar/page.tsx`, replace:

```tsx
      <h1 className="text-xl font-semibold text-ink">{ptBR.form.editTitle}</h1>
```

with:

```tsx
      <PageHeader title={ptBR.form.editTitle} />
```

`materiais/novo/page.tsx` already imports `ButtonLink, ErrorState, LoadingState` from `@/components/ui` — add `PageHeader` there. `materiais/[id]/editar/page.tsx` already imports the same three — add `PageHeader` there too.

- [ ] **Step 7: `Bar` in the selection funnel and per-row score (`apps/web/components/selection/ResultsView.tsx`)**

Add `Bar` to the existing `@/components/ui` import block (alongside `Alert, Badge, ButtonLink, MissingValue, Section, TBody, THead, Table, TableScroll, Td, Th, RowHeader, Tr`).

In `FunnelRow`, replace:

```tsx
      <span className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
        <span
          className={
            "block h-full rounded-full " + (tone === "brand" ? "bg-brand" : "bg-ink-subtle")
          }
          style={{ width: `${percent(remaining, initial)}%` }}
        />
      </span>
```

with:

```tsx
      <Bar
        value={percent(remaining, initial) / 100}
        color={tone === "brand" ? "bg-brand" : "bg-ink-subtle"}
        className="h-2.5"
      />
```

In the ranking table's per-row score cell, replace:

```tsx
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-24 overflow-hidden rounded-full bg-surface-sunken">
                              <span
                                className="block h-full rounded-full bg-brand"
                                style={{ width: `${percent(c.score ?? 0, 1)}%` }}
                              />
                            </span>
                            <span className="tabular-nums text-ink-muted">
```

with:

```tsx
                          <div className="flex items-center gap-2">
                            <Bar value={c.score} className="h-2 w-24" />
                            <span className="tabular-nums text-ink-muted">
```

`Bar`'s `value` prop is `number | null`, and `c.score` is already `number | null` in this scope — this drops the old `?? 0` and the incidental bug it caused (a material with `score === null` used to draw a 0-width bar instead of no bar; `Bar` renders nothing when `value` is `null`, matching D-24).

- [ ] **Step 8: `Bar` in the panel's gap list (`apps/web/components/dashboard/GapsList.tsx`)**

Add `Bar` to the existing `@/components/ui` import block.

Replace:

```tsx
                        <span
                          aria-hidden
                          className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken"
                        >
                          <span
                            className="block h-full rounded-full bg-quality-ausente"
                            style={{ width: `${g.coverage.filled_pct ?? 0}%` }}
                          />
                        </span>
```

with:

```tsx
                        <Bar
                          value={g.coverage.filled_pct === null ? null : g.coverage.filled_pct / 100}
                          color="bg-quality-ausente"
                          className="h-1.5 w-16"
                        />
```

Same incidental fix as Step 7: a `null` `filled_pct` used to draw a 0-width bar (misreading as "measured, and empty") instead of no bar at all.

- [ ] **Step 9: Run the frontend gate**

```bash
cd /home/user/MaterialSelect-AI/apps/web
npm run typecheck && npm run lint && npm run test
```

Expected: all green.

- [ ] **Step 10: Commit**

```bash
cd /home/user/MaterialSelect-AI
git add apps/web/app/selecao/page.tsx apps/web/app/mapas/page.tsx apps/web/app/comparar/page.tsx \
  apps/web/app/catalogo/page.tsx apps/web/app/painel/page.tsx apps/web/app/importar/page.tsx \
  apps/web/app/admin/classes/page.tsx apps/web/app/admin/propriedades/page.tsx \
  apps/web/app/materiais/novo/page.tsx "apps/web/app/materiais/[id]/editar/page.tsx" \
  apps/web/components/selection/ResultsView.tsx apps/web/components/dashboard/GapsList.tsx
git commit -m "feat(design): adota PageHeader e Bar nas rotas existentes

Dez rotas trocam o <h1> copiado à mão por PageHeader (matiz da seção
aparece no conteúdo, não só no rail). Bar substitui a barra de largura
inline no funil de seleção, na pontuação por linha do ranking e na
lista de lacunas do painel — as duas últimas ganham de brinde a
correção de um cobertura/score nulo que desenhava barra de 0% em vez
de nenhuma barra (D-24).

/entrar e /assinatura ficam de fora de propósito: são cartões
centralizados fora da casca da barra lateral, e o layout em linha do
PageHeader não serve para eles. A 'coluna de cobertura do catálogo'
que o README do patch cita não existe nesta base — não há o que
adotar ali."
```

---

### Task 4: Register D-49 in `docs/DECISIONS.md`

**Files:**
- Modify: `docs/DECISIONS.md`

**Interfaces:**
- Consumes: nothing from earlier tasks (pure documentation).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Append the D-49 entry**

Open `docs/DECISIONS.md` and find the end of the `## D-48` entry (the last entry in the file, ending with "...o risco de nova divergência é real a cada mudança de paleta."). Append, after a blank line:

```markdown
---

## D-49 — Paleta por rota ("Prisma") substitui a paleta única de D-38, sem revogar seu método de medição

**Contexto.** D-38 fixou uma paleta única, medida (`--brand-700`/`--brand-50`
a 5,01:1), com dois matizes deliberados (`--info` ciano,
`--quality-importado` violeta). O patch "Prisma" (aplicado nesta sessão,
[spec](superpowers/specs/2026-09-02-design-system-prisma-design.md)) muda o
mecanismo: cada rota tem seu próprio matiz de `--accent`/`--brand-*`,
trocado via `[data-section]` no `<html>` (escrito por
`components/layout/SectionTheme.tsx`), com `--md-sys-color-primary` e
`--md-sys-color-primary-container` acompanhando no mesmo escopo.

**Decisão.** Adotar a paleta por rota. O método que D-38 estabeleceu —
medir cada par antes de aceitar, documentar o par mais apertado — continua
valendo e foi seguido pelo patch: par mais apertado 5,59:1 (era 5,01:1),
nenhum par abaixo de 6,2:1 (verificado em
`lib/design/materialTheme.test.ts`, que trava as sete seções × dois temas
contra o limiar WCAG AA). `--ink-subtle` foi escurecido porque a nova
superfície mais clara reprovava o valor antigo (4,3:1).

**O que continua intocado.** `--quality-*`, `--success`/`--warning`/
`--danger`/`--info` e a paleta categórica Okabe–Ito — nenhum dos dois
matizes deliberados de D-38 muda de propósito ou de posição; a rota nunca
os sobrescreve.

**Consequência aceita.** A paleta deixa de ser "uma cor por conceito em todo
lugar" e passa a ser "uma cor por conceito, modulada por onde a tela está" —
uma leitura a mais para quem edita a paleta pela primeira vez (qual valor é
o de uma seção específica vs. o de um token semântico como `--success`).
Mitigado por manter os dois tipos de token em blocos CSS visivelmente
distintos em `globals.css` (`:root` vs. `[data-section]`).
```

- [ ] **Step 2: Cross-check the link**

Confirm `docs/superpowers/specs/2026-09-02-design-system-prisma-design.md` exists (it does — it's the approved spec) and that the relative link from `docs/DECISIONS.md` (`superpowers/specs/...`, since both files share the `docs/` root) resolves.

- [ ] **Step 3: Commit**

```bash
cd /home/user/MaterialSelect-AI
git add docs/DECISIONS.md
git commit -m "docs: registra D-49 — paleta por rota (Prisma) substitui D-38

Segue o padrão do projeto: D-38 já supersedeu D-33 sem revogar o
método; esta entrada faz o mesmo com D-38, documentando o novo
mecanismo (sete matizes via [data-section]) e confirmando que o
método de medição de contraste que D-38 estabeleceu foi seguido, não
abandonado."
```

---

### Task 5: Migrate the authenticated shell — `AuthGate`, `AppSidebar`, and every product route — to `/app`

**Files:**
- Create: `apps/web/app/app/layout.tsx`
- Modify: `apps/web/app/layout.tsx`
- Move (`git mv`): `apps/web/app/selecao/` → `apps/web/app/app/selecao/`, `apps/web/app/mapas/` → `apps/web/app/app/mapas/`, `apps/web/app/comparar/` → `apps/web/app/app/comparar/`, `apps/web/app/catalogo/` → `apps/web/app/app/catalogo/`, `apps/web/app/painel/` → `apps/web/app/app/painel/`, `apps/web/app/importar/` → `apps/web/app/app/importar/`, `apps/web/app/estilo/` → `apps/web/app/app/estilo/`, `apps/web/app/admin/` → `apps/web/app/app/admin/`, `apps/web/app/materiais/` → `apps/web/app/app/materiais/`. `apps/web/app/page.tsx` moves to `apps/web/app/app/page.tsx` (Task 6 then creates a *new*, different `apps/web/app/page.tsx` for the public vitrine).
- Modify: `apps/web/lib/design/sections.ts` (route prefixes)
- Modify: `apps/web/components/layout/AppSidebar.tsx` (nav hrefs)
- Modify: `apps/web/components/selection/ResultsView.tsx`, `apps/web/components/dashboard/SavedStudies.tsx`, `apps/web/components/catalog/MaterialRows.tsx`, `apps/web/app/app/mapas/page.tsx`, `apps/web/app/app/materiais/[id]/page.tsx`, `apps/web/app/app/materiais/[id]/editar/page.tsx` (internal links)
- Modify: `apps/web/e2e/session.ts`, `apps/web/e2e/golden-path.spec.ts`, `apps/web/e2e/import-errors.spec.ts`
- Modify: `apps/web/lighthouserc.json`

**Interfaces:**
- Consumes: `SectionTheme`, `sectionForPath`/`SECTIONS` (Task 1); `PageHeader`-adopted routes (Task 3, unaffected by the move itself — this task only changes where files live and what they link to, not their content).
- Produces: nothing consumed by a later task in this plan — Task 6 builds `apps/web/app/page.tsx` independently, and only needs to know that `/app` is where the authenticated shell now lives (true after this task).

**Context — why this is one task, not several:** none of these sub-steps produce a working app on their own. If routes move but `AuthGate` doesn't, `/` inherits the login gate the vitrine is supposed to escape. If `AuthGate` moves but links aren't updated, every nav click 404s. This has to land as one commit.

- [ ] **Step 1: Create `apps/web/app/app/layout.tsx` — the authenticated shell, extracted from the root**

Read the current `apps/web/app/layout.tsx` in full first (it still has its pre-Task-1 shell content below the `<body>` tag — Task 1 only touched imports/fonts/the `SectionTheme` mount, not the shell markup). Create:

```tsx
import { AuthGate } from "@/components/auth/AuthGate";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { LimitationNotice } from "@/components/LimitationNotice";
import { ptBR } from "@/lib/i18n";

/**
 * The authenticated app shell: everything that used to live directly under
 * the root layout's <body>, now scoped to /app so `/` (the public vitrine,
 * Task 6) never sees AuthGate or the sidebar. AuthGate itself has to be
 * here, not just AppSidebar/LimitationNotice — the patch's own README only
 * mentions moving the latter two, but AuthGate is what actually gates
 * access; leaving it at the root would keep the vitrine behind login.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen flex-col lg:flex-row">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-brand focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-fg"
        >
          {ptBR.ui.skipToContent}
        </a>
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
            {children}
          </main>
          <footer className="border-t border-edge bg-surface-raised">
            <div className="mx-auto max-w-6xl space-y-2 px-4 py-3">
              <p className="text-xs text-warning-fg">⚠️ {ptBR.demoWarning}</p>
              <LimitationNotice variant="footer" />
            </div>
          </footer>
        </div>
      </div>
    </AuthGate>
  );
}
```

- [ ] **Step 2: Slim the root layout down to `<html>`, fonts, theme script, and `SectionTheme`**

In `apps/web/app/layout.tsx`, remove the `AuthGate`, `AppSidebar`, `LimitationNotice` imports (now used only by `app/app/layout.tsx`) and the entire shell markup inside `<body>`, leaving:

```tsx
      <body>
        <SectionTheme />
        <Providers>{children}</Providers>
      </body>
```

Remove the now-unused `import { AuthGate } from "@/components/auth/AuthGate";`, `import { AppSidebar } from "@/components/layout/AppSidebar";`, and `import { LimitationNotice } from "@/components/LimitationNotice";` lines. Keep `Providers`, the theme bootstrap `<script>`, and the `<html>`/font setup exactly as Task 1 left them.

- [ ] **Step 3: Move the nine route trees and the old home page into `app/app/`**

```bash
cd /home/user/MaterialSelect-AI
git mv apps/web/app/selecao apps/web/app/app/selecao
git mv apps/web/app/mapas apps/web/app/app/mapas
git mv apps/web/app/comparar apps/web/app/app/comparar
git mv apps/web/app/catalogo apps/web/app/app/catalogo
git mv apps/web/app/painel apps/web/app/app/painel
git mv apps/web/app/importar apps/web/app/app/importar
git mv apps/web/app/estilo apps/web/app/app/estilo
git mv apps/web/app/admin apps/web/app/app/admin
git mv apps/web/app/materiais apps/web/app/app/materiais
git mv apps/web/app/page.tsx apps/web/app/app/page.tsx
```

`apps/web/app/entrar/` and `apps/web/app/assinatura/` stay exactly where they are — they're outside the authenticated shell (Step 1's `AuthGate` already special-cases both by pathname, and now there's no gate above them at all, which is the same net effect).

- [ ] **Step 4: Update `sectionForPath`/`SECTIONS` for the new route prefixes**

In `apps/web/lib/design/sections.ts`, update the `route` field of every entry except `inicio` to carry the `/app` prefix:

```typescript
export const SECTIONS: readonly SectionMeta[] = [
  { id: "inicio", label: "Início", route: "/", hue: 262 },
  { id: "selecao", label: "Seleção", route: "/app/selecao", hue: 300 },
  { id: "mapas", label: "Mapas", route: "/app/mapas", hue: 185 },
  { id: "comparar", label: "Comparar", route: "/app/comparar", hue: 350 },
  { id: "catalogo", label: "Catálogo", route: "/app/catalogo", hue: 225 },
  { id: "painel", label: "Painel", route: "/app/painel", hue: 40 },
  { id: "importar", label: "Importar", route: "/app/importar", hue: 150 },
] as const;
```

Leave the rest of the file (`sectionForPath`, `sectionMeta`, the `SectionId`/`SectionMeta` types) unchanged — `sectionForPath`'s `pathname.startsWith(...)` matching already works correctly against the new prefixed routes.

- [ ] **Step 5: Fix `AppSidebar`'s nav hrefs**

In `apps/web/components/layout/AppSidebar.tsx`, prefix every in-app nav href with `/app`, **including `HOME`, which changes meaning** (it used to be the public root; now the sidebar only renders inside `/app`, so "home" inside the app has to mean the app's own home, not the public vitrine outside it):

```tsx
const HOME: NavItem = { href: "/app", label: t.home, icon: IconHome };
```

and in the grouped nav arrays:

```tsx
      { href: "/app/selecao", label: t.selection, icon: IconFilter },
      { href: "/app/mapas", label: t.maps, icon: IconScatter },
      { href: "/app/comparar", label: t.compare, icon: IconCompare },
```

```tsx
      { href: "/app/catalogo", label: t.catalog, icon: IconBook },
      { href: "/app/painel", label: t.dashboard, icon: IconGauge },
      { href: "/app/importar", label: t.imports, icon: IconUpload },
```

```tsx
      { href: "/app/admin/classes", label: t.classes, icon: IconLayers },
      { href: "/app/admin/propriedades", label: t.properties, icon: IconRuler },
```

- [ ] **Step 6: Fix the eight hardcoded internal links found in this session's audit**

In `apps/web/components/selection/ResultsView.tsx`:
```tsx
href={`/mapas?materiais=${candidateIds}${topId ? `&destaque=${topId}` : ""}`}
```
→
```tsx
href={`/app/mapas?materiais=${candidateIds}${topId ? `&destaque=${topId}` : ""}`}
```
and
```tsx
<ButtonLink href={`/comparar?materiais=${candidateIds}`} variant="secondary">
```
→
```tsx
<ButtonLink href={`/app/comparar?materiais=${candidateIds}`} variant="secondary">
```

In `apps/web/components/dashboard/SavedStudies.tsx`:
```tsx
href={`/selecao?estudo=${study.id}`}
```
→
```tsx
href={`/app/selecao?estudo=${study.id}`}
```

In `apps/web/components/catalog/MaterialRows.tsx`:
```tsx
<Link href={`/materiais/${material.id}`} className="font-medium text-brand hover:underline">
```
→
```tsx
<Link href={`/app/materiais/${material.id}`} className="font-medium text-brand hover:underline">
```

In `apps/web/app/app/mapas/page.tsx` (already moved by Step 3):
```tsx
href={`/comparar?materiais=${map.data.points.map((p) => p.material_id).join(",")}`}
```
→
```tsx
href={`/app/comparar?materiais=${map.data.points.map((p) => p.material_id).join(",")}`}
```

In `apps/web/app/app/materiais/[id]/page.tsx`:
```tsx
<ButtonLink href={`/materiais/${id}/editar`} size="sm">
```
→
```tsx
<ButtonLink href={`/app/materiais/${id}/editar`} size="sm">
```
and
```tsx
href={`/mapas?x=densidade&y=modulo_young&destaque=${id}`}
```
→
```tsx
href={`/app/mapas?x=densidade&y=modulo_young&destaque=${id}`}
```

In `apps/web/app/app/materiais/[id]/editar/page.tsx`:
```tsx
<ButtonLink href={`/materiais/${id}`} variant="link" size="sm" className="self-start">
```
→
```tsx
<ButtonLink href={`/app/materiais/${id}`} variant="link" size="sm" className="self-start">
```

- [ ] **Step 7: Search for any remaining unprefixed link this list missed**

```bash
cd /home/user/MaterialSelect-AI/apps/web
grep -rn 'href={`/\(selecao\|mapas\|comparar\|catalogo\|painel\|importar\|materiais\|estilo\|admin\)' --include='*.tsx' app components | grep -v '/app/'
grep -rn '"/\(selecao\|mapas\|comparar\|catalogo\|painel\|importar\|materiais\|estilo\|admin\)' --include='*.tsx' app components | grep -v '/app/'
```

Expected: no output. Anything this finds is a link Steps 5–6 missed — fix it the same way (prefix with `/app`) before moving on.

- [ ] **Step 8: Fix the E2E suite's route navigation**

In `apps/web/e2e/golden-path.spec.ts`, `apps/web/e2e/import-errors.spec.ts`: every `page.goto("/importar")`, `page.goto("/selecao")` etc. gets the `/app` prefix — e.g. `page.goto("/app/importar")`, `page.goto("/app/selecao")`.

Read `apps/web/e2e/session.ts` in full and check whether it references any product route by path (not just the session cookie injection) — if it navigates to a specific route before setting the cookie, or asserts on a URL, prefix that too.

- [ ] **Step 9: Fix Lighthouse's audited routes**

In `apps/web/lighthouserc.json`, update the `url` array's product routes to the `/app` prefix, leaving `/`, `/entrar` unprefixed (they didn't move):

```json
      "url": [
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3000/app/catalogo",
        "http://127.0.0.1:3000/app/importar",
        "http://127.0.0.1:3000/app/selecao",
        "http://127.0.0.1:3000/app/mapas",
        "http://127.0.0.1:3000/app/comparar",
        "http://127.0.0.1:3000/app/painel",
        "http://127.0.0.1:3000/app/estilo",
        "http://127.0.0.1:3000/entrar",
        "http://127.0.0.1:3000/app/admin/classes",
        "http://127.0.0.1:3000/app/admin/propriedades"
      ],
```

- [ ] **Step 10: Run the frontend gate**

```bash
cd /home/user/MaterialSelect-AI/apps/web
npm run typecheck && npm run lint && npm run test
```

Expected: all green. `npm run build` and `npm run test:e2e` are deferred to Task 8 (they're slow, and this task's own commit is the natural place to have gotten routing right — but the full end-to-end proof waits for the final task once Task 6/7 land too, since a partial build with a dangling `/app` link from an unmigrated marketing file would fail for an unrelated reason).

- [ ] **Step 11: Commit**

```bash
cd /home/user/MaterialSelect-AI
git add -A -- apps/web/app apps/web/lib/design/sections.ts apps/web/components/layout/AppSidebar.tsx \
  apps/web/components/selection/ResultsView.tsx apps/web/components/dashboard/SavedStudies.tsx \
  apps/web/components/catalog/MaterialRows.tsx apps/web/e2e apps/web/lighthouserc.json
git commit -m "feat(routing): move a casca autenticada e as rotas do produto para /app

AuthGate, AppSidebar e LimitationNotice saem do layout raiz e passam a
viver em app/app/layout.tsx — decisão do autor: segmento /app
explícito, não o route group (app) que o próprio patch recomendava
para não quebrar link nenhum. As nove árvores de rota do produto
(selecao, mapas, comparar, catalogo, painel, importar, estilo, admin,
materiais) e a antiga /page.tsx (agora /app/page.tsx) se movem junto.

sectionForPath, o nav do AppSidebar (inclusive HOME, que passa a
apontar para /app em vez de /), e os oito links internos fixos
encontrados nesta sessão (ResultsView, mapas, SavedStudies,
MaterialRows, materiais/[id] e materiais/[id]/editar) ganham o
prefixo. E2E e Lighthouse seguem junto. /entrar e /assinatura ficam
onde estavam — nunca estiveram atrás do portão de verdade, só
reconhecidos por pathname dentro dele."
```

---

### Task 6: Apply the public vitrine (`/`) and the responsive catalog

**Files:**
- Create: `apps/web/app/page.tsx` (new — the public vitrine; distinct from the old `app/page.tsx` Task 5 already moved to `app/app/page.tsx`), `apps/web/components/marketing/Landing.tsx`, `apps/web/components/marketing/AshbyPreview.tsx`, `apps/web/components/marketing/FunnelPreview.tsx`, `apps/web/lib/marketing/content.ts`, `apps/web/components/layout/BottomNav.tsx`, `apps/web/components/catalog/MaterialCards.tsx`
- Modify: `apps/web/app/app/layout.tsx` (mount `BottomNav`), `apps/web/app/app/catalogo/page.tsx` (mount `MaterialCards` alongside the table)

**Interfaces:**
- Consumes: `sectionForPath`/`SectionTheme` (Task 1, unaffected by this task); the fact that `/app` is the authenticated root (Task 5).
- Produces: nothing consumed by a later task — Task 7 is verification only.

- [ ] **Step 1: Verify the patch source is present (same check as Task 1)**

```bash
test -d /tmp/design_system_zip/apply/apps/web && echo OK
```

- [ ] **Step 2: Copy the six new marketing/responsive files from patch source**

```bash
cd /home/user/MaterialSelect-AI
SRC=/tmp/design_system_zip/apply/apps/web
cp "$SRC/app/page.tsx" apps/web/app/page.tsx
cp "$SRC/components/marketing/Landing.tsx" apps/web/components/marketing/Landing.tsx
cp "$SRC/components/marketing/AshbyPreview.tsx" apps/web/components/marketing/AshbyPreview.tsx
cp "$SRC/components/marketing/FunnelPreview.tsx" apps/web/components/marketing/FunnelPreview.tsx
cp "$SRC/lib/marketing/content.ts" apps/web/lib/marketing/content.ts
cp "$SRC/components/layout/BottomNav.tsx" apps/web/components/layout/BottomNav.tsx
cp "$SRC/components/catalog/MaterialCards.tsx" apps/web/components/catalog/MaterialCards.tsx
```

- [ ] **Step 3: Read the new `app/page.tsx` and confirm it doesn't assume `app/app/layout.tsx`'s shell**

The patch's `app/page.tsx` renders `<Landing />` directly (a server component, per the patch README) with no dependency on `AuthGate`/`AppSidebar` — read it to confirm. If it imports anything from `@/components/layout/AppSidebar` or `@/components/auth/AuthGate`, that's a sign the patch author assumed a different routing shape than the `/app` segment this session chose — stop and reconcile before proceeding rather than silently dropping an import.

- [ ] **Step 4: Confirm `lib/marketing/content.ts` still carries the `R$ —` placeholder pricing**

```bash
grep -n 'R\$' apps/web/lib/marketing/content.ts
```

Expected: at least one match, literal `R$ —`. Per the spec (section 1) and the user's explicit decision, this stays a placeholder — do not fill in a number here.

- [ ] **Step 5: Mount `BottomNav` in the authenticated shell**

In `apps/web/app/app/layout.tsx` (created in Task 5), add the import and mount it as a sibling of the sidebar/content flex row, inside `<AuthGate>` but visually only shown below `lg` (the component itself should already be responsible for its own breakpoint visibility — confirm by reading `BottomNav.tsx`; if it isn't self-hiding above `lg`, add `className="lg:hidden"` at the mount site):

```tsx
import { BottomNav } from "@/components/layout/BottomNav";
```

and inside the returned JSX, after the closing `</div>` of the sidebar/content flex row, before `</AuthGate>`:

```tsx
        <BottomNav />
      </div>
    </AuthGate>
```

(Adjust indentation/placement to match `BottomNav`'s own expected mount point if its file-level comment says otherwise — read it first.)

- [ ] **Step 6: Wire `MaterialCards` into the catalog route, alongside the table**

In `apps/web/app/app/catalogo/page.tsx`, find where the materials table renders (likely wrapped in `TableScroll`) and add `MaterialCards` immediately before it, each hidden at the other's breakpoint — mirroring the spec (section 3.3):

```tsx
<MaterialCards materials={materials.data ?? []} />
```

immediately followed by the existing table wrapped so it's hidden below `sm`:

```tsx
<TableScroll className="hidden sm:block" label={...the table's existing label prop...}>
  {/* existing table contents, unchanged */}
</TableScroll>
```

Read the file first to get the exact current prop names on `TableScroll` and the exact shape of `materials.data` (it's a `useQuery` result already used elsewhere on the page) before writing this edit — do not guess field names.

- [ ] **Step 7: Run the frontend gate**

```bash
cd /home/user/MaterialSelect-AI/apps/web
npm run typecheck && npm run lint && npm run test
```

Expected: all green.

- [ ] **Step 8: Commit**

```bash
cd /home/user/MaterialSelect-AI
git add apps/web/app/page.tsx apps/web/components/marketing apps/web/lib/marketing \
  apps/web/components/layout/BottomNav.tsx apps/web/components/catalog/MaterialCards.tsx \
  apps/web/app/app/layout.tsx apps/web/app/app/catalogo/page.tsx
git commit -m "feat(marketing): vitrine pública em / e catálogo responsivo (Fase 2)

Landing/AshbyPreview/FunnelPreview/content.ts (preço R\$ — mantido de
propósito, decisão do autor), BottomNav na casca autenticada,
MaterialCards ao lado da tabela do catálogo abaixo de 640px — mesma
marcação semântica em toda largura, sem <table> forçado a virar lista
via CSS."
```

---

### Task 7: Full verification gate

**Files:** none (verification only).

**Interfaces:** consumes the complete state of Tasks 1–6; produces nothing further.

- [ ] **Step 1: Full frontend gate**

```bash
cd /home/user/MaterialSelect-AI/apps/web
npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: all green. `next build` is the first point at which a stray reference to the old `app/page.tsx`, an unmigrated import path, or a Server/Client component boundary problem in the new marketing files would surface — read any error carefully rather than assuming it's a flake.

- [ ] **Step 2: E2E**

```bash
npm run test:e2e
```

Expected: green. If it fails on a 404, re-run Task 5 Step 7's grep — something still points at an unprefixed route.

- [ ] **Step 3: Lighthouse (optional locally, required in CI)**

```bash
npm run build && npx lhci autorun
```

(Or whatever the project's actual Lighthouse CI invocation is — check `.github/workflows/ci.yml`'s `Lighthouse` job for the exact command instead of guessing.) Expected: performance/accessibility/best-practices thresholds in `lighthouserc.json` still pass against the new palette and the `/app`-prefixed routes.

- [ ] **Step 4: Manual verification in a real browser — golden path**

Start the dev server (`npm run dev`) and, in an actual browser (not just automated tests — `docs/CLAUDE.md`'s rule for any frontend change):
- Load `/` — confirm the public vitrine renders, no login prompt, no sidebar.
- Click through to `/app` (or whatever CTA the vitrine offers) — confirm login gate appears for a logged-out session, or the sidebar shell appears for a logged-in one.
- Visit each of the seven sectioned routes (`/app/selecao`, `/app/mapas`, `/app/comparar`, `/app/catalogo`, `/app/painel`, `/app/importar`, and `/`) and confirm the accent color visibly changes per route, in both light and dark theme (toggle via the existing theme control).
- Resize to a phone width (375px) — confirm `BottomNav` appears, the sidebar collapses/hides appropriately, and `/app/catalogo` shows cards instead of the table.
- Confirm `PageHeader`'s eyebrow line ("dados · catálogo" etc.) reads correctly on the six adopted routes.
- Confirm the `Bar` components in `/app/selecao`'s funnel/ranking and `/app/painel`'s gap list render, and that a material with no score still shows *no* bar rather than a full-width or zero-width one (D-24 — construct a test case if the seed data doesn't already have one).

Record anything unexpected as a finding — do not silently patch around a real regression this step surfaces; treat it the way `docs/CLAUDE.md` §9 describes ("verificação ao vivo... encontrou bugs que os testes não pegaram").

- [ ] **Step 5: Update `docs/TODO.md` and `CLAUDE.md`'s "Estado atual"**

Move the Prisma design-system work from wherever it's tracked (it isn't yet — this is new work, not a pre-existing backlog item) into `docs/TODO.md`'s "Débitos já quitados" section, following the existing entries' format (what shipped, what was deliberately dropped — the `/entrar`/`/assinatura` PageHeader exclusion, the catalog coverage-column no-op, the five "refinamentos ainda opcionais" the spec already lists as out of scope). Update the root `CLAUDE.md`'s "Estado atual" paragraph with a short summary, matching this project's existing style (see the M5/M6 and RAG entries for length and tone).

- [ ] **Step 6: Commit the docs update**

```bash
cd /home/user/MaterialSelect-AI
git add docs/TODO.md CLAUDE.md
git commit -m "docs: sincroniza estado do projeto após o patch de design Prisma"
```

---

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** Phase 1 tokens/primitives (spec §2) → Task 1; route adoption (§2.3) → Task 3; contrast (§2.4) is asserted by Task 2's test, not hand-verified; Phase 2 files (§3.1) → Task 6; `/app` migration (§3.2, all 7 numbered items) → Task 5; responsive catalog (§3.3) → Task 6 Step 6; pricing placeholder (§3.4) → Task 6 Step 4; `materialTheme.test.ts` rewrite (§4) → Task 2; D-49 (§5) → Task 4; sequencing (§6) → the task order above follows it exactly; testing/validation (§7) → Task 7. §8 (out-of-scope refinements) is deliberately not a task — Task 7 Step 5 records it in `docs/TODO.md` instead of silently dropping it.
- **Two corrections this plan makes to the patch's own README**, both already flagged in the spec and carried through here: `AuthGate` (not just `AppSidebar`/`LimitationNotice`) moves in Task 5; the catalog "coverage column" `Bar` target doesn't exist in this codebase and is dropped in Task 3, not silently attempted.
- **Known deferred item, not part of this plan:** the GitGuard security report (Next.js 14.2.35, PostCSS 8.4.31, both with HIGH CVEs) is tracked separately as `S1` in `docs/TODO.md`, deliberately sequenced after this plan by the user's own decision — do not fold a dependency upgrade into any task above.
