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
import { selectMwcOption } from "@/lib/testing/mwc";

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
  objective_unit: "kg",
  free_unit: "m**2",
  variables: [
    { key: "comprimento", label: "Comprimento", unit: "m", help_text: "Vão livre." },
    { key: "rigidez", label: "Rigidez exigida", unit: "N/m", help_text: "Força por deslocamento." },
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
  structural_factor: 1234.5,
  free_structural_factor: 12.3,
  objective_unit: "kg",
  free_unit: "m**2",
  objective_dimension: "[mass]",
  free_dimension: "[length] ** 2",
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: SolverPage } = await import("./page");

async function chooseBeam() {
  render(wrap(<SolverPage />));
  await screen.findByRole("heading", { name: t.title });
  selectMwcOption(
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
  it("mostra as facetas do fluxo função → restrição → objetivo", async () => {
    await chooseBeam();

    expect(screen.getByText(beam.constraint_label)).toBeInTheDocument();
    expect(screen.getByText(beam.objective_label)).toBeInTheDocument();
    expect(screen.getByText(beam.free_variable_label)).toBeInTheDocument();
  });

  it("mostra a expressão do índice como ela veio do catálogo", async () => {
    // Nunca reescrita na tela: duas cópias de uma fórmula viram duas respostas.
    await chooseBeam();

    expect(screen.getByText("sqrt(modulo_young) / densidade")).toBeInTheDocument();
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

    expect(await screen.findByShadowRole("button", { name: t.solve })).toBeDisabled();
  });

  it("dimensiona e mostra a massa de cada material", async () => {
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0,8".replace(",", "."));
    await user.type(await screen.findByShadowLabelText(/Rigidez exigida/), "200000");
    await user.click(await screen.findByShadowRole("button", { name: t.solve }));

    await screen.findByRole("heading", { name: t.resultStep });
    expect(screen.getByText("Alumínio 6061")).toBeInTheDocument();
    expect(screen.getByText("0,402")).toBeInTheDocument();
  });

  it("envia os números na unidade canônica, como números", async () => {
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(await screen.findByShadowLabelText(/Rigidez exigida/), "200000");
    await user.click(await screen.findByShadowRole("button", { name: t.solve }));

    await waitFor(() => expect(solveBrief).toHaveBeenCalledTimes(1));
    expect(solveBrief.mock.calls[0]![0]).toEqual({
      case_key: "viga-rigidez",
      inputs: { comprimento: 0.8, rigidez: 200000, constante_apoio: 48 },
    });
  });

  it("nomeia quem ficou de fora, e por quê", async () => {
    // D-24: ausência é o quarto estado da qualidade do dado, com rótulo escrito.
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(await screen.findByShadowLabelText(/Rigidez exigida/), "200000");
    await user.click(await screen.findByShadowRole("button", { name: t.solve }));

    await screen.findByText(t.excludedTitle);
    expect(screen.getByText(/Polímero sem módulo/)).toBeInTheDocument();
    expect(screen.getByText(/Módulo de Young/)).toBeInTheDocument();
  });

  it("mostra o fator estrutural, que é o que permite conferir a massa à mão", async () => {
    const user = userEvent.setup();
    await chooseBeam();

    await user.type(await screen.findByShadowLabelText(/Comprimento/), "0.8");
    await user.type(await screen.findByShadowLabelText(/Rigidez exigida/), "200000");
    await user.click(await screen.findByShadowRole("button", { name: t.solve }));

    await screen.findByRole("heading", { name: t.resultStep });
    expect(screen.getByText(new RegExp(t.structuralFactor))).toBeInTheDocument();
    expect(screen.getByText(/1\.234,5/)).toBeInTheDocument();
  });
});
