import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import type { FamilyNoteEntry, MaterialDetail } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/app/materiais/5",
}));

const material = {
  id: 5,
  name: "Liga X",
  class_id: 1,
  class_name: "Metais",
  class_slug: "metais",
  subclass: "Liga leve",
  description: null,
  is_demo: false,
  is_active: true,
  is_own_record: false,
  is_official: false,
  keywords: [],
  property_groups: [],
  processes: [],
  designations: [],
  composition: [],
} as unknown as MaterialDetail;

const note: FamilyNoteEntry = {
  slug: "metais",
  summary: "Materiais de ligação metálica.",
  body: ["Átomos num arranjo cristalino."],
  when_to_use: ["Peças que carregam carga."],
  watch_out: ["Corrosão."],
  reference: null,
  license: "Texto autoral do projeto MaterialSelect AI.",
  review_status: "rascunho",
  lang: "pt-BR",
};

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMaterial: () => Promise.resolve(material),
  listProperties: () => Promise.resolve([]),
  getChart: () => new Promise(() => {}),
  listFamilyNotes: () => Promise.resolve([note]),
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

describe("nota da família na ficha do material (D-151)", () => {
  it("aparece dobrada logo abaixo da classe, no cartão do cabeçalho", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MaterialPage />
      </QueryClientProvider>,
    );
    const summary = await screen.findByText(ptBR.familyNotes.about("Metais"));
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    // Same header card as the material's name and class.
    const card = screen.getByRole("heading", { level: 1, name: "Liga X" }).closest("div.min-w-0");
    expect(card).not.toBeNull();
    expect(card!.contains(details)).toBe(true);
    expect(screen.getByText("Liga leve")).toBeInTheDocument();
  });
});
