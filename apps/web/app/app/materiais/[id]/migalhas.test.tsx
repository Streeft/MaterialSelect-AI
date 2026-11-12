import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { DocumentTitle } from "@/components/layout/DocumentTitle";
import { formatDocumentTitle } from "@/lib/pageTitle";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { MaterialDetail } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/app/materiais/5",
}));

const material = {
  id: 5,
  name: "Aço inoxidável 304",
  class_id: 1,
  class_name: "Aços inoxidáveis",
  class_slug: "acos-inoxidaveis",
  subclass: null,
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

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMaterial: () => Promise.resolve(material),
  listProperties: () => Promise.resolve([]),
  getChart: () => new Promise(() => {}),
  listFamilyNotes: () => Promise.resolve([]),
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

describe("migalhas e título da aba na ficha do material (D-207)", () => {
  it("mostra Catálogo / família / material e dá o nome do material à aba", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DocumentTitle />
        <MaterialPage />
      </QueryClientProvider>,
    );
    const trail = await screen.findByRole("navigation", { name: "Trilha de navegação" });
    expect(within(trail).getByRole("link", { name: ptBR.nav.catalog })).toHaveAttribute(
      "href",
      "/app/catalogo",
    );
    expect(within(trail).getByRole("link", { name: "Aços inoxidáveis" })).toHaveAttribute(
      "href",
      "/app/catalogo/acos-inoxidaveis",
    );
    expect(within(trail).getByText("Aço inoxidável 304")).toHaveAttribute("aria-current", "page");
    expect(document.title).toBe(formatDocumentTitle("Aço inoxidável 304"));

    const violations = await findA11yViolations(trail);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
