import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import type { Process, ProcessClass } from "@/lib/types";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";

const t = ptBR.processes;

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/processos",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const cls = (id: number, slug: string, name: string, parent_id: number | null): ProcessClass => ({
  id,
  slug,
  name,
  parent_id,
  description: null,
  process_count: 0,
});

/**
 * "Conformação" with three sub-families and 21 processes (over the limit of 12 where the card
 * starts to group), "União" with two (under it, so it stays a plain list). One process is filed
 * directly at the root, and one two levels down, to prove both land in a group.
 */
const classes: ProcessClass[] = [
  cls(1, "conformacao", "Conformação", null),
  cls(2, "usinagem", "Usinagem", 1),
  cls(3, "fundicao", "Fundição", 1),
  cls(4, "fundicao-areia", "Fundição em areia", 3),
  cls(5, "forjamento", "Forjamento", 1),
  cls(6, "uniao", "União", null),
  cls(7, "solda", "Solda", 6),
];

let nextId = 100;
const proc = (name: string, klass: ProcessClass, material_count: number): Process => ({
  id: nextId++,
  name,
  slug: name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-"),
  class_id: klass.id,
  class_name: klass.name,
  class_slug: klass.slug,
  description: null,
  is_demo: true,
  material_count,
});
const [conf, usin, fund, areia, forj, uni, sold] = classes as [
  ProcessClass,
  ProcessClass,
  ProcessClass,
  ProcessClass,
  ProcessClass,
  ProcessClass,
  ProcessClass,
];
const processes: Process[] = [
  ...["Torneamento", "Fresamento", "Furação", "Retífica", "Brochamento", "Aplainamento", "Serramento"].map(
    (n, i) => proc(n, usin, i),
  ),
  ...["Fundição sob pressão", "Fundição por cera perdida", "Fundição em coquilha"].map((n, i) => proc(n, fund, 10 + i)),
  ...["Areia verde", "Areia furan", "Shell molding", "Cura a frio"].map((n, i) => proc(n, areia, 20 + i)),
  ...["Forjamento a quente", "Forjamento a frio", "Estampagem", "Cunhagem", "Recalque"].map((n, i) =>
    proc(n, forj, 30 + i),
  ),
  proc("Conformação genérica", conf, 0),
  proc("Solda MIG", sold, 7),
  proc("Solda TIG", sold, 2),
  proc("Brasagem", uni, 5),
];

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: () => Promise.resolve(null),
  getProcessMatrix: () => Promise.resolve({ columns: [], rows: [], without_data: {} }),
  listProcesses: () => Promise.resolve(processes),
  listProcessClasses: () => Promise.resolve(classes),
  getMyRecords: () => Promise.resolve({ favorites: [], recents: [], own_records: [] }),
}));

const { default: ProcessesPage } = await import("./page");

function setup(search = "") {
  window.history.replaceState(null, "", `/app/processos${search}`);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <ProcessesPage />
      </QueryClientProvider>,
    ),
  };
}

beforeEach(() => window.history.replaceState(null, "", "/app/processos"));

/** The section heads of the Conformação card, as the reader sees them: name and count. */
function sectionHeads(): string[] {
  return [...document.querySelectorAll("details > summary")].map((n) =>
    (n.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}
const sections = () => [...document.querySelectorAll("details")] as HTMLDetailsElement[];

describe("Processos — a família grande agrupa por subfamília (D-254)", () => {
  it("o cartão com mais de 12 processos mostra uma seção por subfamília, com nome e contagem", async () => {
    setup();
    await screen.findByShadowRole("group", { name: t.groupsRegion("Conformação") });
    // By name without accents, a process filed two levels down rolls up into its sub-family
    // ("Areia verde" is under "Fundição em areia" → "Fundição"), and what is filed at the root
    // itself comes last.
    expect(sectionHeads()).toEqual([
      "Forjamento 5 processos",
      "Fundição 7 processos",
      "Usinagem 7 processos",
      `${t.groupDirect} 1 processo`,
    ]);
  });

  it("a família pequena continua uma lista simples, sem seções", async () => {
    setup();
    await screen.findByShadowRole("group", { name: t.groupsRegion("Conformação") });
    expect(screen.queryByShadowRole("group", { name: t.groupsRegion("União") })).not.toBeInTheDocument();
    expect(screen.getByShadowRole("link", { name: "Brasagem" })).toBeInTheDocument();
    expect(screen.getByShadowRole("link", { name: "Solda MIG" })).toBeInTheDocument();
  });

  it("as seções nascem fechadas e cada uma abre e fecha sozinha", async () => {
    const { user } = setup();
    await screen.findByShadowRole("group", { name: t.groupsRegion("Conformação") });
    expect(sections().map((d) => d.open)).toEqual([false, false, false, false]);

    await user.click(screen.getByShadowText("Usinagem"));
    expect(sections().map((d) => d.open)).toEqual([false, false, true, false]);
    expect(await screen.findByShadowRole("link", { name: "Torneamento" })).toBeInTheDocument();

    await user.click(screen.getByShadowText("Usinagem"));
    expect(sections().map((d) => d.open)).toEqual([false, false, false, false]);
  });

  it("abre e recolhe todas de uma vez, e o botão diz o que fará", async () => {
    const { user } = setup();
    await screen.findByShadowRole("group", { name: t.groupsRegion("Conformação") });
    await user.click(screen.getByShadowRole("button", { name: t.groupsOpenAll }));
    expect(sections().map((d) => d.open)).toEqual([true, true, true, true]);
    await user.click(screen.getByShadowRole("button", { name: t.groupsCloseAll }));
    expect(sections().map((d) => d.open)).toEqual([false, false, false, false]);
  });

  it("uma busca que deixa poucos processos desfaz o agrupamento", async () => {
    setup("?busca=fundi");
    // 7 matches in the family, under the limit of 12: a plain list, no sections.
    expect(await screen.findByShadowRole("link", { name: "Fundição sob pressão" })).toBeInTheDocument();
    expect(sections()).toHaveLength(0);
  });

  it("filtrado e ainda grande, as seções começam abertas; o botão recolhe", async () => {
    // The family chip keeps all 20 and is a filter: what the reader asked for is shown open.
    const { user } = setup("?familia=conformacao");
    await screen.findByShadowRole("group", { name: t.groupsRegion("Conformação") });
    expect(sections().map((d) => d.open)).toEqual([true, true, true, true]);
    await user.click(screen.getByShadowRole("button", { name: t.groupsCloseAll }));
    expect(sections().map((d) => d.open)).toEqual([false, false, false, false]);
  });

  it("marcar para comparar dentro de uma seção aparece na cabeça dela, mesmo fechada", async () => {
    const { user } = setup();
    await screen.findByShadowRole("group", { name: t.groupsRegion("Conformação") });
    await user.click(screen.getByShadowText("Forjamento"));
    await user.click(await screen.findByShadowLabelText(t.compareRow("Estampagem")));
    await user.click(screen.getByShadowText("Forjamento"));
    expect(sections()[0]!.open).toBe(false);
    expect(sectionHeads()[0]).toBe("Forjamento 5 processos · 1 marcado");
    expect(window.location.search).toContain("comparar=estampagem");
  });

  it("o cartão agrupado não tem violações de acessibilidade", async () => {
    const { user } = setup();
    await screen.findByShadowRole("group", { name: t.groupsRegion("Conformação") });
    await user.click(screen.getByShadowRole("button", { name: t.groupsOpenAll }));
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("Processos — a tabela ordena pelo cabeçalho (D-254)", () => {
  const rowNames = () =>
    screen
      .getAllByShadowRole("row")
      .slice(1)
      .map((row) => within(row).getByShadowRole("rowheader").textContent?.trim());

  it("cada coluna tem aria-sort e a tabela nasce na ordem do servidor", async () => {
    setup("?visao=table");
    await screen.findByShadowRole("columnheader", { name: t.columnProcess });
    for (const col of [t.columnProcess, t.columnFamily, t.columnClass, t.columnMaterials]) {
      expect(screen.getByShadowRole("columnheader", { name: col })).toHaveAttribute("aria-sort", "none");
    }
    expect(rowNames().slice(0, 3)).toEqual(["Torneamento", "Fresamento", "Furação"]);
  });

  it("o nome ordena sem acento e a segunda volta devolve a ordem de chegada", async () => {
    const { user } = setup("?visao=table");
    const head = await screen.findByShadowRole("columnheader", { name: t.columnProcess });
    await user.click(within(head).getByShadowRole("button"));
    expect(rowNames().slice(0, 4)).toEqual(["Aplainamento", "Areia furan", "Areia verde", "Brasagem"]);
    expect(head).toHaveAttribute("aria-sort", "ascending");
    await user.click(within(head).getByShadowRole("button"));
    expect(rowNames()[0]).toBe("Torneamento");
    expect(head).toHaveAttribute("aria-sort", "descending");
    await user.click(within(head).getByShadowRole("button"));
    expect(head).toHaveAttribute("aria-sort", "none");
    expect(rowNames()[0]).toBe("Torneamento");
  });

  it("materiais ordena como número (9 antes de 10) e escolher outra coluna zera a anterior", async () => {
    const { user } = setup("?visao=table");
    const materials = await screen.findByShadowRole("columnheader", { name: t.columnMaterials });
    await user.click(within(materials).getByShadowRole("button"));
    expect(rowNames().slice(0, 3)).toEqual(["Torneamento", "Conformação genérica", "Fresamento"]);
    await user.click(within(materials).getByShadowRole("button"));
    // Descending: 34 (Recalque) first.
    expect(rowNames()[0]).toBe("Recalque");
    const name = screen.getByShadowRole("columnheader", { name: t.columnProcess });
    await user.click(within(name).getByShadowRole("button"));
    expect(materials).toHaveAttribute("aria-sort", "none");
    expect(name).toHaveAttribute("aria-sort", "ascending");
  });

  it("o cabeçalho ordena pelo teclado e a seleção para comparar continua valendo", async () => {
    const { user } = setup("?visao=table");
    const head = await screen.findByShadowRole("columnheader", { name: t.columnClass });
    within(head).getByShadowRole("button").focus();
    await user.keyboard("{Enter}");
    expect(head).toHaveAttribute("aria-sort", "ascending");
    await user.click(screen.getByShadowLabelText(t.compareRow("Brasagem")));
    expect(window.location.search).toContain("comparar=brasagem");
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
