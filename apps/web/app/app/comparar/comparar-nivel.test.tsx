import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { depthSelectorsText } from "@/lib/i18n-depth-selectors";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { ComparisonRequest } from "@/lib/types";

vi.mock("react-plotly.js", () => ({ default: () => null }));

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/comparar",
}));

const requests: ComparisonRequest[] = [];
const prop = (slug: string, name: string, min_level: number, value_count: number) => ({
  slug,
  name,
  canonical_unit: "Pa",
  better_direction: "HIGHER",
  value_count,
  min_level,
});

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  evaluateIndex: vi.fn(),
  getComparison: (request: ComparisonRequest) => {
    requests.push(request);
    return new Promise(() => {});
  },
  listMaterials: () =>
    Promise.resolve([{ id: 1, name: "Aço", class_name: "Metais", class_slug: "metais" }]),
  listProperties: () =>
    Promise.resolve([
      prop("densidade", "Densidade", 1, 9),
      prop("modulo_young", "Módulo de Young", 1, 8),
      prop("coef_poisson", "Coeficiente de Poisson", 2, 7),
      prop("fadiga", "Limite de fadiga", 3, 6),
      prop("tenacidade", "Tenacidade à fratura", 3, 5),
    ]),
  listPerformanceIndices: () => Promise.resolve([]),
}));

const { default: ComparePage } = await import("./page");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ComparePage />
    </QueryClientProvider>,
  );
}

describe("comparador: nível de profundidade nas colunas (D-165)", () => {
  beforeEach(() => {
    requests.length = 0;
    window.history.replaceState(null, "", "/app/comparar");
  });

  it("no Nível 1 não oferece a grandeza de nível maior que ninguém escolheu, e diz quantas", async () => {
    nav.query = "materiais=1&nivel=1";
    mount();

    expect(await screen.findByRole("button", { name: "Densidade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tenacidade à fratura" })).toBeNull();
    // 2 of level 1 + the 2 already chosen by default (levels 2 and 3), of 5.
    expect(
      screen.getByText(
        new RegExp(depthSelectorsText.count(1, 4, 5, depthSelectorsText.whereCompare)),
      ),
    ).toBeInTheDocument();
  });

  it("sem nível mostra tudo, como antes", async () => {
    nav.query = "materiais=1";
    mount();
    expect(await screen.findByRole("button", { name: "Limite de fadiga" })).toBeInTheDocument();
  });

  it("não tira da tela o que já estava escolhido, mesmo de nível maior", async () => {
    // The four most populated properties are the default pick: at level 1 the
    // ones above that level stay on screen, chosen, and stay in the request.
    nav.query = "materiais=1&nivel=1";
    const { container } = mount();

    for (const name of ["Coeficiente de Poisson", "Limite de fadiga"]) {
      expect(await screen.findByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    }
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });
});
