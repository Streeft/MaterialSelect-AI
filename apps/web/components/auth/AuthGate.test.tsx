import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AuthGate } from "./AuthGate";
import { ptBR } from "@/lib/i18n";
import type { CurrentUser } from "@/lib/types";

const route = { pathname: "/" };
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ replace: routerReplace }),
}));

const getCurrentUser = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  getCurrentUser: () => getCurrentUser(),
}));

const { ApiError } = await import("@/lib/api");

const user: CurrentUser = {
  id: 1,
  email: "pesquisador@example.com",
  name: "Usuária de teste",
  avatar_url: null,
  project_id: 1,
};

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
});

describe("AuthGate", () => {
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

  it("renders the real page for a valid session", async () => {
    getCurrentUser.mockResolvedValue(user);
    renderGate(<p>Conteúdo protegido</p>);

    expect(await screen.findByText("Conteúdo protegido")).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
