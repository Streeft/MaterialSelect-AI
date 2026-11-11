import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "shadow-dom-testing-library";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import LoginPage from "./entrar/page";
import BillingPage from "./assinatura/page";

/**
 * PR 1.4 (D-202): the two pages outside `/app` — /entrar and /assinatura — sit
 * outside the app shell too, so no layout gives them the `<main>` landmark that
 * a screen reader jumps to. Each one has to carry its own.
 */

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

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
      access_mode: "subscription",
      has_access: false,
      can_edit_catalog: false,
    }),
}));

/** axe's `region` rule is what says "content outside any landmark"; the shared helper turns it off for fragments. */
async function landmarkViolations(container: Element) {
  return findA11yViolations(container, {
    rules: {
      "color-contrast": { enabled: false },
      region: { enabled: true },
      "landmark-one-main": { enabled: true },
    },
  });
}

function withClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("páginas públicas têm landmark principal", () => {
  it("/entrar tem um único <main> com o título dentro", async () => {
    const { container } = render(<LoginPage />);
    const mains = container.querySelectorAll("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]!.querySelector("h1")?.textContent).toBe(ptBR.auth.loginTitle);
    const violations = await landmarkViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it("/assinatura tem um único <main> com o título dentro", async () => {
    const { container } = render(withClient(<BillingPage />));
    await screen.findByRole("heading", { level: 1, name: ptBR.billing.title });
    const mains = container.querySelectorAll("main");
    expect(mains).toHaveLength(1);
    expect(mains[0]!.querySelector("h1")?.textContent).toBe(ptBR.billing.title);
    const violations = await landmarkViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("a capa de início não promete uma vitrine que não existe", () => {
  const web = resolve(__dirname, "..");

  it("a vitrine de vendas foi removida", () => {
    expect(existsSync(resolve(web, "components/marketing/Landing.tsx"))).toBe(false);
  });

  it("nenhum comentário manda trocar a capa por ela", () => {
    for (const file of ["app/page.tsx", "components/marketing/StartScreen.tsx"]) {
      const source = readFileSync(resolve(web, file), "utf8");
      expect(source, file).not.toMatch(/swap `?StartScreen`? back|swapping one import|`Landing\.tsx`/);
    }
  });
});
