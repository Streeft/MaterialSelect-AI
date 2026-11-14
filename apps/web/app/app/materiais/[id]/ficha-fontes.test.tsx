import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { MaterialDetail } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/app/materiais/5",
}));

const base = {
  symbol: null,
  category: "FISICA",
  is_interval: false,
  value_min: null,
  value_max: null,
  value_typical: null,
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
};

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
      category: "FISICA",
      properties: [
        {
          ...base,
          property_slug: "densidade",
          property_name: "Densidade",
          is_missing: false,
          value_scalar: 7.85,
          original_unit: "g/cm**3",
          data_quality: "MEDIDO",
          source_label: "Handbook",
        },
        {
          ...base,
          property_slug: "condutividade",
          property_name: "Condutividade",
          is_missing: true,
          value_scalar: null,
          original_unit: null,
          data_quality: "MEDIDO",
          source_label: null,
        },
      ],
    },
  ],
  processes: [],
  designations: [],
  composition: [],
  sources: [
    {
      id: 1,
      label: "Handbook",
      reference: null,
      authors: "ASHBY, Michael F.",
      title: "Materials selection in mechanical design",
      publisher: "Butterworth-Heinemann",
      year: 2011,
      url: null,
      accessed_on: null,
      abnt: "ASHBY, Michael F. Materials selection in mechanical design. Butterworth-Heinemann, 2011.",
    },
  ],
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

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
});

const t = curadoriaText.cite;

describe("ficha: Citar fonte (ABNT) (D-233)", () => {
  it("a seção de fontes já vem aberta e um clique copia a citação montada no servidor", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MaterialPage />
      </QueryClientProvider>,
    );

    // One click: the section is open from the start, nothing to unfold first.
    await user.click(await screen.findByRole("button", { name: t.buttonFor("Handbook") }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith(material.sources![0]!.abnt);
    expect(await screen.findByText(t.done)).toBeInTheDocument();
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("a seção está no índice da ficha", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MaterialPage />
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: t.buttonFor("Handbook") });
    expect(screen.getAllByRole("link", { name: t.title }).length).toBeGreaterThan(0);
  });
});
