import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { AnnouncerProvider } from "@/components/ui/Announcer";
import { ptBR } from "@/lib/i18n";
import { APPEARANCE_STORAGE_KEY } from "@/lib/appearance";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { SectionTheme } from "@/components/layout/SectionTheme";
import { AppearanceSync } from "@/components/layout/AppearanceSync";
import { resetSyncStateForTests } from "@/lib/appearanceSync";
import AppearancePage from "./page";

let pathname = "/app/mapas";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
const account = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
// D-228: the page carries the AI diagnosis; its own test is AIDiagnosticsCard.test.tsx.
vi.mock("@/lib/api", () => ({
  getAccountAppearance: () => account.get(),
  putAccountAppearance: (body: unknown) => account.put(body),
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
  account.get.mockReset();
  account.put.mockReset();
  resetSyncStateForTests();
  window.localStorage.clear();
  delete root.dataset.contrast;
  delete root.dataset.motion;
  delete root.dataset.rail;
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

  it("offers the light rail, and back to the dark default (D-236b)", async () => {
    const user = userEvent.setup();
    renderPage();
    const rail = screen.getByRole("group", { name: t.railTitle });
    await user.click(within(rail).getByRole("button", { name: t.rail.light }));
    expect(root.dataset.rail).toBe("light");
    await user.click(within(rail).getByRole("button", { name: t.rail.dark }));
    expect(root.dataset.rail).toBeUndefined();
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

  describe("na conta (D-249)", () => {
    function renderSynced() {
      return render(
        <AnnouncerProvider>
          <SectionTheme />
          <AppearanceSync />
          <AppearancePage />
        </AnnouncerProvider>,
      );
    }

    it("wears what the account has and says it is kept there", async () => {
      account.get.mockResolvedValue({ color: "violeta", contrast: "high", motion: "reduced", rail: "light", saved: true });
      renderSynced();
      expect(await screen.findByText(t.syncSaved)).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: t.colors.violeta })).toHaveAttribute("aria-checked", "true");
      expect(root.dataset.contrast).toBe("high");
      expect(root.dataset.motion).toBe("reduced");
      expect(root.dataset.rail).toBe("light");
    });

    it("sends a change to the account and says so, without asking for a Save button", async () => {
      account.get.mockResolvedValue({ color: "route", contrast: "standard", motion: "standard", rail: "dark", saved: false });
      account.put.mockResolvedValue({});
      const user = userEvent.setup();
      renderSynced();
      expect(await screen.findByText(t.syncIdle)).toBeInTheDocument();
      const rail = screen.getByRole("group", { name: t.railTitle });
      await user.click(within(rail).getByRole("button", { name: t.rail.light }));
      await waitFor(() => expect(account.put).toHaveBeenCalledWith({ color: "route", contrast: "standard", motion: "standard", rail: "light" }));
      expect(await screen.findByText(t.syncSaved)).toBeInTheDocument();
    });

    it("says, in a visible warning, that the choice is only on this device when the account cannot be reached", async () => {
      account.get.mockRejectedValue(new Error("offline"));
      renderSynced();
      const note = await screen.findByText(t.syncLocal);
      expect(note.closest('[role="status"]')).not.toBeNull();
      // The device still wears what the reader picks.
      const user = userEvent.setup();
      await user.click(screen.getByRole("radio", { name: t.colors.rosa }));
      expect(root.dataset.section).toBe("comparar");
    });

    it("has no accessibility violations with the warning showing", async () => {
      account.get.mockRejectedValue(new Error("offline"));
      const { container } = renderSynced();
      await screen.findByText(t.syncLocal);
      const violations = await findA11yViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });
});
