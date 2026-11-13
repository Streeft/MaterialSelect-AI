import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, waitFor, within } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC roles live inside a
// shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { encodeUrlJson } from "@/lib/urlState";
import { suggestText } from "@/lib/i18n-suggest";
import { installWideViewport } from "@/lib/testing/viewport";
import type { LoadCase, SolveRequest, SolveResult, SuggestionsOut } from "@/lib/types";

const t = ptBR.solver;

const solveBrief = vi.fn<(payload: SolveRequest) => Promise<SolveResult>>();

const beam: LoadCase = {
  key: "viga-rigidez",
  label: "Viga em flexão, rigidez especificada",
  summary: "Viga que não pode fletir mais do que o projeto admite.",
  function_label: "Viga em flexão, rigidez especificada",
  constraint_label: "Rigidez à flexão S especificada",
  objective_label: "Minimizar massa",
  free_variable_label: "Área da seção A",
  fixed_labels: ["Comprimento L", "Rigidez S"],
  derivation: [
    "Objetivo: m = A · L · ρ.",
    "Restrição: S = C · E · I / L³.",
    "Isolando a variável livre: A = √(12 · S · L³ / (C · E)).",
    "Minimizar a massa é maximizar √E/ρ.",
  ],
  reference: "Ashby, Material Selection in Mechanical Design",
  index_slug: "viga-leve-rigidez",
  index_name: "Viga leve limitada por rigidez",
  index_expression: "sqrt(modulo_young) / densidade",
  index_goal: "maximize",
  cost_index_slug: "viga-leve-rigidez-custo",
  cost_index_name: "Viga barata limitada por rigidez",
  cost_index_expression: "sqrt(modulo_young) / (densidade * custo_massa)",
  cost_objective_label: "Minimizar custo de material",
  objective_unit: "kg",
  free_unit: "m**2",
  variables: [
    {
      key: "comprimento",
      label: "Comprimento",
      unit: "m",
      help_text: "Vão livre.",
      example: 1,
    },
    {
      key: "rigidez",
      label: "Rigidez exigida",
      unit: "N/m",
      help_text: "Força por deslocamento.",
      example: 100000,
    },
    {
      key: "constante_apoio",
      label: "Constante de apoio e carregamento",
      unit: "dimensionless",
      help_text: "Constante C da flecha.",
    },
  ],
  supports: [
    {
      key: "biapoiada-central",
      label: "Biapoiada, carga no meio do vão",
      variable_key: "constante_apoio",
      value: 48,
      note: null,
    },
  ],
};

const result: SolveResult = {
  case: beam,
  inputs: { comprimento: 0.8, rigidez: 200000, constante_apoio: 48 },
  objective: "massa",
  objective_label: "Minimizar massa",
  index_slug: "viga-leve-rigidez",
  index_name: "Viga leve limitada por rigidez",
  index_expression: "sqrt(modulo_young) / densidade",
  structural_factor: 1234.5,
  free_structural_factor: 12.3,
  objective_unit: "kg",
  free_unit: "m**2",
  objective_dimension: "[mass]",
  free_dimension: "[length] ** 2",
  objective_note: null,
  solved: [
    {
      record_id: 1,
      name: "Alumínio 6061",
      class_name: "Metais",
      class_slug: "metais",
      is_demo: false,
      is_own_record: false,
      rank: 1,
      index_value: 3070,
      objective_value: 0.402,
      free_value: 0.00018,
    },
  ],
  excluded: [
    {
      record_id: 2,
      name: "Polímero sem módulo",
      missing_slugs: ["modulo_young"],
      missing_labels: ["Módulo de Young"],
      reason: "Dados ausentes: modulo_young",
    },
  ],
};

// `PageHeader` reads the pathname to pick the route palette (D-49); without
// this it gets null and the header throws before anything is rendered.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/dimensionar",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const getDefaults = vi.fn(async () => (await import("@/lib/defaults.fixture")).defaultsFixture);

const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  getDefaults: () => getDefaults(),
  listLoadCases: () => Promise.resolve([beam]),
  solveBrief: (payload: SolveRequest) => solveBrief(payload),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: SolverPage } = await import("./page");

async function chooseBeam() {
  render(wrap(<SolverPage />));
  await screen.findByRole("heading", { name: t.title });
  await userEvent.selectOptions(
    await screen.findByShadowRole("combobox", { name: t.caseLabel }),
    "viga-rigidez",
  );
  await screen.findByRole("heading", { name: t.inputsStep });
}

beforeEach(() => {
  // The brief lives in the URL (D-212): each test starts at a clean address.
  window.history.replaceState(null, "", "/app/dimensionar");
  getDefaults.mockClear();
  solveBrief.mockReset();
  solveBrief.mockResolvedValue(result);
});

describe("Dimensionar", () => {
  it("abre com o primeiro caso já escolhido, como o seletor mostra", async () => {
    // O <select> exibe o primeiro caso; com o estado vazio a tela não
    // desenhava nada abaixo dele até o leitor trocar de caso e voltar.
    render(wrap(<SolverPage />));
    expect(
      await screen.findByRole("heading", { name: t.inputsStep }),
    ).toBeInTheDocument();
    expect(screen.getByShadowLabelText(/Comprimento/)).toBeInTheDocument();
  });


  it("põe o grupo da barra no sobrescrito, sem a tela precisar dizê-lo (D-205)", async () => {
    render(wrap(<SolverPage />));
    expect(await screen.findByText("estudar · dimensionar")).toBeInTheDocument();
  });

  it("mostra as facetas do fluxo função → restrição → objetivo", async () => {
    await chooseBeam();

    expect(screen.getByText(beam.constraint_label)).toBeInTheDocument();
    // A faceta do objetivo nomeia as duas leituras: a escolha é do leitor.
    expect(
      screen.getByText(/Minimizar massa ou minimizar custo de material/),
    ).toBeInTheDocument();
    expect(screen.getByText(beam.free_variable_label)).toBeInTheDocument();
  });

  it("mostra a expressão do índice como ela veio do catálogo", async () => {
    // Nunca reescrita na tela: duas cópias de uma fórmula viram duas respostas.
    await chooseBeam();

    expect(
      screen.getByText("sqrt(modulo_young) / densidade"),
    ).toBeInTheDocument();
    expect(screen.getByText(beam.index_name!)).toBeInTheDocument();
  });

  it("escreve a derivação inteira, para o número poder ser refeito à mão", async () => {
    await chooseBeam();

    for (const step of beam.derivation) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText(beam.reference)).toBeInTheDocument();
  });

  it("não pergunta nada ao servidor enquanto faltar um número de projeto", async () => {
    // O caso chega com a constante de apoio preenchida pela condição escolhida,
    // mas vão e rigidez não têm padrão nenhum — inventá-los seria a ferramenta
    // escrevendo o briefing.
    await chooseBeam();

    // D-86: the result card is already on screen and says which number is missing.
    expect(await screen.findByText(t.blockedVariable("Comprimento (m)"))).toBeInTheDocument();
    expect(screen.getByText(t.resultIdleTitle)).toBeInTheDocument();
    expect(screen.queryByShadowRole("button", { name: t.solve })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(solveBrief).not.toHaveBeenCalled();
  });

  it("o exemplo do caso só entra com o clique, e o resultado vem sozinho (D-220)", async () => {
    const user = userEvent.setup();
    await chooseBeam();
    // Nothing typed, nothing asked: the example is offered, never applied.
    expect(await screen.findByShadowLabelText(/Comprimento/)).toHaveValue(null);
    await user.click(await screen.findByShadowRole("button", { name: t.useExample }));
    expect(screen.getByShadowLabelText(/Comprimento/)).toHaveValue(1);
    expect(screen.getByShadowLabelText(/Rigidez exigida/)).toHaveValue(100000);
    await waitFor(() => expect(solveBrief).toHaveBeenCalledTimes(1));
    expect(solveBrief.mock.calls[0]![0]).toMatchObject({
      case_key: "viga-rigidez",
      inputs: { comprimento: 1, rigidez: 100000, constante_apoio: 48 },
      objective: "massa",
    });
    expect(await screen.findByRole("link", { name: "Alumínio 6061" })).toBeInTheDocument();
  });

  it("escreve a unidade dentro do campo, e ela continua no nome do campo (D-220)", async () => {
    await chooseBeam();
    expect(await screen.findByShadowRole("spinbutton", { name: "Comprimento (m)" })).toBeInTheDocument();
    expect(screen.getByShadowRole("spinbutton", { name: "Rigidez exigida (N/m)" })).toBeInTheDocument();
  });

  it("dimensiona e mostra a massa de cada material", async () => {
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(
      await screen.findByShadowLabelText(/Comprimento/),
      "0,8".replace(",", "."),
    );
    await user.type(
      await screen.findByShadowLabelText(/Rigidez exigida/),
      "200000",
    );

    await screen.findByRole("link", { name: "Alumínio 6061" });
    // The result table is the first; the bar figure repeats the names.
    const table = (await screen.findAllByRole("table"))[0]!;
    expect(within(table).getByText("Alumínio 6061")).toBeInTheDocument();
    expect(within(table).getByText("0,402")).toBeInTheDocument();
    // A ficha do registro, não a página de família (/app/catalogo/[slug]),
    // onde um id cairia numa família que não existe.
    expect(screen.getByRole("link", { name: "Alumínio 6061" })).toHaveAttribute(
      "href",
      "/app/materiais/1",
    );
  });

  it("guarda caso, números e objetivo na URL, e o link reabre o mesmo pedido (D-212)", async () => {
    const user = userEvent.setup();
    await chooseBeam();
    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");

    const params = new URLSearchParams(window.location.search);
    expect(params.get("caso")).toBe("viga-rigidez");
    expect(params.get("entradas")).not.toBeNull();

    cleanup();
    render(wrap(<SolverPage />));
    expect(await screen.findByShadowLabelText(/Comprimento/)).toHaveValue(0.8);
  });

  it("põe parâmetros e resultado em regiões nomeadas, sem violação de axe", async () => {
    const { container } = render(wrap(<SolverPage />));
    expect(await screen.findByRole("region", { name: ptBR.ui.paramsPanel })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: ptBR.ui.resultPanel })).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("envia os números na unidade canônica, como números", async () => {
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(
      await screen.findByShadowLabelText(/Rigidez exigida/),
      "200000",
    );

    await waitFor(() => expect(solveBrief).toHaveBeenCalledTimes(1));
    expect(solveBrief.mock.calls[0]![0]).toEqual({
      case_key: "viga-rigidez",
      inputs: { comprimento: 0.8, rigidez: 200000, constante_apoio: 48 },
      objective: "massa",
      limit: 10,
    });
  });

  it("nomeia quem ficou de fora, e por quê", async () => {
    // D-24: ausência é o quarto estado da qualidade do dado, com rótulo escrito.
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(
      await screen.findByShadowLabelText(/Rigidez exigida/),
      "200000",
    );

    await screen.findByText(t.excludedTitle);
    expect(screen.getByText(/Polímero sem módulo/)).toBeInTheDocument();
    expect(screen.getByText(/Módulo de Young/)).toBeInTheDocument();
  });

  it("mostra o fator estrutural, que é o que permite conferir a massa à mão", async () => {
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(
      await screen.findByShadowLabelText(/Rigidez exigida/),
      "200000",
    );

    await screen.findByRole("link", { name: "Alumínio 6061" });
    expect(
      screen.getByText(new RegExp(t.structuralFactor)),
    ).toBeInTheDocument();
    expect(screen.getByText(/1\.234,5/)).toBeInTheDocument();
  });

  // --- o objetivo custo (D-65) ---------------------------------------------

  it("mostra o índice gêmeo de custo ao lado do de massa, antes de escolher", async () => {
    // São duas leituras de uma derivação. Quem não vê as duas ao mesmo tempo
    // não tem como notar que o fator estrutural não mudou.
    await chooseBeam();

    expect(screen.getByText(beam.cost_index_name!)).toBeInTheDocument();
    expect(
      screen.getByText("sqrt(modulo_young) / (densidade * custo_massa)"),
    ).toBeInTheDocument();
  });

  it("pede o custo quando o objetivo escolhido é o custo", async () => {
    const user = userEvent.setup();
    await chooseBeam();

    await userEvent.selectOptions(
      await screen.findByShadowRole("combobox", { name: t.objectiveLabel }),
      "custo",
    );
    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(
      await screen.findByShadowLabelText(/Rigidez exigida/),
      "200000",
    );

    await waitFor(() => expect(solveBrief).toHaveBeenCalledTimes(1));
    expect(solveBrief.mock.calls[0]![0]!.objective).toBe("custo");
  });

  it("diz em que unidade o custo está e por que a dimensão sai como massa", async () => {
    const user = userEvent.setup();
    solveBrief.mockResolvedValue({
      ...result,
      objective: "custo",
      objective_label: "Minimizar custo de material",
      index_slug: "viga-leve-rigidez-custo",
      index_name: "Viga barata limitada por rigidez",
      index_expression: "sqrt(modulo_young) / (densidade * custo_massa)",
      objective_unit: "unidade monetária não especificada",
      objective_note:
        "custo_massa é adimensional, então a dimensão sai como massa.",
    });
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(
      await screen.findByShadowLabelText(/Rigidez exigida/),
      "200000",
    );

    await screen.findByRole("link", { name: "Alumínio 6061" });
    expect(
      screen.getByText(
        new RegExp(`${t.columnObjectiveCost} \\(unidade monetária`),
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/adimensional/)).toBeInTheDocument();
  });

  it("não oferece a estimativa de custo a partir de um resultado que não é massa", async () => {
    // O link leva `massa=` para /app/custo. Mandar um custo ali entregaria ao
    // estimador um número de outra grandeza, e ele não teria como perceber.
    const user = userEvent.setup();
    solveBrief.mockResolvedValue({
      ...result,
      objective: "custo",
      objective_unit: "unidade monetária não especificada",
      objective_note: "custo_massa é adimensional.",
    });
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(
      await screen.findByShadowLabelText(/Rigidez exigida/),
      "200000",
    );

    await screen.findByRole("link", { name: "Alumínio 6061" });
    expect(
      screen.queryByRole("link", { name: ptBR.cost.fromSolver }),
    ).not.toBeInTheDocument();
  });

  it("oferece a estimativa de custo com a massa que acabou de calcular", async () => {
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(
      await screen.findByShadowLabelText(/Rigidez exigida/),
      "200000",
    );

    await screen.findByRole("link", { name: "Alumínio 6061" });
    expect(
      screen.getByRole("link", { name: ptBR.cost.fromSolver }),
    ).toHaveAttribute("href", "/app/custo?material=1&massa=0.402&origem=dimensionar");
  });

  it("abre com o objetivo e o limite que o servidor mandar, sem cópia na tela (D-216)", async () => {
    const { defaultsFixture } = await import("@/lib/defaults.fixture");
    getDefaults.mockResolvedValueOnce({
      ...defaultsFixture,
      dimensionar: { objective: "custo", limit: 7 },
    });
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(await screen.findByShadowLabelText(/Rigidez exigida/), "200000");

    await waitFor(() => expect(solveBrief).toHaveBeenCalledTimes(1));
    expect(solveBrief.mock.calls[0]![0]).toMatchObject({ objective: "custo", limit: 7 });
    expect(new URLSearchParams(window.location.search).has("objetivo")).toBe(false);
  });

  it("desenha o esquema do caso de carga e o redesenha com o apoio escolhido", async () => {
    await chooseBeam();

    const sketch = await screen.findByRole("img", {
      name: t.diagram.aria(t.diagram.kinds.beam, "Biapoiada, carga no meio do vão"),
    });
    expect(sketch).toHaveAttribute("data-diagram", "beam");
    // Honest about what it is: an illustration, not a drawing to scale.
    expect(screen.getByText(t.diagram.caption)).toBeInTheDocument();
  });

  it("desenha o resultado em barras, com a tabela de origem e o link para comparar", async () => {
    solveBrief.mockResolvedValue({
      ...result,
      solved: [
        ...result.solved,
        { ...result.solved[0]!, record_id: 3, name: "Aço 1020", rank: 2, objective_value: 0.9 },
      ],
    });
    const user = userEvent.setup();
    await chooseBeam();
    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(await screen.findByShadowLabelText(/Rigidez exigida/), "200000");

    expect(
      await screen.findByRole("figure", { name: ptBR.chart.figureLabel(t.chart.figure) }),
    ).toBeInTheDocument();
    // One bar per material, in the server's order — and the value it prints is the table's.
    // The bars link to the record's sheet (D-193), so each mark is a link.
    const marks = screen.getAllByRole("link", { name: /^[12]\. / });
    expect(marks.map((m) => m.getAttribute("aria-label"))).toEqual([
      "1. Alumínio 6061: 0,402 kg",
      "2. Aço 1020: 0,9 kg",
    ]);
    // The candidates go to Comparar, which takes a list of ids (Seleção does not).
    expect(screen.getByRole("link", { name: t.compareBest(2) })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/comparar\?materiais=/),
    );
  });
});

describe("Dimensionar — Sugestão da IA (D-230b)", () => {
  installWideViewport();
  const answer: SuggestionsOut = {
    tool: "dimensionar",
    summary: "Três ideias para o dimensionamento.",
    suggestions: [
      {
        title: "Otimize por custo",
        body: "O mesmo caso, com o objetivo de custo, pode mudar o ranking.",
        actions: [
          { type: "set_param", label: "objetivo: custo", name: "objective", value: "custo" },
          { type: "set_param", label: "objetivo: tempo", name: "objective", value: "tempo" },
        ],
      },
      {
        title: "Teste um vão menor",
        body: "Um vão menor reduz a massa.",
        actions: [
          { type: "set_param", label: "comprimento: 0,5", name: "inputs.comprimento", value: 0.5 },
          { type: "set_param", label: "apoio: 12", name: "inputs.constante_apoio", value: 12 },
          { type: "set_param", label: "variável sem campo", name: "inputs.largura", value: 3 },
        ],
      },
      {
        title: "Compare os primeiros",
        body: "Lado a lado, com todas as propriedades.",
        actions: [
          { type: "compare", label: "Comparar 2 materiais", ids: [1, 3] },
          { type: "open_route", label: "Ver o Alumínio 6061", path: "/app/materiais/1" },
        ],
      },
    ],
    rejected: [],
    degraded: false,
    cached: false,
    notice: null,
    provider: "mock",
    simulated: true,
    disclaimer: "",
  };

  function openWithBrief() {
    window.history.replaceState(
      null,
      "",
      `/app/dimensionar?caso=viga-rigidez&entradas=${encodeUrlJson({ comprimento: "0.8", rigidez: "200000", constante_apoio: "48" })}`,
    );
  }

  beforeEach(() => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
  });

  async function ask() {
    const user = userEvent.setup();
    openWithBrief();
    render(wrap(<SolverPage />));
    await screen.findByRole("heading", { name: t.inputsStep });
    await waitFor(() => expect(solveBrief).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Otimize por custo");
    return user;
  }

  it("só consulta ao clicar, com o mesmo pedido que a rota de dimensionamento recebe", async () => {
    const user = userEvent.setup();
    openWithBrief();
    render(wrap(<SolverPage />));
    await screen.findByRole("heading", { name: t.inputsStep });
    await waitFor(() => expect(solveBrief).toHaveBeenCalledTimes(1));
    expect(suggest.fn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Otimize por custo");
    expect(suggest.fn).toHaveBeenCalledTimes(1);
    expect(suggest.fn).toHaveBeenCalledWith("dimensionar", { request: solveBrief.mock.calls[0]![0] });
  });

  it("o objetivo e uma entrada sugeridos mudam o endereço, o campo e o pedido", async () => {
    const user = await ask();
    // An objective the screen does not know, a support value the case does not
    // list and a variable it does not have are not buttons.
    expect(screen.queryByRole("button", { name: "objetivo: tempo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "apoio: 12" })).toBeNull();
    expect(screen.queryByRole("button", { name: "variável sem campo" })).toBeNull();
    expect(new URLSearchParams(window.location.search).get("objetivo")).toBeNull();

    await user.click(screen.getByRole("button", { name: "objetivo: custo" }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("objetivo")).toBe("custo"));
    const objective = screen.getByShadowRole("combobox", { name: t.objectiveLabel });
    expect(objective).toHaveValue("custo");
    await waitFor(() => expect(objective).toHaveAttribute("data-ai-changed", "true"));
    await waitFor(() => expect(solveBrief.mock.calls.at(-1)![0]).toMatchObject({ objective: "custo" }));

    await user.click(screen.getByRole("button", { name: "comprimento: 0,5" }));
    const length = screen.getByShadowRole("spinbutton", { name: "Comprimento (m)" });
    await waitFor(() => expect(length).toHaveValue(0.5));
    await waitFor(() =>
      expect(solveBrief.mock.calls.at(-1)![0]).toMatchObject({
        inputs: { comprimento: 0.5, rigidez: 200000, constante_apoio: 48 },
      }),
    );
  });

  it("comparar abre /app/comparar com os ids, como um link; a rota também", async () => {
    await ask();
    expect(screen.getByRole("link", { name: "Comparar 2 materiais" })).toHaveAttribute(
      "href",
      "/app/comparar?materiais=1,3",
    );
    expect(screen.getByRole("link", { name: "Ver o Alumínio 6061" })).toHaveAttribute(
      "href",
      "/app/materiais/1",
    );
  });

  it("falta um número de projeto: o botão fica desligado e nada é perguntado", async () => {
    render(wrap(<SolverPage />));
    await screen.findByRole("heading", { name: t.inputsStep });
    expect(screen.getByRole("button", { name: suggestText.button })).toBeDisabled();
    expect(screen.getByText(suggestText.needsBrief)).toBeInTheDocument();
    expect(suggest.fn).not.toHaveBeenCalled();
  });

  it("não tem violação de acessibilidade com o painel aberto", async () => {
    const user = userEvent.setup();
    openWithBrief();
    const { container } = render(wrap(<SolverPage />));
    await screen.findByRole("heading", { name: t.inputsStep });
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Otimize por custo");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});
