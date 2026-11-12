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
  it("explica o app em três pontos e oferece o caminho para entrar", async () => {
    const { container } = render(<StartScreen />);
    for (const point of ptBR.auth.landingPoints) {
      expect(screen.getByText(point.title)).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: ptBR.auth.landingEnter })).toHaveAttribute("href", "/entrar");
    expect(screen.getByRole("link", { name: new RegExp(ptBR.home.start) })).toHaveAttribute("href", "/app/selecao");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("/entrar", () => {
  it("diz que não há assinatura e deixa voltar à página inicial", () => {
    render(<LoginPage />);
    expect(screen.getByText(ptBR.auth.loginAccess)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ptBR.auth.loginBack })).toHaveAttribute("href", "/");
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
