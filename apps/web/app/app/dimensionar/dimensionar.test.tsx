import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC roles live inside a
// shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type { LoadCase, SolveRequest, SolveResult } from "@/lib/types";

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
    },
    {
      key: "rigidez",
      label: "Rigidez exigida",
      unit: "N/m",
      help_text: "Força por deslocamento.",
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
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/api", () => ({
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

  it("não deixa dimensionar enquanto faltar um número de projeto", async () => {
    // O caso chega com a constante de apoio preenchida pela condição escolhida,
    // mas vão e rigidez não têm padrão nenhum — inventá-los seria a ferramenta
    // escrevendo o briefing.
    await chooseBeam();

    expect(
      await screen.findByShadowRole("button", { name: t.solve }),
    ).toBeDisabled();
    // D-86: the button says which number is missing, and the result card is
    // already on screen saying what will appear there.
    expect(screen.getByText(t.blockedVariable("Comprimento (m)"))).toBeInTheDocument();
    expect(screen.getByText(t.resultIdleTitle)).toBeInTheDocument();
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
    await user.click(
      await screen.findByShadowRole("button", { name: t.solve }),
    );

    await screen.findByRole("heading", { name: t.resultStep });
    expect(screen.getByText("Alumínio 6061")).toBeInTheDocument();
    expect(screen.getByText("0,402")).toBeInTheDocument();
    // A ficha do registro, não a página de família (/app/catalogo/[slug]),
    // onde um id cairia numa família que não existe.
    expect(screen.getByRole("link", { name: "Alumínio 6061" })).toHaveAttribute(
      "href",
      "/app/materiais/1",
    );
  });

  it("envia os números na unidade canônica, como números", async () => {
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(
      await screen.findByShadowLabelText(/Rigidez exigida/),
      "200000",
    );
    await user.click(
      await screen.findByShadowRole("button", { name: t.solve }),
    );

    await waitFor(() => expect(solveBrief).toHaveBeenCalledTimes(1));
    expect(solveBrief.mock.calls[0]![0]).toEqual({
      case_key: "viga-rigidez",
      inputs: { comprimento: 0.8, rigidez: 200000, constante_apoio: 48 },
      objective: "massa",
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
    await user.click(
      await screen.findByShadowRole("button", { name: t.solve }),
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
    await user.click(
      await screen.findByShadowRole("button", { name: t.solve }),
    );

    await screen.findByRole("heading", { name: t.resultStep });
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
    await user.click(
      await screen.findByShadowRole("button", { name: t.solve }),
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
    await user.click(
      await screen.findByShadowRole("button", { name: t.solve }),
    );

    await screen.findByRole("heading", { name: t.resultStep });
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
    await user.click(
      await screen.findByShadowRole("button", { name: t.solve }),
    );

    await screen.findByRole("heading", { name: t.resultStep });
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
    await user.click(
      await screen.findByShadowRole("button", { name: t.solve }),
    );

    await screen.findByRole("heading", { name: t.resultStep });
    expect(
      screen.getByRole("link", { name: ptBR.cost.fromSolver }),
    ).toHaveAttribute("href", "/app/custo?material=1&massa=0.402");
  });
});
