import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { styleGuideVisible } from "@/lib/styleGuideAccess";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { allowLoadedRunner } from "@/lib/testing/loadedRunner";

// Long, CPU-bound jsdom walks: see lib/testing/loadedRunner.ts.
allowLoadedRunner();

/**
 * D-202: `/app/estilo` is living documentation for whoever maintains the
 * product, and it answered 200 for every signed-in reader in production. It now
 * shows to the curator (who can edit the shared catalogue) or outside
 * production, and says so to anyone else.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/estilo",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const billing: { status: "ok" | "error" | "pending"; canEdit: boolean } = {
  status: "ok",
  canEdit: true,
};
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getBillingStatus: () => {
    if (billing.status === "pending") return new Promise(() => {});
    if (billing.status === "error") return Promise.reject(new Error("falhou"));
    return Promise.resolve({
      active: billing.canEdit,
      status: null,
      current_period_end: null,
      access_mode: billing.canEdit ? "subscription" : "open",
      has_access: true,
      can_edit_catalog: billing.canEdit,
    });
  },
}));

const { default: StylePage } = await import("./page");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StylePage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  billing.status = "ok";
  billing.canEdit = true;
});

describe("styleGuideVisible", () => {
  it("fora de produção, todos veem", () => {
    expect(styleGuideVisible({ production: false, canEdit: false })).toBe(true);
    expect(styleGuideVisible({ production: false, canEdit: null })).toBe(true);
  });

  it("em produção, só quem cura o catálogo; desconhecido não vale", () => {
    expect(styleGuideVisible({ production: true, canEdit: true })).toBe(true);
    expect(styleGuideVisible({ production: true, canEdit: false })).toBe(false);
    expect(styleGuideVisible({ production: true, canEdit: null })).toBe(false);
  });
});

describe("/app/estilo", () => {
  it("em produção, um estudante em acesso aberto vê 'Página restrita' e nada da vitrine", async () => {
    vi.stubEnv("NODE_ENV", "production");
    billing.canEdit = false;
    const { container } = mount();

    expect(await screen.findByShadowText(ptBR.styleGuide.restrictedTitle)).toBeInTheDocument();
    expect(screen.getByShadowText(ptBR.styleGuide.restrictedDescription)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: ptBR.styleGuide.title })).toBeNull();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it("em produção, enquanto a permissão não chegou, não mostra a vitrine", async () => {
    vi.stubEnv("NODE_ENV", "production");
    billing.status = "pending";
    mount();

    expect(screen.queryByRole("heading", { name: ptBR.styleGuide.title })).toBeNull();
  });

  it("em produção, se a permissão não pôde ser lida, fica restrita", async () => {
    vi.stubEnv("NODE_ENV", "production");
    billing.status = "error";
    mount();

    expect(await screen.findByShadowText(ptBR.styleGuide.restrictedTitle)).toBeInTheDocument();
  });

  it("em produção, quem cura o catálogo vê a vitrine", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mount();

    expect(
      await screen.findByRole("heading", { name: ptBR.styleGuide.title }),
    ).toBeInTheDocument();
    expect(screen.queryByShadowText(ptBR.styleGuide.restrictedTitle)).toBeNull();
  });

  it("fora de produção, todos veem, sem esperar a permissão", async () => {
    billing.canEdit = false;
    mount();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: ptBR.styleGuide.title })).toBeInTheDocument(),
    );
    expect(screen.queryByShadowText(ptBR.styleGuide.restrictedTitle)).toBeNull();
  });
});
