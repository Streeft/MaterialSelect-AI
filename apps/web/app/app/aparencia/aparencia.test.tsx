import { afterEach, describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { AnnouncerProvider } from "@/components/ui/Announcer";
import { ptBR } from "@/lib/i18n";
import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { SectionTheme } from "@/components/layout/SectionTheme";
import AppearancePage from "./page";

let pathname = "/app/mapas";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
// D-228: the page carries the AI diagnosis; its own test is AIDiagnosticsCard.test.tsx.
vi.mock("@/lib/api", () => ({
  getAIStatus: () =>
    Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "", capabilities: [] }),
  runAIDiagnostico: () => Promise.reject(new Error("não usado aqui")),
}));

const t = ptBR.appearance;
const root = document.documentElement;

function renderPage() {
  return render(
    <AnnouncerProvider>
      <SectionTheme />
      <AppearancePage />
    </AnnouncerProvider>,
  );
}

afterEach(() => {
  window.localStorage.clear();
  delete root.dataset.contrast;
  delete root.dataset.motion;
  pathname = "/app/mapas";
});

describe("Aparência (D-196)", () => {
  it("one colour for the whole app replaces the route's palette, and back", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(root.dataset.section).toBe("mapas");

    await user.click(screen.getByRole("radio", { name: t.colors.violeta }));
    expect(screen.getByRole("radio", { name: t.colors.violeta })).toHaveAttribute("aria-checked", "true");
    expect(root.dataset.section).toBe("selecao");
    expect(JSON.parse(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)!).color).toBe("violeta");

    await user.click(screen.getByRole("radio", { name: t.colors.route }));
    expect(root.dataset.section).toBe("mapas");
  });

  it("is one tab stop, and the arrows move the choice", async () => {
    const user = userEvent.setup();
    renderPage();
    const route = screen.getByRole("radio", { name: t.colors.route });
    expect(route).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: t.colors.azul })).toHaveAttribute("tabindex", "-1");
    route.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: t.colors.azul })).toHaveFocus();
    expect(screen.getByRole("radio", { name: t.colors.azul })).toHaveAttribute("aria-checked", "true");
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("radio", { name: t.colors.terracota })).toHaveFocus();
  });

  it("contrast and motion write the attributes the CSS reads", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByShadowRole("button", { name: t.contrast.high }));
    expect(root.dataset.contrast).toBe("high");
    await user.click(screen.getByShadowRole("button", { name: t.motion.reduced }));
    expect(root.dataset.motion).toBe("reduced");
    // "Padrão" is in both groups: the one asked for is the contrast's.
    const contrast = screen.getByRole("group", { name: t.contrastTitle });
    await user.click(within(contrast).getByRole("button", { name: t.contrast.standard }));
    expect(root.dataset.contrast).toBeUndefined();
  });

  it("sets the table density for every table", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByShadowRole("button", { name: t.density.compact }));
    expect(screen.getByShadowRole("button", { name: t.density.compact })).toHaveAttribute("aria-pressed", "true");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderPage();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
