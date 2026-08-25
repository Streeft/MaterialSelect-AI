import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthGate } from "./AuthGate";
import { ptBR } from "@/lib/i18n";
import type { BillingStatus, CurrentUser } from "@/lib/types";

const route = { pathname: "/" };
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ replace: routerReplace }),
}));

const getCurrentUser = vi.fn();
const getBillingStatus = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  getCurrentUser: () => getCurrentUser(),
  getBillingStatus: () => getBillingStatus(),
}));

const { ApiError } = await import("@/lib/api");

const user: CurrentUser = {
  id: 1,
  email: "pesquisador@example.com",
  name: "Usuária de teste",
  avatar_url: null,
  project_id: 1,
};

const activeBilling: BillingStatus = { active: true, status: "active", current_period_end: null };
const inactiveBilling: BillingStatus = { active: false, status: null, current_period_end: null };

function renderGate(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthGate>{children}</AuthGate>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  route.pathname = "/";
  routerReplace.mockClear();
  getCurrentUser.mockReset();
  getBillingStatus.mockReset();
});

describe("AuthGate — sessão", () => {
  it("always renders /entrar, session check or not", () => {
    route.pathname = "/entrar";
    getCurrentUser.mockReturnValue(new Promise(() => {})); // never settles
    renderGate(<p>Formulário de login</p>);

    expect(screen.getByText("Formulário de login")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("holds the real page back while the session check is in flight", () => {
    getCurrentUser.mockReturnValue(new Promise(() => {}));
    renderGate(<p>Conteúdo protegido</p>);

    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
    expect(screen.getByText(ptBR.auth.checkingSession)).toBeInTheDocument();
  });

  it("sends a logged-out visitor to /entrar", async () => {
    getCurrentUser.mockRejectedValue(new ApiError("Não autenticado.", 401));
    renderGate(<p>Conteúdo protegido</p>);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/entrar"));
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });
});

describe("AuthGate — assinatura", () => {
  it("always renders /assinatura once logged in, billing check or not", async () => {
    route.pathname = "/assinatura";
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockReturnValue(new Promise(() => {})); // never settles

    renderGate(<p>Tela de assinatura</p>);

    expect(await screen.findByText("Tela de assinatura")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("holds the real page back while the billing check is in flight", async () => {
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockReturnValue(new Promise(() => {}));

    renderGate(<p>Conteúdo protegido</p>);

    await screen.findByText(ptBR.auth.checkingSubscription);
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });

  it("sends an unsubscribed user to /assinatura", async () => {
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockResolvedValue(inactiveBilling);

    renderGate(<p>Conteúdo protegido</p>);

    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("/assinatura"));
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
  });

  it("renders the real page for an active subscription", async () => {
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockResolvedValue(activeBilling);

    renderGate(<p>Conteúdo protegido</p>);

    expect(await screen.findByText("Conteúdo protegido")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
