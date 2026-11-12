import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button roles live
// inside a shadow root, invisible to plain @testing-library/react queries.
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { MaterialListItem } from "@/lib/types";

// PageHeader reads its section from the current route (Task 1) — the mock
// needs a real pathname so `sectionForPath` doesn't crash on `null`.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/catalogo",
  useSearchParams: () => new URLSearchParams(),
}));

const t = ptBR.catalog;

const materials: MaterialListItem[] = [
  {
    id: 1,
    name: "Aço 1020",
    class_name: "Metais",
    class_slug: "metais",
    subclass: "Aço-carbono",
    is_demo: true,
    is_own_record: false,
    keywords: ["estrutural"],
    quality: { medido: 4, importado: 0, estimado: 1, missing: 0 },
    designations: [],
  },
  {
    id: 2,
    name: "Alumina",
    class_name: "Cerâmicas",
    class_slug: "ceramicas",
    subclass: null,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 0, importado: 2, estimado: 0, missing: 3 },
    designations: [],
  },
  {
    id: 3,
    name: "Liga experimental",
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    is_demo: false,
    is_own_record: false,
    keywords: [],
    quality: { medido: 0, importado: 0, estimado: 0, missing: 0 },
    designations: [],
  },
];

const savedViews = vi.hoisted(() => ({ list: [] as unknown[] }));

// D-105: what the search answers, steered per test.
const search = vi.hoisted(() => ({
  composition: null as unknown,
  reject: null as null | { message: string; status: number },
  // D-217: more materials, to make the catalogue longer than one page.
  extra: [] as MaterialListItem[],
}));

interface Question {
  classe?: string | null;
  subclasse?: string | null;
  qualidade?: string | null;
  demo?: boolean | null;
  limit?: number;
  offset?: number;
  ordenar?: string;
}

/**
 * D-217: what the server does with the chips, for this fixture — the filters,
 * the counts per chip (the other chips applied) and the page. The screen sends
 * the question; it no longer filters anything itself.
 */
function quality(m: MaterialListItem, q: string): boolean {
  const filled = m.quality.medido + m.quality.importado + m.quality.estimado;
  if (q === "complete") return m.quality.missing === 0 && filled > 0;
  if (q === "gaps") return m.quality.missing > 0;
  if (q === "measured") return m.quality.medido > 0;
  return (m.reference_count ?? 0) > 0;
}
function passes(m: MaterialListItem, q: Question, skip?: string): boolean {
  return (
    (skip === "classe" || !q.classe || m.class_slug === q.classe) &&
    (skip === "subclasse" || !q.subclasse || m.subclass === q.subclasse) &&
    (skip === "qualidade" || !q.qualidade || quality(m, q.qualidade)) &&
    (skip === "demo" || q.demo === null || q.demo === undefined || m.is_demo === q.demo)
  );
}
function tally(rows: MaterialListItem[], key: (m: MaterialListItem) => string[]) {
  const out: Record<string, number> = {};
  for (const m of rows) for (const k of key(m)) out[k] = (out[k] ?? 0) + 1;
  return out;
}
function answer(q: Question) {
  const pool = [...materials, ...search.extra];
  const passed = pool.filter((m) => passes(m, q));
  const offset = q.offset ?? 0;
  return {
    items: q.limit ? passed.slice(offset, offset + q.limit) : passed,
    total: passed.length,
    offset,
    limit: q.limit ?? null,
    composition: search.composition,
    facets: {
      classe: tally(pool.filter((m) => passes(m, q, "classe")), (m) => [m.class_slug]),
      subclasse: tally(pool.filter((m) => passes(m, q, "subclasse")), (m) =>
        m.subclass ? [m.subclass] : [],
      ),
      qualidade: tally(pool.filter((m) => passes(m, q, "qualidade")), (m) =>
        ["complete", "gaps", "measured", "referenced"].filter((k) => quality(m, k)),
      ),
      demo: tally(pool.filter((m) => passes(m, q, "demo")), (m) => [String(m.is_demo)]),
    },
  };
}

const searchSpy = vi.hoisted(() => ({ calls: [] as unknown[] }));

vi.mock("@/lib/api", () => ({
  listMaterials: () => Promise.resolve(materials),
  searchMaterials: (q: Question) => {
    searchSpy.calls.push(q);
    return search.reject
      ? Promise.reject(Object.assign(new Error(search.reject.message), { status: search.reject.status }))
      : Promise.resolve(answer(q));
  },
  listProperties: () =>
    Promise.resolve([
      { id: 1, name: "Densidade", slug: "densidade", value_count: 3 },
      { id: 2, name: "Sem uso", slug: "sem_uso", value_count: 0 },
    ]),
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
  getMaterial: (id: number) =>
    Promise.resolve({
      id,
      name: materials.find((m) => m.id === id)!.name,
      class_id: 1,
      class_name: "Metais",
      class_slug: "metais",
      subclass: null,
      description: null,
      is_demo: true,
      is_active: true,
      is_own_record: false,
      keywords: [],
      property_groups: [],
      processes: [],
      designations: [],
      composition: [],
    }),
  catalogueExportUrl: (format: string) => `#${format}`,
  // D-209: the screen's saved views; none by default.
  listSavedViews: () => Promise.resolve(savedViews.list),
  createSavedView: (payload: Record<string, unknown>) =>
    Promise.resolve({ id: 99, position: 0, created_at: "", updated_at: "", config: {}, ...payload }),
  updateSavedView: () => Promise.resolve({}),
  deleteSavedView: () => Promise.resolve(),
  opensInBrowser: (format: string) => format === "html",
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>
  );
}

// Imported after the mock so the page picks it up.
const { default: CatalogPage } = await import("./page");

// D-209: the filters are chips ("Campo: valor ▾") that open their options.
// D-217: an option's name also carries its count ("Cerâmicas, 1 resultado").
async function pick(field: string, option: string) {
  await userEvent.click(
    screen.getByShadowRole("button", { name: new RegExp(`^${field}: `) }),
  );
  await userEvent.click(
    await screen.findByShadowRole("button", { name: new RegExp(`^${escapeRe(option)}(,|$)`) }),
  );
}

function escapeRe(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function renderCatalog() {
  const user = userEvent.setup();
  render(wrap(<CatalogPage />));
  const table = await screen.findByShadowRole("table");
  expect(within(table).getByShadowRole("link", { name: /Aço 1020/ })).toBeInTheDocument();
  return { user, table };
}

// The table (`hidden sm:block`) and the card list (`sm:hidden`) render
// together — jsdom never evaluates the media query that picks one, so both
// exist in the DOM at once. Every lookup below is scoped to the table to
// avoid an ambiguous match against the card carrying the same material name.
describe("catálogo", () => {
  beforeEach(() => {
    search.composition = null;
    search.reject = null;
    search.extra = [];
    searchSpy.calls = [];
    savedViews.list = [];
    // D-217: the screen's state lives in the URL; each test starts clean.
    window.history.replaceState(null, "", "/app/catalogo");
  });

  it("links, quietly, to the changes between releases (D-108)", async () => {
    await renderCatalog();
    const link = screen.getByRole("link", { name: t.releasesLink });
    expect(link).toHaveAttribute("href", "/app/catalogo/releases");
  });

  it("states the composition rule and who was left out for lack of data (D-105)", async () => {
    search.composition = {
      rule: "Composição por alcance da faixa.",
      undetermined: 2,
      without_composition: 2,
      conditions: [
        {
          label: "Cr ≥ 12 %",
          element: "Cr",
          element_name: "Cromo",
          satisfied: 1,
          not_satisfied: 0,
          undetermined: 2,
          undetermined_by_reason: {
            sem_composicao: 2,
            elemento_nao_declarado: 0,
            declarado_ausente: 0,
            resto_sem_numero: 0,
          },
        },
      ],
    };
    await renderCatalog();
    expect(screen.getByText("Composição por alcance da faixa.")).toBeInTheDocument();
    expect(screen.getByText(t.compositionUndetermined(2))).toBeInTheDocument();
  });

  it("shows a refused query's reason instead of a generic failure (D-105)", async () => {
    search.reject = { message: "Norma desconhecida: 'XYZ'.", status: 400 };
    render(wrap(<CatalogPage />));
    expect(await screen.findByText("Norma desconhecida: 'XYZ'.")).toBeInTheDocument();
    expect(screen.getByText(t.searchError)).toBeInTheDocument();
  });

  it("says what each material's data is made of, on the row itself", async () => {
    const { table } = await renderCatalog();

    const row = within(table).getByShadowRole("link", { name: /Alumina/ }).closest("tr");
    expect(row).not.toBeNull();
    // Two imported values and three gaps — the gaps stated as a number, which is
    // the whole point: a shortlist built here should not rest on invisible holes.
    expect(within(row as HTMLElement).getByText(/2 importado/)).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText(/3 ausente/)).toBeInTheDocument();
  });

  it("says a material has nothing recorded instead of leaving the cell empty", async () => {
    const { table } = await renderCatalog();

    const row = within(table).getByShadowRole("link", { name: "Liga experimental" }).closest("tr");
    expect(within(row as HTMLElement).getByText(t.noValues)).toBeInTheDocument();
  });


  it("filters by data quality, not only by name", async () => {
    const { table } = await renderCatalog();

    await pick(t.filterQuality, t.qualityWithGaps);

    await waitFor(() => {
      expect(within(table).queryByShadowRole("link", { name: /Aço 1020/ })).not.toBeInTheDocument();
    });
    expect(within(table).getByShadowRole("link", { name: /Alumina/ })).toBeInTheDocument();
    expect(screen.getByShadowRole("heading", { name: t.count(1) })).toBeInTheDocument();
    // The chip asked the server; the screen filtered nothing itself (D-217).
    expect(searchSpy.calls.at(-1)).toMatchObject({ qualidade: "gaps", offset: 0 });
    expect(window.location.search).toContain("qualidade=gaps");
  });

  it("offers a way out when the filters leave nothing on screen", async () => {
    const { user } = await renderCatalog();

    await pick(t.filterClass, "Cerâmicas");
    await pick(t.filterQuality, t.qualityMeasured);

    // D-78: EmptyState's title now renders inside `.msds-state-title` (a
    // `<div>`, delegated to MSDS), so `.closest("div")` from the title text
    // would return that inner div alone instead of the whole state — the
    // action button lives as a sibling of the title's parent, inside
    // `.msds-state`.
    const empty = (await screen.findByText(t.emptyFiltered)).closest(".msds-state");
    expect(empty).not.toBeNull();
    // The empty state clears the filters rather than only apologising — the
    // button inside it, not the "Limpar" of the filter bar above.
    await user.click(within(empty as HTMLElement).getByShadowRole("button", { name: t.clearFilters }));
    const table = await screen.findByShadowRole("table");
    expect(within(table).getByShadowRole("link", { name: /Aço 1020/ })).toBeInTheDocument();
  });

  it("carries the same materials into the card list a phone gets, alongside the table", async () => {
    await renderCatalog();

    // The card list has no accessible role of its own (a plain <ul>), so it's
    // reached as the sibling markup outside the table region.
    for (const material of materials) {
      expect(
        screen.getAllByShadowRole("link", { name: new RegExp(material.name) }).length,
      ).toBeGreaterThanOrEqual(2);
    }
    expect(screen.getAllByText(t.noValues).length).toBeGreaterThanOrEqual(2);
  });
});

function many(n: number): MaterialListItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    name: `Liga numerada ${String(i + 1).padStart(3, "0")}`,
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    is_demo: false,
    is_own_record: false,
    keywords: [],
    quality: { medido: 1, importado: 0, estimado: 0, missing: 0 },
    designations: [],
    sort_value: { property_slug: "densidade", value: 7800 + i, unit: "kg/m³", is_missing: false },
  }));
}

describe("páginas, contagens e ordem (D-217)", () => {
  beforeEach(() => {
    search.composition = null;
    search.reject = null;
    search.extra = [];
    searchSpy.calls = [];
    savedViews.list = [];
    window.history.replaceState(null, "", "/app/catalogo");
  });

  it("mostra uma página de 50 e anda para a próxima pela URL", async () => {
    search.extra = many(60);
    const { user, table } = await renderCatalog();

    // 63 materials, 50 rows: the phone no longer gets every card at once.
    expect(within(table).getAllByShadowRole("row")).toHaveLength(51);
    const nav = screen.getByShadowRole("navigation", { name: ptBR.ds.pagination });
    expect(within(nav).getByText(t.pageRange(1, 50, 63))).toBeInTheDocument();

    await user.click(within(nav).getByShadowRole("button", { name: ptBR.ds.nextPage }));
    await waitFor(() => expect(window.location.search).toContain("pagina=2"));
    await waitFor(() =>
      expect(within(screen.getByShadowRole("table")).getAllByShadowRole("row")).toHaveLength(14),
    );
    expect(searchSpy.calls.at(-1)).toMatchObject({ limit: 50, offset: 50 });
  });

  it("os chips dizem quantos materiais cada opção deixaria", async () => {
    const { user } = await renderCatalog();
    await user.click(screen.getByShadowRole("button", { name: new RegExp(`^${t.filterClass}: `) }));
    expect(
      await screen.findByShadowRole("button", { name: ptBR.ds.optionCount("Metais", 2) }),
    ).toBeInTheDocument();
    expect(screen.getByShadowRole("button", { name: ptBR.ds.optionCount("Cerâmicas", 1) })).toBeInTheDocument();
  });

  it("filtra por dado de demonstração", async () => {
    const { user, table } = await renderCatalog();
    // Not pinned: it joins the bar from "+ Filtro".
    await user.click(screen.getByShadowRole("button", { name: ptBR.ds.addFilterMenu }));
    await user.click(await screen.findByShadowRole("button", { name: t.filterDemo }));
    await pick(t.filterDemo, t.demoNone);
    await waitFor(() =>
      expect(within(table).queryByShadowRole("link", { name: /Aço 1020/ })).not.toBeInTheDocument(),
    );
    expect(within(table).getByShadowRole("link", { name: "Liga experimental" })).toBeInTheDocument();
    expect(window.location.search).toContain("demo=nao");
  });

  it("ordena pelo valor de uma propriedade e mostra a coluna, ausência escrita", async () => {
    const { user } = await renderCatalog();
    await user.selectOptions(screen.getByShadowRole("combobox", { name: t.orderLabel }), "densidade");

    await waitFor(() => expect(searchSpy.calls.at(-1)).toMatchObject({ ordenar: "densidade" }));
    const table = screen.getByShadowRole("table");
    expect(await within(table).findByShadowRole("columnheader", { name: "Densidade" })).toBeInTheDocument();
    // The fixture rows carry no `sort_value`: the cell says so, never "0".
    expect(within(table).getAllByText(t.valueNotRegistered).length).toBe(3);
    // Properties nobody has a value for are not offered.
    expect(screen.queryByShadowRole("option", { name: "Sem uso" })).toBeNull();
  });

  it("as colunas da tabela se escolhem e ficam na URL", async () => {
    const { user, table } = await renderCatalog();
    expect(within(table).getByShadowRole("columnheader", { name: t.columnKeywords })).toBeInTheDocument();
    await user.click(screen.getByShadowRole("button", { name: t.columnsMenu }));
    await user.click(await screen.findByShadowRole("checkbox", { name: t.columnKeywords }));
    await waitFor(() =>
      expect(within(screen.getByShadowRole("table")).queryByShadowRole("columnheader", { name: t.columnKeywords })).toBeNull(),
    );
    expect(window.location.search).toContain("colunas=");
  });

  it("abre a partir de um link com a busca, o filtro e a página na URL", async () => {
    window.history.replaceState(null, "", "/app/catalogo?classe=ceramicas&busca=refrat");
    render(wrap(<CatalogPage />));
    const table = await screen.findByShadowRole("table");
    expect(within(table).getByShadowRole("link", { name: /Alumina/ })).toBeInTheDocument();
    expect(screen.getByShadowRole("searchbox", { name: t.searchLabel })).toHaveValue("refrat");
    expect(searchSpy.calls.at(-1)).toMatchObject({ classe: "ceramicas", q: "refrat" });
  });

  it("não tem violação de acessibilidade com a paginação", async () => {
    search.extra = many(60);
    const { container } = render(wrap(<CatalogPage />));
    await screen.findByShadowRole("table");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
    // A page of 50 rows (table and cards): axe needs more than the default 5 s
    // when the whole suite shares the machine.
  }, 30_000);
});

describe("lista e detalhe (D-184)", () => {
  beforeEach(() => {
    savedViews.list = [];
    search.extra = [];
    window.history.replaceState(null, "", "/app/catalogo");
  });

  function widthOfBlocks(width: number) {
    return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width,
      height: 600,
      top: 0,
      left: 0,
      right: width,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }

  it("em bloco largo, o nome abre a ficha ao lado, sem sair da lista", async () => {
    const spy = widthOfBlocks(1100);
    const { user, table } = await renderCatalog();

    await user.click(within(table).getByShadowRole("link", { name: /Aço 1020/ }));
    const pane = await screen.findByShadowRole("region", { name: t.preview.region });
    expect(within(pane).getByShadowRole("heading", { name: "Aço 1020" })).toBeInTheDocument();
    expect(within(pane).getByShadowRole("link", { name: t.preview.openFull })).toHaveAttribute(
      "href",
      "/app/materiais/1",
    );
    // "Abrir ficha completa" grows the sheet out of the pane (D-148).
    expect(
      within(pane).getByShadowRole("link", { name: t.preview.openFull }).closest("[data-container-origin]"),
    ).not.toBeNull();
    // The row of the material on display says so.
    const compactTable = screen.getByShadowRole("table");
    expect(within(compactTable).getByShadowRole("link", { name: /Aço 1020/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    // Beside the pane the table drops the keywords column; the sheet has them.
    expect(within(compactTable).queryByShadowRole("columnheader", { name: t.columnKeywords })).toBeNull();
    spy.mockRestore();
  });

  it("fechar a ficha devolve a tabela inteira", async () => {
    const spy = widthOfBlocks(1100);
    const { user, table } = await renderCatalog();
    await user.click(within(table).getByShadowRole("link", { name: /Alumina/ }));
    await user.click(await screen.findByShadowRole("button", { name: t.preview.close }));

    expect(screen.queryByShadowRole("region", { name: t.preview.region })).toBeNull();
    expect(screen.getByShadowRole("columnheader", { name: t.columnKeywords })).toBeInTheDocument();
    spy.mockRestore();
  });

  it("em bloco estreito o nome continua sendo só um link para a página inteira", async () => {
    const spy = widthOfBlocks(500);
    const { user, table } = await renderCatalog();
    const link = within(table).getByShadowRole("link", { name: /Aço 1020/ });
    expect(link).toHaveAttribute("href", "/app/materiais/1");

    await user.click(link);
    expect(screen.queryByShadowRole("region", { name: t.preview.region })).toBeNull();
    spy.mockRestore();
  });

  it("a barra de ação dos marcados flutua e diz quantos são", async () => {
    const { user, table } = await renderCatalog();
    await user.click(within(table).getByShadowRole("checkbox", { name: t.selectRow("Aço 1020") }));

    const bar = screen.getByShadowRole("region", { name: t.selectionBar });
    expect(bar).toHaveClass("m3-floating-toolbar");
    expect(within(bar).getByShadowRole("status")).toHaveTextContent(t.selectedCount(1));
  });

  // D-209: the reader's saved views are tabs above the list.
  it("applies a saved view's filters and kind when its tab is chosen", async () => {
    savedViews.list = [
      {
        id: 7,
        scope: "catalogo",
        name: "Cerâmicas em lista",
        kind: "list",
        config: { filters: { classe: "ceramicas" } },
        position: 0,
        created_at: "",
        updated_at: "",
      },
    ];
    const { user } = await renderCatalog();
    const views = screen.getByShadowRole("group", { name: ptBR.ds.views });
    await user.click(within(views).getByShadowRole("button", { name: /Cerâmicas em lista/ }));

    // The "Lista" view: rows of links, no table; only the ceramic stays.
    await waitFor(() => expect(screen.queryByShadowRole("table")).not.toBeInTheDocument());
    expect(screen.getByShadowRole("link", { name: /Alumina/ })).toBeInTheDocument();
    expect(screen.queryByShadowRole("link", { name: /Aço 1020/ })).not.toBeInTheDocument();
    expect(
      screen.getByShadowRole("button", { name: ptBR.ds.filterChip(t.filterClass, "Cerâmicas") }),
    ).toBeInTheDocument();

    // "Todos" goes back to the whole table.
    await user.click(within(views).getByShadowRole("button", { name: ptBR.ds.allView }));
    expect(await screen.findByShadowRole("table")).toBeInTheDocument();
  });

  it("offers to save the filters into the active view once they change", async () => {
    savedViews.list = [
      {
        id: 8,
        scope: "catalogo",
        name: "Metais",
        kind: "table",
        config: { filters: { classe: "metais" } },
        position: 0,
        created_at: "",
        updated_at: "",
      },
    ];
    const { user } = await renderCatalog();
    const views = screen.getByShadowRole("group", { name: ptBR.ds.views });
    await user.click(within(views).getByShadowRole("button", { name: /^Metais/ }));
    expect(screen.queryByShadowRole("button", { name: ptBR.ds.saveChanges })).not.toBeInTheDocument();
    await pick(t.filterQuality, t.qualityMeasured);
    expect(screen.getByShadowRole("button", { name: ptBR.ds.saveChanges })).toBeInTheDocument();
  });
});
