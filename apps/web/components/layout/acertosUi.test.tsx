import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppSidebar } from "./AppSidebar";
import { BottomNav } from "./BottomNav";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { allowLoadedRunner } from "@/lib/testing/loadedRunner";

// Long, CPU-bound jsdom walks: see lib/testing/loadedRunner.ts.
allowLoadedRunner();

/**
 * PR 1.4 (D-202), the navigation items: the phone's bottom bar, the group
 * labels of the rail and the rail's own fit. jsdom evaluates no layout, so what
 * is asserted is what the markup and the stylesheet commit to: classes, tokens
 * and the contrast of the token pairs (the one thing axe cannot measure here).
 */

const route = { pathname: "/app" };
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  getCurrentUser: () =>
    Promise.resolve({
      id: 1,
      email: "a@example.com",
      name: "Usuária de teste",
      avatar_url: null,
      project_id: 1,
    }),
  logout: () => Promise.resolve(),
  getBillingStatus: () =>
    Promise.resolve({
      active: true,
      status: null,
      current_period_end: null,
      access_mode: "subscription",
      has_access: true,
      can_edit_catalog: true,
    }),
}));

const globalsCss = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  route.pathname = "/app";
});

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: number[]): number {
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Every `--name: R G B;` declaration in the stylesheet, in order (one per theme block). */
function tokenTriples(name: string): number[][] {
  const pattern = new RegExp(`^\\s*${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`, "gm");
  return [...globalsCss.matchAll(pattern)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
}

describe("barra inferior do celular", () => {
  it("rotula cada destino com 12 px ou mais, nunca com o corpo de 9 px", () => {
    const { container } = renderWithClient(<BottomNav />);
    const links = container.querySelectorAll("nav a");
    expect(links).toHaveLength(5);
    for (const link of links) {
      const label = link.lastElementChild as HTMLElement;
      expect(label.textContent?.length).toBeGreaterThan(0);
      // D-206: text-xs became the caption role, same 12 px.
      expect(label.className).toContain("text-caption");
      expect(label.className).not.toMatch(/text-\[0\.5625rem\]|text-\[9px\]/);
    }
  });

  it("mantém alvos de 48 px e a reserva da barra cobre a altura nova", () => {
    const { container } = renderWithClient(<BottomNav />);
    for (const link of container.querySelectorAll("nav a")) {
      expect(link.className).toContain("min-h-12");
    }
    // 32 (pill) + 4 (gap) + 16 (label) + 8 (top) + 12 (bottom padding) = 72 px.
    expect(document.documentElement.style.getPropertyValue("--bottom-nav-offset")).toBe("4.5rem");
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = renderWithClient(<BottomNav />);
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("rótulos de seção do menu", () => {
  it("usam um token próprio, não o cinza fixo de 45% do MSDS", () => {
    expect(globalsCss).toMatch(
      /\[data-surface="rail"\]\s+\.msds-rail-eyebrow\s*\{[^}]*color:\s*rgb\(var\(--rail-eyebrow\)\)/,
    );
  });

  it("o token passa de 4,5:1 sobre o trilho nos dois temas", () => {
    const eyebrow = tokenTriples("--rail-eyebrow");
    const rail = tokenTriples("--rail");
    // One declaration in the light block and one in the dark one.
    expect(eyebrow).toHaveLength(2);
    expect(rail).toHaveLength(2);
    eyebrow.forEach((ink, i) => {
      expect(contrast(ink, rail[i]!)).toBeGreaterThanOrEqual(4.5);
    });
  });

  it("o rótulo do grupo existe no menu e na gaveta, com o mesmo estilo", async () => {
    const user = userEvent.setup();
    renderWithClient(<AppSidebar />);
    await user.click(await screen.findByShadowRole("button", { name: ptBR.ui.openMenu }));
    const labels = screen.getAllByText(ptBR.nav.groupAdmin);
    expect(labels.length).toBeGreaterThanOrEqual(2);
    // D-207: the label is now the text of the group's fold toggle; the eyebrow
    // style sits on the toggle itself.
    for (const label of labels) expect(label.closest(".msds-rail-eyebrow")).not.toBeNull();
  });
});

describe("menu lateral cabe e rola", () => {
  it("a lista rola sozinha; o rodapé não encolhe nem come a lista", () => {
    const { container } = renderWithClient(<AppSidebar />);
    const aside = container.querySelector("aside") as HTMLElement;
    const nav = aside.querySelector("nav") as HTMLElement;
    expect(nav.className).toContain("overflow-y-auto");
    expect(nav.className).toContain("min-h-0");
    const footer = nav.nextElementSibling as HTMLElement;
    expect(footer.className).toContain("shrink-0");
  });

  it("na gaveta do celular a lista rola e o painel não: a última seção fica alcançável", async () => {
    const user = userEvent.setup();
    renderWithClient(<AppSidebar />);
    await user.click(await screen.findByShadowRole("button", { name: ptBR.ui.openMenu }));
    const dialog = screen.getByShadowRole("dialog");
    expect(dialog.className).not.toContain("overflow-y-auto");
    expect(dialog.className).toContain("overflow-hidden");
    const nav = dialog.querySelector("nav") as HTMLElement;
    expect(nav.className).toContain("overflow-y-auto");
    expect(nav.className).toContain("min-h-0");
    expect((nav.nextElementSibling as HTMLElement).className).toContain("shrink-0");
  });

  it("a folha de estilo compacta as linhas do menu e deixa a barra de rolagem visível", () => {
    const rowRule = globalsCss.match(/aside\[data-surface="rail"\]\s+\.msds-rail-item\s*\{([^}]*)\}/);
    expect(rowRule).not.toBeNull();
    const padding = Number(/padding-top:\s*(\d+)px/.exec(rowRule![1]!)?.[1]);
    expect(padding).toBeLessThanOrEqual(4);

    const scrollbar = globalsCss.match(/scrollbar-color:\s*rgb\(var\(--rail-edge\)\s*\/\s*([\d.]+)\)/);
    expect(scrollbar).not.toBeNull();
    expect(Number(scrollbar![1])).toBeGreaterThanOrEqual(0.35);
  });
});
