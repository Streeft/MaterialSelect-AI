import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import { ptBR } from "@/lib/i18n";
import { allowLoadedRunner } from "@/lib/testing/loadedRunner";

// Long, CPU-bound jsdom walks: see lib/testing/loadedRunner.ts.
allowLoadedRunner();

/**
 * D-208 (revising D-202): `/app/estilo` is open to every signed-in reader, in
 * production too, whatever the billing status says. The page no longer asks for
 * the permission at all.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/estilo",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const getBillingStatus = vi.fn(() => Promise.reject(new Error("não deveria ser chamado")));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getBillingStatus: () => getBillingStatus(),
}));

const { default: StylePage } = await import("./page");

afterEach(() => {
  vi.unstubAllEnvs();
  getBillingStatus.mockClear();
});

describe("/app/estilo", () => {
  it("em produção, um estudante em acesso aberto vê a vitrine, sem consultar a permissão", async () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<StylePage />);

    expect(
      await screen.findByRole("heading", { name: ptBR.styleGuide.title }),
    ).toBeInTheDocument();
    expect(getBillingStatus).not.toHaveBeenCalled();
  });

  it("fora de produção, também aparece", async () => {
    render(<StylePage />);

    expect(
      await screen.findByRole("heading", { name: ptBR.styleGuide.title }),
    ).toBeInTheDocument();
  });
});
