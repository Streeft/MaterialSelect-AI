import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "shadow-dom-testing-library";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import LoginPage from "./entrar/page";
import BillingPage from "./assinatura/page";
import { StartScreen } from "@/components/marketing/StartScreen";

/** D-222: the front door says what the app does and where to enter; the billing page never promises a block that does not exist. */

const billing = vi.hoisted(() => ({ mode: "open" as "open" | "subscription" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  googleLoginUrl: () => "http://localhost:8000/api/auth/google/login",
  createCheckoutSession: () => Promise.resolve({ url: "#" }),
  createPortalSession: () => Promise.resolve({ url: "#" }),
  getBillingStatus: () =>
    Promise.resolve({
      active: false,
      status: null,
      current_period_end: null,
      access_mode: billing.mode,
      has_access: billing.mode === "open",
      can_edit_catalog: false,
    }),
}));

function withClient(node: React.ReactNode) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {node}
    </QueryClientProvider>
  );
}

describe("página inicial pública", () => {
  it("explica o método em três passos com capturas e oferece o caminho para entrar", async () => {
    const { container } = render(<StartScreen />);
    expect(screen.getByRole("heading", { level: 1, name: ptBR.auth.landing.heroQuestion })).toBeInTheDocument();
    for (const step of ptBR.auth.landing.steps) {
      expect(screen.getByRole("heading", { level: 3, name: step.title })).toBeInTheDocument();
      // D-236: the captures are real screens, described for whoever cannot see them.
      expect(screen.getByRole("img", { name: step.alt })).toBeInTheDocument();
    }
    for (const item of ptBR.auth.landing.guarantees) {
      expect(screen.getByRole("heading", { level: 3, name: item.title })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: ptBR.auth.landingEnter })).toHaveAttribute("href", "/entrar");
    const starts = screen.getAllByRole("link", { name: new RegExp(ptBR.home.start) });
    expect(starts.every((link) => link.getAttribute("href") === "/app/selecao")).toBe(true);
    const footer = screen.getByRole("navigation", { name: ptBR.auth.landing.footer });
    expect(footer).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("/entrar", () => {
  it("diz que não há assinatura e deixa voltar à página inicial", async () => {
    const { container } = render(<LoginPage />);
    expect(screen.getByText(ptBR.auth.loginAccess)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ptBR.auth.loginBack })).toHaveAttribute("href", "/");
    // D-236: the split frame — the brand side links home and says the method.
    expect(screen.getByText(ptBR.auth.entryPhrase)).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("/assinatura", () => {
  it("no acesso aberto não pede nem promete assinatura", async () => {
    billing.mode = "open";
    render(withClient(<BillingPage />));
    expect(await screen.findByText(ptBR.billing.openSubtitle)).toBeInTheDocument();
    expect(screen.queryByText(ptBR.billing.subscribeButton)).not.toBeInTheDocument();
    expect(ptBR.billing.openSubtitle).toMatch(/sem assinatura e sem cobrança/);
  });

  it("com o acesso fechado, diz que ESTA instalação exige assinatura", async () => {
    billing.mode = "subscription";
    render(withClient(<BillingPage />));
    expect(await screen.findByText(ptBR.billing.inactiveSubtitle)).toBeInTheDocument();
    expect(ptBR.billing.inactiveSubtitle).toMatch(/Esta instalação exige/);
  });
});
