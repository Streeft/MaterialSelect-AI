import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import {
  demoR1,
  newItem,
  polymerItem,
  releaseDiff,
  releaseList,
  undeclaredRelease,
} from "@/components/catalog/releaseFixtures";

const t = ptBR.releases;

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/app/catalogo/releases",
}));

const api = vi.hoisted(() => ({
  listCatalogReleases: vi.fn(),
  getReleaseDiff: vi.fn(),
  getReleaseDiffRecord: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    releaseDiffExportUrl: actual.releaseDiffExportUrl,
    listCatalogReleases: api.listCatalogReleases,
    getReleaseDiff: api.getReleaseDiff,
    getReleaseDiffRecord: api.getReleaseDiffRecord,
  };
});

const { default: ReleaseChangesPage } = await import("./page");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReleaseChangesPage />
    </QueryClientProvider>,
  );
}

function rejection(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

beforeEach(() => {
  nav.query = "";
  nav.replace.mockReset();
  for (const fn of Object.values(api)) fn.mockReset();
  api.listCatalogReleases.mockResolvedValue(releaseList);
  api.getReleaseDiff.mockResolvedValue(releaseDiff);
});

describe("Mudanças entre releases (D-108)", () => {
  it("says it is loading, then that it failed, with a retry", async () => {
    api.listCatalogReleases.mockReturnValue(new Promise(() => {}));
    const { unmount } = mount();
    expect(screen.getByText(t.loading)).toBeInTheDocument();
    unmount();

    api.listCatalogReleases.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByText(t.error)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar/i })).toBeInTheDocument();
  });

  it("says, in words, that there are not two releases to compare", async () => {
    api.listCatalogReleases.mockResolvedValue([demoR1, undeclaredRelease]);
    mount();
    expect(await screen.findByText(t.noPair)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(t.noPairHint.slice(0, 40)))).toBeInTheDocument();
    expect(screen.getByText(/não declara a qual catálogo pertence/)).toBeInTheDocument();
    expect(api.getReleaseDiff).not.toHaveBeenCalled();
  });

  it("opens the latest release against its predecessor, and counts every kind", async () => {
    mount();
    expect(await screen.findByText(t.listTitle(6))).toBeInTheDocument();
    expect(api.getReleaseDiff).toHaveBeenCalledWith("catalogo-demo-r1", "catalogo-demo-r2", {
      tipo: undefined,
      classe: undefined,
      pagina: 1,
      porPagina: 25,
    });
    const summary = screen.getByRole("list", { name: t.summaryAria });
    const counts = Object.fromEntries(
      within(summary)
        .getAllByRole("listitem")
        .map((li) => [li.getAttribute("data-status"), li.textContent ?? ""]),
    );
    expect(counts.alterado).toMatch(/3/);
    expect(counts.novo).toMatch(/1/);
    expect(counts.desativado).toMatch(/1/);
    expect(counts.inalterado).toMatch(/1/);
    // The fictitious releases say so.
    expect(screen.getByText(t.demoNotice)).toBeInTheDocument();
    // Both releases are described, not just named by slug.
    expect(screen.getByRole("table", { name: t.metaCaption })).toBeInTheDocument();
  });

  it("offers only comparable partners for the target and puts the pair in the URL", async () => {
    mount();
    const target = (await screen.findByLabelText(t.target)) as HTMLSelectElement;
    expect(Array.from(target.options).map((o) => o.value)).toEqual(["catalogo-demo-r2"]);
    await userEvent.click(screen.getByRole("button", { name: t.swap }));
    expect(nav.replace).toHaveBeenCalledWith(
      "/app/catalogo/releases?base=catalogo-demo-r2&alvo=catalogo-demo-r1",
      { scroll: false },
    );
  });

  it("reads the releases, filters and page from the URL and asks the backend for them", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tipo=alterado&classe=metais&pagina=2";
    mount();
    await waitFor(() =>
      expect(api.getReleaseDiff).toHaveBeenCalledWith("catalogo-demo-r1", "catalogo-demo-r2", {
        tipo: "alterado",
        classe: "metais",
        pagina: 2,
        porPagina: 25,
      }),
    );
  });

  it("puts a filter in the URL and drops the page and the open record", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&pagina=2&tabela=MaterialUniverse&registro=demo-002";
    mount();
    await userEvent.selectOptions(await screen.findByLabelText(t.filterStatus), "novo");
    expect(nav.replace).toHaveBeenCalledWith(
      "/app/catalogo/releases?base=catalogo-demo-r1&alvo=catalogo-demo-r2&tipo=novo",
      { scroll: false },
    );
    await userEvent.selectOptions(screen.getByLabelText(t.filterClass), "metais");
    expect(nav.replace).toHaveBeenLastCalledWith(
      expect.stringContaining("classe=metais"),
      { scroll: false },
    );
  });

  it("lists every record with its situation, and says what each one is", async () => {
    mount();
    const table = await screen.findByRole("table", { name: t.listCaption });
    const statuses = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.getAttribute("data-status"));
    expect(statuses).toEqual(["alterado", "alterado", "alterado", "novo", "desativado", "inalterado"]);
    expect(within(table).getByText(t.onlyInTarget)).toBeInTheDocument();
    expect(within(table).getByText(t.onlyInBase)).toBeInTheDocument();
    expect(within(table).getByText(t.noChanges)).toBeInTheDocument();
    expect(within(table).getAllByText(t.changesCount(2))).toHaveLength(2);
    expect(within(table).getByText(t.renamedFrom("Liga Demo de Cobre"))).toBeInTheDocument();
  });

  it("opens a record in the URL by its external identity, never its name", async () => {
    mount();
    await userEvent.click(await screen.findByRole("button", { name: t.openAria("Aço Demo Inoxidável") }));
    expect(nav.replace).toHaveBeenCalledWith(
      "/app/catalogo/releases?tabela=MaterialUniverse&registro=demo-002",
      { scroll: false },
    );
  });

  it("shows each changed field before and after, a value change apart from a rewriting", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tabela=MaterialUniverse&registro=demo-002";
    mount();
    const detail = await screen.findByRole("table", { name: t.changesCaption("Aço Demo Inoxidável") });
    const density = within(detail).getByRole("row", { name: /Densidade/ });
    expect(density.getAttribute("data-change-kind")).toBe("valor");
    expect(density).toHaveTextContent("7,85 g/cm³");
    expect(density).toHaveTextContent("7,9 g/cm³");
    // The source's own writing comes with its unit.
    expect(density).toHaveTextContent("Fonte: 7.850 kg/m³");
    expect(density).toHaveTextContent("Passou de 7,85 g/cm³ para 7,9 g/cm³.");

    const young = within(detail).getByRole("row", { name: /Módulo de Young/ });
    expect(young.getAttribute("data-change-kind")).toBe("escrita_da_fonte");
    expect(young).toHaveTextContent(t.sourceWritingHint);
    expect(young).toHaveTextContent("Fonte: 200.000 MPa");
    // Two kinds, two tags: the rewriting is never labelled as a change of value.
    expect(within(density).getByText(t.kindTags.valor!)).toBeInTheDocument();
    expect(within(young).getByText(t.kindTags.escrita_da_fonte!)).toBeInTheDocument();
    expect(within(young).queryByText(t.kindTags.valor!)).toBeNull();
    // The record is found in the list: no extra request.
    expect(api.getReleaseDiffRecord).not.toHaveBeenCalled();
  });

  it("writes absence to value and non-registered to value in words, never a 0 or a dash", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tabela=MaterialUniverse&registro=demo-003";
    mount();
    const detail = await screen.findByRole("table", { name: t.changesCaption("Polímero Demo Técnico") });
    const conductivity = within(detail).getByRole("row", { name: /Condutividade térmica/ });
    expect(conductivity).toHaveTextContent("declarado ausente pela fonte");
    expect(conductivity).toHaveTextContent("0,25 W/(m·K)");
    expect(conductivity).toHaveTextContent("Passou de declarado ausente pela fonte para 0,25 W/(m·K).");
    const unregistered = within(detail).getByRole("row", { name: /Temperatura máxima/ });
    expect(unregistered).toHaveTextContent("não cadastrado nesta release");
    expect(unregistered).toHaveTextContent("110 °C");
    for (const row of [conductivity, unregistered]) {
      for (const cell of within(row).getAllByRole("cell")) {
        expect(cell.textContent?.trim()).not.toBe("");
        expect(cell.textContent?.trim()).not.toBe("0");
        expect(cell.textContent?.trim()).not.toBe("—");
      }
    }
  });

  it("writes a renamed record's text fields, and 'not in this release' for a missing side", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tabela=MaterialUniverse&registro=demo-005";
    const { unmount } = mount();
    const rename = await screen.findByRole("table", { name: t.changesCaption("Liga Demo de Cobre (revisada)") });
    expect(within(rename).getByRole("row", { name: /Nome/ })).toHaveTextContent(
      "Liga Demo de Cobre (revisada)",
    );
    unmount();

    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tabela=MaterialUniverse&registro=demo-006";
    mount();
    const region = await screen.findByRole("region", { name: "Compósito Demo Laminado" });
    expect(within(region).getByText(t.notInRelease)).toBeInTheDocument();
    expect(within(region).getByText(t.noChangesInRecord)).toBeInTheDocument();
  });

  it("opens a record that is not on the page through the identity route", async () => {
    nav.query =
      "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tabela=MaterialUniverse&registro=demo-003";
    api.getReleaseDiff.mockResolvedValue({
      ...releaseDiff,
      items: [newItem],
      filtered_total: 1,
      page_count: 2,
    });
    api.getReleaseDiffRecord.mockResolvedValue(polymerItem);
    mount();
    expect(
      await screen.findByRole("table", { name: t.changesCaption("Polímero Demo Técnico") }),
    ).toBeInTheDocument();
    expect(api.getReleaseDiffRecord).toHaveBeenCalledWith(
      "catalogo-demo-r1",
      "catalogo-demo-r2",
      "MaterialUniverse",
      "demo-003",
    );
  });

  it("says a record in neither release is not there", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tabela=MaterialUniverse&registro=nada";
    api.getReleaseDiffRecord.mockRejectedValue(rejection("Registro não encontrado.", 404));
    mount();
    expect(await screen.findByText(t.detailNotFound)).toBeInTheDocument();
  });

  it("says the filter left nothing, with a way back", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tipo=novo";
    api.getReleaseDiff.mockResolvedValue({
      ...releaseDiff,
      items: [],
      filtered_total: 0,
      filters: { tipo: "novo", classe: null },
    });
    mount();
    expect(await screen.findByText(t.emptyFiltered)).toBeInTheDocument();
    const clear = screen.getAllByRole("button", { name: t.clearFilters });
    await userEvent.click(clear[clear.length - 1]!);
    expect(nav.replace).toHaveBeenCalledWith(
      "/app/catalogo/releases?base=catalogo-demo-r1&alvo=catalogo-demo-r2",
      { scroll: false },
    );
  });

  it("says two releases with no records have nothing to compare", async () => {
    api.getReleaseDiff.mockResolvedValue({
      ...releaseDiff,
      items: [],
      total: 0,
      filtered_total: 0,
      counts: releaseDiff.counts.map((c) => ({ ...c, count: 0 })),
    });
    mount();
    expect(await screen.findByText(t.empty)).toBeInTheDocument();
  });

  it("shows the backend's refusal in Portuguese and clears a stale choice on retry", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&pagina=3";
    api.getReleaseDiff.mockRejectedValue(
      rejection("A página 3 não existe: o resultado tem 2 páginas.", 400),
    );
    mount();
    expect(await screen.findByText(/A página 3 não existe/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /tentar/i }));
    expect(nav.replace).toHaveBeenCalledWith(
      "/app/catalogo/releases?base=catalogo-demo-r1&alvo=catalogo-demo-r2",
      { scroll: false },
    );
  });

  it("paginates by the backend's own page count", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2";
    api.getReleaseDiff.mockResolvedValue({ ...releaseDiff, page: 1, page_count: 3 });
    mount();
    expect(await screen.findByText(t.pageOf(1, 3))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.previousPage })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: t.nextPage }));
    expect(nav.replace).toHaveBeenCalledWith(
      "/app/catalogo/releases?base=catalogo-demo-r1&alvo=catalogo-demo-r2&pagina=2",
      { scroll: false },
    );
  });

  it("offers CSV and XLSX in one Exportar menu, carrying the filters and not the page", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tipo=alterado&classe=metais&pagina=1";
    mount();
    await userEvent.click(await screen.findByRole("button", { name: t.exportMenu }));
    const csv = screen.getByRole("menuitem", { name: new RegExp(t.exportCsv.replace(/[()]/g, "\\$&")) });
    expect(csv.getAttribute("href")).toMatch(
      /\/api\/exports\/catalogo\/releases\/catalogo-demo-r1\/diff\/catalogo-demo-r2\.csv\?tipo=alterado&classe=metais$/,
    );
    const xlsx = screen.getByRole("menuitem", { name: new RegExp(t.exportXlsx.replace(/[()]/g, "\\$&")) });
    expect(xlsx.getAttribute("href")).toMatch(/\.xlsx\?tipo=alterado&classe=metais$/);
  });

  it("has one Exportar button and no primary button", async () => {
    const { container } = mount();
    await screen.findByText(t.listTitle(6));
    expect(screen.getAllByRole("button", { name: t.exportMenu })).toHaveLength(1);
    expect(container.querySelectorAll(".msds-btn-primary")).toHaveLength(0);
  });

  it("passes axe with the comparison and one record open", async () => {
    nav.query = "base=catalogo-demo-r1&alvo=catalogo-demo-r2&tabela=MaterialUniverse&registro=demo-002";
    const { container } = mount();
    await screen.findByRole("table", { name: t.changesCaption("Aço Demo Inoxidável") });
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
