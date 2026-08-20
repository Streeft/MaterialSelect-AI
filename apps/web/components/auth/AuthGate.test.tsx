import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
// @material/web's button family exposes its role on a <button> inside a
// shadow root — plain @testing-library/react's screen can't see past that
// boundary. shadow-dom-testing-library's screen is a superset of the
// original (light-DOM-only queries still work) plus the Shadow-prefixed
// variants this file needs for the retry button in the billing-error test.
import { screen } from "shadow-dom-testing-library";
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

type BillingQuery = ReturnType<typeof import("@/lib/billing").useBillingStatus>;

// The real hook everywhere, with one escape hatch: a query state that cannot be
// reached by mocking the API alone. TanStack Query refuses `undefined` as query
// data (it turns into an error), yet reports exactly `data: undefined` with
// neither `isLoading` nor `isError` for a query paused by `networkMode` while
// offline — the state the gate must not fall through.
const billingStub = vi.hoisted(() => ({
  real: null as ((options?: { enabled?: boolean }) => unknown) | null,
  override: null as unknown,
}));

vi.mock("@/lib/billing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing")>();
  billingStub.real = actual.useBillingStatus;
  return { useBillingStatus: useBillingStatusStub };
});

function useBillingStatusStub(options?: { enabled?: boolean }): BillingQuery {
  const real = billingStub.real!(options) as BillingQuery;
  return (billingStub.override as BillingQuery | null) ?? real;
}

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
  billingStub.override = null;
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

  it("sends an unauthenticated visitor away from /assinatura too — that route only exempts billing, not session", async () => {
    route.pathname = "/assinatura";
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

  it("does not render protected content when the check settled without a status", async () => {
    // Neither loading, nor error, nor an explicit `active: false` — the state a
    // paused query lands in. The gate must confirm `active === true`, never
    // reach the page by elimination.
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockResolvedValue(undefined);

    renderGate(<p>Conteúdo protegido</p>);

    await screen.findByText(ptBR.auth.checkingSubscription);
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled(); // "sem resposta" is not "not subscribed"
  });

  it("shows a retryable error state when the billing check itself fails", async () => {
    getCurrentUser.mockResolvedValue(user);
    getBillingStatus.mockRejectedValue(new Error("falha de rede"));

    renderGate(<p>Conteúdo protegido</p>);

    await screen.findByShadowRole("alert");
    expect(screen.queryByText("Conteúdo protegido")).not.toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled(); // a failed check is not "not subscribed"

    getBillingStatus.mockClear();
    fireEvent.click(screen.getByShadowRole("button", { name: ptBR.ui.retry }));
    await waitFor(() => expect(getBillingStatus).toHaveBeenCalled());
  });
});
