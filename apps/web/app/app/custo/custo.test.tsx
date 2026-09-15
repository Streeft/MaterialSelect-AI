import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC roles live inside a
// shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type { CostRequest, CostResult, MaterialListItem } from "@/lib/types";
import { setMwcTextField } from "@/lib/testing/mwc";

const t = ptBR.cost;

const estimatePartCost = vi.fn<(payload: CostRequest) => Promise<CostResult>>();

const materials: MaterialListItem[] = [
  {
    id: 7,
    name: "Liga Alumínio Demo A",
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 3, importado: 0, estimado: 1, missing: 0 },
  },
];

const result: CostResult = {
  material_id: 7,
  material_name: "Liga Alumínio Demo A",
  part_mass: 2,
  batch_size: 1000,
  write_off_years: 5,
  load_factor: 0.5,
  material_cost_per_mass: 8,
  monetary_unit_note:
    "Os valores estão em unidade monetária não especificada: o catálogo registra custo por massa sem declarar moeda.",
  costed: [
    {
      process_id: 1,
      process_slug: "fundicao-areia",
      process_name: "Fundição em areia",
      class_name: "Conformação",
      rank: 1,
      terms: {
        material: 20,
        tooling: 12,
        overhead: 7.08,
        capital: 0.95,
        total: 40.03,
        batch_sensitive: 12,
      },
    },
  ],
  uncosted: [
    {
      process_id: 2,
      process_slug: "retificacao",
      process_name: "Retificação",
      missing_slugs: ["custo-ferramental"],
      missing_labels: ["Custo de ferramental dedicado"],
      reason: "Sem dado econômico: Custo de ferramental dedicado",
    },
  ],
};

const nav = vi.hoisted(() => ({ query: "" }));

// `PageHeader` reads the pathname for the route palette (D-49); without this it
// gets null and the header throws before anything renders.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/custo",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));

vi.mock("@/lib/api", () => ({
  listMaterials: () => Promise.resolve(materials),
  estimatePartCost: (payload: CostRequest) => estimatePartCost(payload),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: CustoPage } = await import("./page");

async function open() {
  render(wrap(<CustoPage />));
  await screen.findByRole("heading", { name: t.briefStep });
}

beforeEach(() => {
  nav.query = "";
  estimatePartCost.mockReset();
  estimatePartCost.mockResolvedValue(result);
});

describe("Custo da peça", () => {
  it("não estima enquanto faltar a massa", async () => {
    // Nem a massa nem o lote têm valor inventado: são os números que decidem.
    await open();

    expect(await screen.findByShadowRole("button", { name: t.estimate })).toBeDisabled();
  });

  it("aceita a peça e o lote pela URL, que é como o dimensionamento liga aqui", async () => {
    nav.query = "material=7&massa=2&lote=500";
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.estimate }));

    await waitFor(() => expect(estimatePartCost).toHaveBeenCalledTimes(1));
    expect(estimatePartCost.mock.calls[0]![0]).toMatchObject({
      material_id: 7,
      part_mass: 2,
      batch_size: 500,
    });
  });

  it("mostra os quatro termos, não só o total", async () => {
    // A decomposição é o item; total sozinho seria oráculo.
    nav.query = "material=7&massa=2";
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.estimate }));

    await screen.findByRole("heading", { name: t.resultStep });
    for (const value of ["20", "12", "7,08", "0,95", "40,03"]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }
  });

  it("diz em que unidade o número está, em vez de imprimir moeda", async () => {
    // Dinheiro não está em sistema de unidades nenhum, e a tela admite isso.
    nav.query = "material=7&massa=2";
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.estimate }));

    await screen.findByRole("heading", { name: t.resultStep });
    expect(screen.getByText(new RegExp("unidade monetária não especificada"))).toBeInTheDocument();
  });

  it("nomeia o processo sem dado econômico, com o motivo", async () => {
    // D-24, e a razão concreta: ferramental em branco viraria o mais barato.
    nav.query = "material=7&massa=2";
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.estimate }));

    await screen.findByText(t.uncostedTitle);
    expect(screen.getByText(/Retificação/)).toBeInTheDocument();
    expect(screen.getByText(/Custo de ferramental dedicado/)).toBeInTheDocument();
  });

  it("envia as premissas da oficina junto, com os padrões visíveis", async () => {
    nav.query = "material=7&massa=2";
    const user = userEvent.setup();
    await open();

    await user.click(await screen.findByShadowRole("button", { name: t.estimate }));

    await waitFor(() => expect(estimatePartCost).toHaveBeenCalledTimes(1));
    expect(estimatePartCost.mock.calls[0]![0]).toMatchObject({
      write_off_years: 5,
      load_factor: 0.5,
    });
  });

  it("recusa fator de carga acima de um antes de chamar a API", async () => {
    // O servidor também recusa (o schema tem o limite), mas deixar o botão
    // ativo mandaria o leitor descobrir isso por um 422.
    nav.query = "material=7&massa=2";
    await open();

    setMwcTextField(await screen.findByShadowLabelText(/Fator de carga/), "1.5");

    expect(await screen.findByShadowRole("button", { name: t.estimate })).toBeDisabled();
    expect(estimatePartCost).not.toHaveBeenCalled();
  });
});
