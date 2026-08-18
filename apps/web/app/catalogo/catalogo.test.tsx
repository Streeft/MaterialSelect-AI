import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button roles live
// inside a shadow root, invisible to plain @testing-library/react queries.
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type { MaterialListItem } from "@/lib/types";
import { selectMwcOption } from "@/lib/testing/mwc";

const t = ptBR.catalog;

const materials: MaterialListItem[] = [
  {
    id: 1,
    name: "Aço 1020",
    class_name: "Metais",
    class_slug: "metais",
    subclass: "Aço-carbono",
    is_demo: true,
    keywords: ["estrutural"],
    quality: { medido: 4, importado: 0, estimado: 1, missing: 0 },
  },
  {
    id: 2,
    name: "Alumina",
    class_name: "Cerâmicas",
    class_slug: "ceramicas",
    subclass: null,
    is_demo: true,
    keywords: [],
    quality: { medido: 0, importado: 2, estimado: 0, missing: 3 },
  },
  {
    id: 3,
    name: "Liga experimental",
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    is_demo: false,
    keywords: [],
    quality: { medido: 0, importado: 0, estimado: 0, missing: 0 },
  },
];

vi.mock("@/lib/api", () => ({
  listMaterials: () => Promise.resolve(materials),
  listClasses: () =>
    Promise.resolve([
      { id: 1, name: "Metais", slug: "metais", parent_id: null, description: null, material_count: 2 },
      {
        id: 2,
        name: "Cerâmicas",
        slug: "ceramicas",
        parent_id: null,
        description: null,
        material_count: 1,
      },
    ]),
  catalogueExportUrl: (format: string) => `#${format}`,
  opensInBrowser: (format: string) => format === "html",
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

// Imported after the mock so the page picks it up.
const { default: CatalogPage } = await import("./page");

async function renderCatalog() {
  const user = userEvent.setup();
  render(wrap(<CatalogPage />));
  expect(await screen.findByShadowRole("link", { name: /Aço 1020/ })).toBeInTheDocument();
  return user;
}

describe("catálogo", () => {
  it("says what each material's data is made of, on the row itself", async () => {
    await renderCatalog();

    const row = screen.getByShadowRole("link", { name: /Alumina/ }).closest("tr");
    expect(row).not.toBeNull();
    // Two imported values and three gaps — the gaps stated as a number, which is
    // the whole point: a shortlist built here should not rest on invisible holes.
    expect(within(row as HTMLElement).getByText(/2 importado/)).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText(/3 ausente/)).toBeInTheDocument();
  });

  it("says a material has nothing recorded instead of leaving the cell empty", async () => {
    await renderCatalog();

    const row = screen.getByShadowRole("link", { name: "Liga experimental" }).closest("tr");
    expect(within(row as HTMLElement).getByText(t.noValues)).toBeInTheDocument();
  });

  it("filters by data quality, not only by name", async () => {
    await renderCatalog();

    selectMwcOption(screen.getByShadowRole("combobox", { name: t.filterQuality }), "gaps");

    await waitFor(() => {
      expect(screen.queryByShadowRole("link", { name: /Aço 1020/ })).not.toBeInTheDocument();
    });
    expect(screen.getByShadowRole("link", { name: /Alumina/ })).toBeInTheDocument();
    expect(screen.getByText(t.showing(1, 3))).toBeInTheDocument();
  });

  it("offers a way out when the filters leave nothing on screen", async () => {
    const user = await renderCatalog();

    selectMwcOption(screen.getByShadowRole("combobox", { name: t.filterClass }), "ceramicas");
    selectMwcOption(screen.getByShadowRole("combobox", { name: t.filterQuality }), "measured");

    const empty = (await screen.findByText(t.emptyFiltered)).closest("div");
    expect(empty).not.toBeNull();
    // The empty state clears the filters rather than only apologising — the
    // button inside it, not the one in the filter card above.
    await user.click(within(empty as HTMLElement).getByShadowRole("button", { name: t.clearFilters }));
    expect(await screen.findByShadowRole("link", { name: /Aço 1020/ })).toBeInTheDocument();
  });

  it("carries the same materials into the card view a phone gets", async () => {
    const user = await renderCatalog();

    await user.click(screen.getByShadowRole("button", { name: t.viewCards }));

    await waitFor(() => expect(screen.queryByShadowRole("table")).not.toBeInTheDocument());
    for (const material of materials) {
      expect(screen.getByShadowRole("link", { name: new RegExp(material.name) })).toBeInTheDocument();
    }
    expect(screen.getByText(t.noValues)).toBeInTheDocument();
  });
});
