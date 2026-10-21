import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import type { MaterialDetail, PropertyValueOut } from "@/lib/types";

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/app/materiais/5",
}));

function row(slug: string, name: string, minLevel: number | undefined): PropertyValueOut {
  return {
    property_slug: slug,
    property_name: name,
    symbol: null,
    category: "MECANICA",
    is_missing: false,
    is_interval: false,
    value_scalar: 1,
    value_min: null,
    value_max: null,
    value_typical: null,
    original_unit: "kg/m**3",
    normalized_value: 1,
    canonical_unit: "kg/m**3",
    conversion_method: null,
    display_unit: null,
    display_value: null,
    display_min: null,
    display_max: null,
    display_typical: null,
    display_uncertainty: null,
    uncertainty: null,
    measurement_condition: null,
    notes: null,
    data_quality: "MEDIDO",
    source_label: null,
    min_level: minLevel,
  } as PropertyValueOut;
}

const material = {
  id: 5,
  name: "Liga X",
  class_id: 1,
  class_name: "Metais",
  class_slug: "metais",
  subclass: null,
  description: null,
  is_demo: false,
  is_active: true,
  is_own_record: false,
  is_official: false,
  keywords: [],
  property_groups: [
    {
      category: "MECANICA",
      properties: [
        row("densidade", "Densidade", 1),
        row("coef_poisson", "Coeficiente de Poisson", 2),
        row("sem_nivel", "Grandeza sem nível", undefined),
      ],
    },
  ],
  processes: [],
  designations: [],
  composition: [],
} as unknown as MaterialDetail;

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMaterial: () => Promise.resolve(material),
  listProperties: () => Promise.resolve([]),
  getChart: () => new Promise(() => {}),
}));
vi.mock("@/lib/billing", () => ({ useCanEditCatalog: () => false }));
vi.mock("@/components/my-records/FavoriteButton", () => ({ FavoriteButton: () => null }));
vi.mock("@/components/my-records/useRecordVisit", () => ({ useRecordVisit: () => undefined }));
vi.mock("@/components/similar/SimilarPanel", () => ({ SimilarPanel: () => null }));
vi.mock("@/components/PropertyChart", () => ({ PropertyChart: () => null }));
vi.mock("@/components/CaeExportDialog", () => ({ MaterialExportMenu: () => null }));
vi.mock("@/components/material/MaterialCurves", () => ({ MaterialCurves: () => null }));
vi.mock("@/components/material/MaterialOrdinals", () => ({ MaterialOrdinals: () => null }));
vi.mock("@/components/material/EquivalenceSection", () => ({ EquivalenceSection: () => null }));

const { default: MaterialPage } = await import("./page");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MaterialPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
});

describe("ficha por nível de profundidade (D-127)", () => {
  it("sem nível escolhido mostra todas as propriedades, com o Nível 3 marcado", async () => {
    mount();
    expect(await screen.findByText("Coeficiente de Poisson")).toBeInTheDocument();
    expect(screen.getByText("Grandeza sem nível")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nível 3" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(ptBR.depth.sheetCount(3, 3, 3))).toBeInTheDocument();
  });

  it("no Nível 1 recorta a visão e diz por escrito quanto ficou de fora", async () => {
    nav.search = "nivel=1";
    mount();
    expect(await screen.findByText("Densidade")).toBeInTheDocument();
    // Sem nível declarado = visível em todos.
    expect(screen.getByText("Grandeza sem nível")).toBeInTheDocument();
    expect(screen.queryByText("Coeficiente de Poisson")).toBeNull();
    expect(screen.getByText(new RegExp(ptBR.depth.sheetCount(1, 2, 3)))).toBeInTheDocument();
    // Fora do nível não é ausente: a frase diz que a grandeza continua no cálculo.
    expect(screen.getByText(/não estão ausentes/)).toBeInTheDocument();
  });

  it("trocar de nível vai para a URL, preservando os outros parâmetros", async () => {
    nav.search = "u=densidade%3Ag%2Fcm**3";
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Nível 2" }));
    expect(nav.replace).toHaveBeenCalledWith(
      "/app/materiais/5?u=densidade%3Ag%2Fcm**3&nivel=2",
      { scroll: false },
    );
  });
});
