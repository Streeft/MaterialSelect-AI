import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { errorsText } from "@/lib/i18n-errors";
import { fichaText } from "@/lib/i18n-ficha";
import { flowText } from "@/lib/i18n-flow";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { MaterialDetail, PropertyValueOut } from "@/lib/types";

/*
 * D-214: the sheet was over 7.000 px with ~40 "Ler em…" selectors, the similar
 * panel and every section open. It now opens on what is read first: a header
 * with one primary action and a "⋯" menu, a summary of what hangs off the
 * material (processes, similar), a side outline, and the long blocks folded.
 */

const nav = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/app/materiais/5",
}));

function row(slug: string, name: string): PropertyValueOut {
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
    original_unit: "Pa",
    normalized_value: 1,
    canonical_unit: "Pa",
    conversion_method: null,
    display_unit: "GPa",
    display_value: 1,
    display_min: null,
    display_max: null,
    display_typical: null,
    display_uncertainty: null,
    uncertainty: null,
    measurement_condition: null,
    notes: null,
    data_quality: "MEDIDO",
    source_label: null,
  } as PropertyValueOut;
}

function detail(overrides: Partial<MaterialDetail> = {}): MaterialDetail {
  return {
    id: 5,
    name: "Liga X",
    class_id: 1,
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    description: null,
    is_demo: false,
    is_active: true,
    is_own_record: true,
    is_official: false,
    keywords: [],
    property_groups: [
      {
        category: "MECANICA",
        properties: [row("modulo_young", "Módulo de Young"), row("dureza", "Dureza")],
      },
    ],
    processes: [
      { slug: "forjamento", name: "Forjamento", class_name: "Conformação", description: null },
      { slug: "usinagem", name: "Usinagem", class_name: "Remoção", description: null },
    ],
    designations: [],
    composition: [],
    ...overrides,
  } as unknown as MaterialDetail;
}

const state = vi.hoisted(() => ({
  current: null as unknown,
  error: null as unknown,
  getChart: vi.fn(),
  deactivate: vi.fn(),
  canEdit: false,
}));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMaterial: () => (state.error ? Promise.reject(state.error) : Promise.resolve(state.current)),
  listProperties: () =>
    Promise.resolve([
      { slug: "modulo_young", name: "Módulo de Young", accepted_units: ["Pa", "MPa", "GPa"] },
      { slug: "dureza", name: "Dureza", accepted_units: ["HV", "HB"] },
    ]),
  getChart: (...args: unknown[]) => state.getChart(...args),
  deactivateMaterial: (id: number) => state.deactivate(id),
  listFamilyNotes: () => Promise.resolve([]),
}));
vi.mock("@/lib/billing", () => ({ useCanEditCatalog: () => state.canEdit }));
vi.mock("@/components/my-records/FavoriteButton", () => ({
  FavoriteButton: () => <button type="button">Favoritar</button>,
}));
vi.mock("@/components/my-records/useRecordVisit", () => ({ useRecordVisit: () => undefined }));
vi.mock("@/components/similar/SimilarPanel", () => ({
  SimilarPanel: () => <div>painel de parecidos montado</div>,
}));
vi.mock("@/components/PropertyChart", () => ({
  PropertyChart: () => <div>grafico montado</div>,
}));
vi.mock("@/components/CaeExportDialog", () => ({
  MaterialExportMenu: () => <button type="button">Exportar</button>,
}));
vi.mock("@/components/material/MaterialCurves", () => ({
  MaterialCurves: () => <div>curvas montadas</div>,
}));
vi.mock("@/components/material/MaterialOrdinals", () => ({
  MaterialOrdinals: () => <div>ordinais montados</div>,
}));
vi.mock("@/components/material/EquivalenceSection", () => ({
  EquivalenceSection: () => <div>equivalencias montadas</div>,
}));

const { default: MaterialPage } = await import("./page");
const { ApiError } = await import("@/lib/api");

const t = fichaText.layout;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MaterialPage />
    </QueryClientProvider>,
  );
}

async function loaded() {
  await screen.findByRole("heading", { level: 1, name: "Liga X" });
}

beforeEach(() => {
  nav.search = "";
  nav.push.mockReset();
  state.current = detail();
  state.error = null;
  state.canEdit = false;
  state.getChart = vi.fn(() => Promise.resolve({ points: [] }));
  state.deactivate = vi.fn(() => Promise.resolve());
  window.history.replaceState(null, "", "/app/materiais/5");
});

function detailsOf(id: string): HTMLDetailsElement {
  const section = document.getElementById(id);
  const details = section?.querySelector("details");
  if (!details) throw new Error(`section ${id} has no disclosure`);
  return details as HTMLDetailsElement;
}

describe("ficha: o que abre e o que fica dobrado (D-214)", () => {
  it("abre em propriedades e processos; semelhantes, equivalências, ordinais, curvas e mapa ficam dobrados", async () => {
    mount();
    await loaded();
    for (const id of ["semelhantes", "equivalencias", "ordinais", "curvas", "mapa"]) {
      expect(detailsOf(id).open, id).toBe(false);
    }
    for (const id of ["propriedades", "processos", "composicao", "designacoes"]) {
      expect(detailsOf(id).open, id).toBe(true);
    }
    expect(screen.getByRole("heading", { level: 2, name: ptBR.detail.properties })).toBeVisible();
    expect(screen.getByRole("link", { name: /Forjamento/ })).toBeInTheDocument();
  });

  it("o que está dobrado nem é montado: não pede dados que ninguém abriu", async () => {
    mount();
    await loaded();
    expect(screen.queryByText("painel de parecidos montado")).toBeNull();
    expect(screen.queryByText("curvas montadas")).toBeNull();
    expect(screen.queryByText("ordinais montados")).toBeNull();
    expect(screen.queryByText("equivalencias montadas")).toBeNull();
    expect(state.getChart).not.toHaveBeenCalled();
  });

  it("abrir uma seção monta o conteúdo e o mantém ao fechar de novo", async () => {
    const user = userEvent.setup();
    mount();
    await loaded();
    await user.click(
      within(document.getElementById("curvas")!).getByText(ptBR.curves.title),
    );
    expect(await screen.findByText("curvas montadas")).toBeInTheDocument();
    expect(detailsOf("curvas").open).toBe(true);
    await user.click(within(document.getElementById("curvas")!).getByText(ptBR.curves.title));
    expect(detailsOf("curvas").open).toBe(false);
    expect(screen.getByText("curvas montadas")).toBeInTheDocument();
  });

  it("o gráfico densidade × módulo só é pedido quando o leitor abre a seção do mapa", async () => {
    const user = userEvent.setup();
    mount();
    await loaded();
    expect(state.getChart).not.toHaveBeenCalled();
    await user.click(within(document.getElementById("mapa")!).getByText(ptBR.detail.position));
    expect(await screen.findByText("grafico montado")).toBeInTheDocument();
    expect(state.getChart).toHaveBeenCalledWith("densidade", "modulo_young");
  });

  it("os seletores 'Ler em…' ficam numa seção dobrada com a contagem, e abrem sozinhos se o link já escolheu unidade", async () => {
    mount();
    await loaded();
    const summary = await screen.findByText(t.unitsSummary(2));
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getAllByRole("combobox", { hidden: true })).toHaveLength(2);
  });

  it("com ?unidades= no link a seção de unidades já vem aberta", async () => {
    nav.search = "unidades=modulo_young:MPa";
    mount();
    await loaded();
    const summary = await screen.findByText(t.unitsSummary(2));
    expect((summary.closest("details") as HTMLDetailsElement).open).toBe(true);
  });
});

describe("ficha: sumário lateral e atalhos do topo (D-214)", () => {
  it("lista as seções com âncora e abre a dobrada ao ir até ela", async () => {
    const user = userEvent.setup();
    mount();
    await loaded();
    const outline = screen.getByRole("navigation", { name: t.outlineLabel });
    const links = within(outline).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#propriedades",
      "#processos",
      "#semelhantes",
      "#mapa",
      "#composicao",
      "#designacoes",
      "#equivalencias",
      "#ordinais",
      "#curvas",
    ]);
    await user.click(within(outline).getByRole("link", { name: ptBR.curves.title }));
    expect(detailsOf("curvas").open).toBe(true);
    expect(await screen.findByText("curvas montadas")).toBeInTheDocument();
  });

  it("um endereço com #curvas abre a seção", async () => {
    window.history.replaceState(null, "", "/app/materiais/5#curvas");
    mount();
    await loaded();
    await waitFor(() => expect(detailsOf("curvas").open).toBe(true));
  });

  it("o topo resume os processos e leva ao painel de parecidos sem rolar a ficha", async () => {
    const user = userEvent.setup();
    mount();
    await loaded();
    const quick = screen.getByRole("region", { name: t.quickLabel });
    expect(within(quick).getByText(t.processesSummary(2))).toBeInTheDocument();
    expect(within(quick).getByRole("link", { name: t.goToProcesses })).toHaveAttribute(
      "href",
      "#processos",
    );
    await user.click(within(quick).getByRole("link", { name: t.goToSimilar }));
    expect(detailsOf("semelhantes").open).toBe(true);
    expect(await screen.findByText("painel de parecidos montado")).toBeInTheDocument();
  });

  it("sem processos o resumo diz isso, sem inventar zero de compatibilidade", async () => {
    state.current = detail({ processes: [] });
    mount();
    await loaded();
    expect(within(screen.getByRole("region", { name: t.quickLabel })).getByText(t.processesNone)).toBeInTheDocument();
  });

  it("é acessível, com tudo dobrado e com tudo aberto", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await loaded();
    let violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
    const outline = screen.getByRole("navigation", { name: t.outlineLabel });
    for (const name of [ptBR.curves.title, ptBR.equivalences.title, fichaText.ordinals.title]) {
      await user.click(within(outline).getByRole("link", { name }));
    }
    violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("ficha: ações agrupadas (D-214)", () => {
  it("registro próprio: Editar é a ação primária; duplicar e desativar ficam no menu '⋯'", async () => {
    const user = userEvent.setup();
    mount();
    await loaded();
    expect(screen.getByRole("link", { name: ptBR.actions.edit })).toHaveAttribute(
      "href",
      "/app/materiais/5/editar",
    );
    expect(screen.queryByRole("button", { name: flowText.duplicate.button })).toBeNull();
    expect(screen.queryByRole("button", { name: ptBR.actions.deactivate })).toBeNull();

    await user.click(screen.getByRole("button", { name: ptBR.ui.moreActions }));
    // The entry's accessible name carries its hint line as well.
    expect(
      await screen.findByRole("menuitem", { name: new RegExp(flowText.duplicate.button) }),
    ).toBeVisible();
    expect(screen.getByRole("menuitem", { name: ptBR.actions.deactivate })).toBeVisible();
  });

  it("desativar pede confirmação no diálogo do sistema e só então chama a API", async () => {
    const user = userEvent.setup();
    mount();
    await loaded();
    await user.click(screen.getByRole("button", { name: ptBR.ui.moreActions }));
    await user.click(await screen.findByRole("menuitem", { name: ptBR.actions.deactivate }));
    expect(state.deactivate).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: ptBR.actions.deactivate }));
    await waitFor(() => expect(state.deactivate).toHaveBeenCalledWith(5));
  });

  it("registro oficial: a ação primária é a cópia própria e não há Editar nem Desativar", async () => {
    state.current = detail({ is_official: true, is_own_record: false });
    const user = userEvent.setup();
    mount();
    await loaded();
    expect(screen.getByRole("link", { name: ptBR.form.makeOwnCopy })).toHaveAttribute(
      "href",
      "/app/materiais/novo?copiar=5",
    );
    expect(screen.queryByRole("link", { name: ptBR.actions.edit })).toBeNull();
    await user.click(screen.getByRole("button", { name: ptBR.ui.moreActions }));
    expect(screen.queryByRole("menuitem", { name: ptBR.actions.deactivate })).toBeNull();
    expect(screen.getByText(ptBR.form.officialReadOnly)).toBeInTheDocument();
  });

  it("só leitura (registro compartilhado, sem permissão): sem Editar, sem menu de escrita", async () => {
    state.current = detail({ is_own_record: false });
    mount();
    await loaded();
    expect(screen.queryByRole("link", { name: ptBR.actions.edit })).toBeNull();
    expect(screen.queryByRole("button", { name: ptBR.actions.deactivate })).toBeNull();
    // The header's primary and the phone toolbar both point at the comparison.
    const compare = screen.getAllByRole("link", { name: ptBR.detail.compareThis });
    expect(compare.length).toBeGreaterThan(0);
    for (const link of compare) expect(link).toHaveAttribute("href", "/app/comparar?materiais=5");
  });
});

describe("ficha: não encontrada não é falha (D-200)", () => {
  it("404 diz que o material não existe, sem botão de tentar de novo", async () => {
    state.error = new ApiError("Material não encontrado", 404);
    mount();
    expect(await screen.findByText(errorsText.materialNotFound.title)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ptBR.ui.retry })).toBeNull();
  });

  it("falha de rede diz que não carregou e oferece tentar de novo", async () => {
    state.error = new TypeError("Failed to fetch");
    mount();
    expect(await screen.findByRole("button", { name: ptBR.ui.retry })).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    expect(screen.queryByText(errorsText.materialNotFound.title)).toBeNull();
  });
});
