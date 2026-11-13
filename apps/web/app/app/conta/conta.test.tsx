import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import AccountPage from "./page";

/** D-236: Conta inside the app — profile, access, today's AI use, Aparência, sair. */

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/app/conta",
}));

const api = vi.hoisted(() => ({
  mode: "open" as "open" | "subscription",
  logout: vi.fn(() => Promise.resolve()),
  portal: vi.fn(() => Promise.resolve({ url: "#portal" })),
}));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getCurrentUser: () =>
    Promise.resolve({ id: 1, email: "ana@exemplo.org", name: "Ana", avatar_url: null, project_id: 1 }),
  getBillingStatus: () =>
    Promise.resolve({
      active: api.mode === "subscription",
      status: api.mode === "subscription" ? "active" : null,
      current_period_end: api.mode === "subscription" ? "2026-12-31T00:00:00Z" : null,
      access_mode: api.mode,
      has_access: true,
      can_edit_catalog: false,
    }),
  getDashboardActivity: () =>
    Promise.resolve({
      studies: 0,
      charts: 0,
      notebooks: 0,
      own_materials: 0,
      months: [],
      actions: {},
      recent: [],
      ai: {
        today: { day: "2026-11-13", requests: 3, artifacts: 1, fetches: 0 },
        ai_daily_limit: 100,
        notebook_daily_limit: 60,
        artifact_daily_limit: 10,
        fetch_daily_limit: 30,
        days: [],
      },
    }),
  createPortalSession: api.portal,
  logout: api.logout,
}));

const t = ptBR.account;

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccountPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.mode = "open";
  replace.mockClear();
  api.logout.mockClear();
});

describe("Conta (D-236)", () => {
  it("mostra o perfil, o acesso aberto e o uso de hoje como o servidor conta", async () => {
    const { container } = renderPage();
    expect(await screen.findByText("ana@exemplo.org")).toBeInTheDocument();
    expect(screen.getByText(t.roleStudent)).toBeInTheDocument();
    expect(await screen.findByText(t.planOpen)).toBeInTheDocument();
    const usage = screen.getByRole("region", { name: t.usageTitle });
    expect(await within(usage).findByText(t.usedOf(3, 60))).toBeInTheDocument();
    expect(within(usage).getByText(t.usedOf(1, 10))).toBeInTheDocument();
    expect(within(usage).getByText(t.usedOf(0, 30))).toBeInTheDocument();
    // The meter carries the same reading, for whoever cannot see the bar.
    expect(within(usage).getByRole("meter", { name: `${t.usageQuestions}: ${t.usedOf(3, 60)}` })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.appearanceOpen })).toHaveAttribute("href", "/app/aparencia");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it("com assinatura, diz até quando e oferece gerenciar como ação secundária", async () => {
    api.mode = "subscription";
    renderPage();
    expect(await screen.findByText(/Assinatura ativa até/)).toBeInTheDocument();
    expect(screen.getByShadowRole("button", { name: ptBR.billing.manageButton })).toBeInTheDocument();
  });

  it("sair encerra a sessão e leva a /entrar", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByShadowRole("button", { name: ptBR.auth.logout }));
    expect(api.logout).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/entrar");
  });
});
