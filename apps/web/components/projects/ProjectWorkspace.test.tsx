import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnnouncerProvider } from "@/components/ui/Announcer";
import { ptBR } from "@/lib/i18n";
import type { Assembly, AssemblyPart, AssemblyTotal } from "@/lib/types";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { renderWithQuery } from "@/lib/testing/queryWrapper";
import { ProjectWorkspace } from "./ProjectWorkspace";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const api = vi.hoisted(() => ({
  getTray: vi.fn(),
  getAssembly: vi.fn(),
  updateAssembly: vi.fn(),
  deleteAssembly: vi.fn(),
  addAssemblyPart: vi.fn(),
  updateAssemblyPart: vi.fn(),
  deleteAssemblyPart: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  ...api,
  listMaterials: () =>
    Promise.resolve([
      { id: 7, name: "Pinho", class_name: "Naturais", class_slug: "naturais", subclass: "Madeira" },
      { id: 9, name: "Aço 1020", class_name: "Metais", class_slug: "metais", subclass: null },
    ]),
  listLoadCases: () =>
    Promise.resolve([
      {
        key: "tirante-rigidez",
        label: "Tirante em tração, rigidez especificada",
        summary: "Um tirante que não pode alongar mais que o permitido.",
        variables: [
          { key: "comprimento", label: "Comprimento", unit: "m", help_text: "Entre os apoios." },
          { key: "rigidez", label: "Rigidez", unit: "N/m", help_text: "Força por alongamento." },
        ],
        supports: [],
      },
      {
        key: "viga-rigidez",
        label: "Viga em flexão, rigidez especificada",
        summary: "Uma viga que não pode fletir mais que o permitido.",
        variables: [
          { key: "comprimento", label: "Comprimento", unit: "m", help_text: "Vão." },
          { key: "constante_apoio", label: "Constante de apoio", unit: "dimensionless", help_text: "Do apoio." },
        ],
        supports: [
          { key: "engastada-livre", label: "Engastada e livre", variable_key: "constante_apoio", value: 3, note: null },
          { key: "biapoiada-central", label: "Biapoiada, carga central", variable_key: "constante_apoio", value: 48, note: null },
        ],
      },
    ]),
  listStudies: () =>
    Promise.resolve([
      { id: 3, name: "Tampo leve", universe: "material" },
      { id: 4, name: "Como fabricar", universe: "process" },
    ]),
}));

const t = ptBR.projects;

function total(over: Partial<AssemblyTotal>, unit: string): AssemblyTotal {
  return { value: null, known_sum: 0, known_parts: 0, missing_parts: [], unit, ...over };
}

function part(over: Partial<AssemblyPart>): AssemblyPart {
  return {
    id: 1,
    position: 0,
    name: "Tampo",
    role: "estrutural",
    quantity: 1,
    unit_mass: 12,
    material: { id: 7, name: "Pinho", class_name: "Naturais" },
    material_unavailable: false,
    study: null,
    load_case: null,
    notes: null,
    mass: { value: 12, reason: null, quality: null },
    material_cost: { value: 48, reason: null, quality: "IMPORTADO" },
    embodied_energy: { value: 120.5, reason: null, quality: "MEDIDO" },
    carbon: { value: null, reason: "Pinho não tem pegada de CO₂ cadastrada.", quality: null },
    ...over,
  };
}

function project(parts: AssemblyPart[], over: Partial<Assembly> = {}): Assembly {
  return {
    id: 5,
    name: "Mesa de jantar",
    description: null,
    part_count: parts.length,
    chosen_count: parts.filter((p) => p.material).length,
    updated_at: "2026-11-19T12:00:00Z",
    created_at: "2026-11-19T12:00:00Z",
    parts,
    totals: {
      mass: total({ value: 12, known_sum: 12, known_parts: 1 }, "kg"),
      material_cost: total({ value: 48, known_sum: 48, known_parts: 1 }, "unidade monetária não especificada"),
      embodied_energy: total({ value: 120.5, known_sum: 120.5, known_parts: 1 }, "MJ"),
      carbon: total({ missing_parts: ["Tampo"] }, "kg de CO₂"),
    },
    scope_note: "As somas cobrem só a fase de material.",
    monetary_unit_note: "Os valores estão em unidade monetária não especificada.",
    ...over,
  };
}

function renderWorkspace() {
  return renderWithQuery(
    <AnnouncerProvider>
      <ProjectWorkspace id={5} />
    </AnnouncerProvider>,
  );
}

afterEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  push.mockReset();
});

describe("ProjectWorkspace (D-257)", () => {
  it("mostra as peças com os números do servidor, e a ausência com o motivo escrito", async () => {
    api.getAssembly.mockResolvedValue(project([part({})]));
    const { container } = renderWorkspace();

    const card = await screen.findByRole("region", { name: t.partRegion("Tampo") });
    // pt-BR numbers, with the unit the server named.
    expect(within(card).getByText("12 kg")).toBeInTheDocument();
    expect(within(card).getByText("120,5 MJ")).toBeInTheDocument();
    // A cost is a bare number; why it has no currency is said once, in the server's words.
    expect(within(card).getByText("48")).toBeInTheDocument();
    expect(screen.getByText("Os valores estão em unidade monetária não especificada.")).toBeInTheDocument();
    // Absence is the reason, never "0" or a dash.
    expect(within(card).getByText("Pinho não tem pegada de CO₂ cadastrada.")).toBeInTheDocument();
    expect(card).not.toHaveTextContent(/\b0 kg de CO₂/);
    expect(screen.getByText(t.progress(1, 1))).toBeInTheDocument();
    expect(screen.getByText("As somas cobrem só a fase de material.")).toBeInTheDocument();
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("um total sem dado é recusado, com a soma parcial dita como parcial", async () => {
    api.getAssembly.mockResolvedValue(
      project([part({}), part({ id: 2, name: "Perna", unit_mass: null })], {
        totals: {
          mass: total({ known_sum: 12, known_parts: 1, missing_parts: ["Perna"] }, "kg"),
          material_cost: total({ known_sum: 48, known_parts: 1, missing_parts: ["Perna"] }, "u.m."),
          embodied_energy: total({ known_sum: 120.5, known_parts: 1, missing_parts: ["Perna"] }, "MJ"),
          carbon: total({ missing_parts: ["Tampo", "Perna"] }, "kg de CO₂"),
        },
      }),
    );
    renderWorkspace();
    await screen.findByRole("region", { name: t.partRegion("Perna") });
    const totals = document.getElementById("soma") as HTMLElement;
    // Mass, cost and energy each miss the leg; CO₂ misses both parts.
    expect(within(totals).getAllByText(t.noTotal(1, "Perna"))).toHaveLength(3);
    expect(within(totals).getByText(t.partialSum("12 kg", 1))).toBeInTheDocument();
    expect(within(totals).getByText(t.noTotal(2, "Tampo, Perna"))).toBeInTheDocument();
    expect(within(totals).getByText(t.noPartial)).toBeInTheDocument();
  });

  it("a massa em branco vai como ausência, e o valor digitado vai como número", async () => {
    api.getAssembly.mockResolvedValue(project([part({})]));
    api.updateAssemblyPart.mockResolvedValue(project([part({ unit_mass: null })]));
    const user = userEvent.setup();
    renderWorkspace();
    const card = await screen.findByRole("region", { name: t.partRegion("Tampo") });
    const mass = within(card).getByRole("spinbutton", { name: new RegExp(t.unitMass) });

    await user.clear(mass);
    await user.tab();
    await waitFor(() => expect(api.updateAssemblyPart).toHaveBeenCalledWith(5, 1, { unit_mass: null }));

    const again = within(await screen.findByRole("region", { name: t.partRegion("Tampo") })).getByRole(
      "spinbutton",
      { name: new RegExp(t.unitMass) },
    );
    await user.type(again, "2.5");
    await user.tab();
    await waitFor(() => expect(api.updateAssemblyPart).toHaveBeenLastCalledWith(5, 1, { unit_mass: 2.5 }));
  });

  it("uma quantidade inválida volta ao valor salvo e nada é enviado", async () => {
    api.getAssembly.mockResolvedValue(project([part({ quantity: 4 })]));
    const user = userEvent.setup();
    renderWorkspace();
    const card = await screen.findByRole("region", { name: t.partRegion("Tampo") });
    const quantity = within(card).getByRole("spinbutton", { name: t.quantity });
    await user.clear(quantity);
    await user.type(quantity, "0");
    await user.tab();
    expect(quantity).toHaveValue(4);
    expect(api.updateAssemblyPart).not.toHaveBeenCalled();
  });

  it("só estudos de materiais podem decidir uma peça, e escolher um vai ao servidor", async () => {
    api.getAssembly.mockResolvedValue(project([part({})]));
    api.updateAssemblyPart.mockResolvedValue(project([part({ study: { id: 3, name: "Tampo leve" } })]));
    const user = userEvent.setup();
    renderWorkspace();
    const card = await screen.findByRole("region", { name: t.partRegion("Tampo") });
    const study = within(card).getByRole("combobox", { name: t.study });
    await waitFor(() => expect(within(study).getByRole("option", { name: "Tampo leve" })).toBeInTheDocument());
    expect(within(study).queryByRole("option", { name: "Como fabricar" })).not.toBeInTheDocument();

    await user.selectOptions(study, "3");
    await waitFor(() => expect(api.updateAssemblyPart).toHaveBeenCalledWith(5, 1, { study_id: 3 }));
    expect(await screen.findByRole("link", { name: t.openStudy("Tampo leve") })).toHaveAttribute(
      "href",
      "/app/selecao?estudo=3",
    );
  });

  it("acrescenta uma peça pelo formulário e anuncia", async () => {
    api.getAssembly.mockResolvedValue(project([]));
    api.addAssemblyPart.mockResolvedValue(project([part({ name: "Perna", material: null })]));
    const user = userEvent.setup();
    renderWorkspace();
    expect(await screen.findByText(t.partsEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.totalsEmpty)).toBeInTheDocument();
    const add = screen.getByRole("button", { name: t.addPart });
    expect(add).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: t.partName }), "Perna");
    await user.selectOptions(screen.getByRole("combobox", { name: t.role }), "fixacao");
    await user.click(add);
    await waitFor(() => expect(api.addAssemblyPart).toHaveBeenCalledWith(5, { name: "Perna", role: "fixacao" }));
    expect(await screen.findByRole("region", { name: t.partRegion("Perna") })).toBeInTheDocument();
  });

  it("um material que saiu do catálogo é dito em palavras", async () => {
    api.getAssembly.mockResolvedValue(project([part({ material: null, material_unavailable: true })]));
    renderWorkspace();
    expect(await screen.findByText(t.materialGone)).toBeInTheDocument();
  });

  it("a recusa do servidor aparece na tela", async () => {
    api.getAssembly.mockResolvedValue(project([part({})]));
    api.updateAssemblyPart.mockRejectedValue(Object.assign(new Error("Limite de 60 peças"), { status: 409 }));
    const user = userEvent.setup();
    renderWorkspace();
    const card = await screen.findByRole("region", { name: t.partRegion("Tampo") });
    await user.selectOptions(within(card).getByRole("combobox", { name: t.role }), "acabamento");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("excluir pede confirmação e volta para a lista", async () => {
    api.getAssembly.mockResolvedValue(project([part({})]));
    api.deleteAssembly.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWorkspace();
    await screen.findByRole("region", { name: t.partRegion("Tampo") });
    await user.click(screen.getByRole("button", { name: ptBR.ds.moreActions }));
    await user.click(await screen.findByRole("menuitem", { name: t.delete }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(t.deleteBody)).toBeInTheDocument();
    expect(api.deleteAssembly).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: t.delete }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/projetos"));
  });

  it("um projeto que não é do leitor é dito como não encontrado", async () => {
    api.getAssembly.mockRejectedValue(Object.assign(new Error("Projeto não encontrado: 5"), { status: 404 }));
    renderWorkspace();
    expect(await screen.findByText(t.notFound)).toBeInTheDocument();
  });

  it("os materiais da bandeja ficam à mão: pelo menu da peça, o escolhido vai ao servidor (D-258)", async () => {
    api.getAssembly.mockResolvedValue(project([part({ material: null })]));
    api.getTray.mockResolvedValue({
      items: [
        { id: 1, kind: "material", compartment: "fixacao", position: 0, record_id: 9, tool: null, name: "Aço 1020", detail: "Metais", href: "/app/materiais/9", unavailable: false },
        { id: 2, kind: "material", compartment: "material", position: 0, record_id: 11, tool: null, name: "Material indisponível", detail: null, href: null, unavailable: true },
        { id: 3, kind: "tool", compartment: "ferramenta", position: 0, record_id: null, tool: "custo", name: "Custo", detail: null, href: "/app/custo", unavailable: false },
      ],
      tools: [],
      max_items: 40,
    });
    api.updateAssemblyPart.mockResolvedValue(
      project([part({ material: { id: 9, name: "Aço 1020", class_name: "Metais" } })]),
    );
    const user = userEvent.setup();
    renderWorkspace();

    // The strip shows only what can be a part's material: readable materials, fixings included.
    const strip = await screen.findByRole("group", { name: ptBR.tray.stripTitle });
    expect(within(strip).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Aço 1020"]);
    expect(within(strip).getByRole("listitem")).toHaveAttribute("draggable", "true");

    const card = screen.getByRole("region", { name: t.partRegion("Tampo") });
    await user.click(within(card).getByRole("button", { name: t.partMenu("Tampo") }));
    await user.click(await screen.findByRole("menuitem", { name: ptBR.tray.useInPart("Aço 1020") }));
    await waitFor(() => expect(api.updateAssemblyPart).toHaveBeenCalledWith(5, 1, { material_id: 9 }));
  });

  it("sem nada na bandeja, a página do projeto não fala dela", async () => {
    api.getAssembly.mockResolvedValue(project([part({})]));
    api.getTray.mockResolvedValue({ items: [], tools: [], max_items: 40 });
    renderWorkspace();
    await screen.findByRole("region", { name: t.partRegion("Tampo") });
    expect(screen.queryByRole("group", { name: ptBR.tray.stripTitle })).not.toBeInTheDocument();
  });

  it("o caso de carga se declara na peça: o caso, as medidas e o apoio vão ao servidor como foram escritos (D-261)", async () => {
    api.getAssembly.mockResolvedValue(project([part({})]));
    api.updateAssemblyPart.mockResolvedValue(
      project([
        part({
          load_case: {
            key: "tirante-rigidez",
            label: "Tirante em tração, rigidez especificada",
            inputs: { comprimento: 1.2, rigidez: 500000 },
            unavailable: false,
          },
        }),
      ]),
    );
    const user = userEvent.setup();
    renderWorkspace();
    const card = await screen.findByRole("region", { name: t.partRegion("Tampo") });
    expect(within(card).getByText(t.load.none)).toBeInTheDocument();
    await user.click(await within(card).findByRole("button", { name: t.load.declare }));

    const form = within(card).getByRole("form", { name: t.load.formOf("Tampo") });
    // A number that is not one is refused here, in words, and nothing is sent.
    await user.type(within(form).getByRole("spinbutton", { name: /Comprimento/ }), "1.2");
    await user.click(within(form).getByRole("button", { name: t.load.save }));
    expect(within(form).getByRole("alert")).toHaveTextContent(t.load.invalid("Rigidez"));
    expect(api.updateAssemblyPart).not.toHaveBeenCalled();

    await user.type(within(form).getByRole("spinbutton", { name: /Rigidez/ }), "500000");
    await user.click(within(form).getByRole("button", { name: t.load.save }));
    await waitFor(() =>
      expect(api.updateAssemblyPart).toHaveBeenCalledWith(5, 1, {
        load_case: { key: "tirante-rigidez", inputs: { comprimento: 1.2, rigidez: 500000 } },
      }),
    );
    // What is shown afterwards is what the server stored, named as it names it.
    expect(await within(card).findByText("Tirante em tração, rigidez especificada")).toBeInTheDocument();
    expect(within(card).getByText("500.000 N/m")).toBeInTheDocument();
  });

  it("um apoio é escolha entre as condições do caso, e remover o caso manda nulo (D-261)", async () => {
    api.getAssembly.mockResolvedValue(
      project([
        part({
          load_case: {
            key: "viga-rigidez",
            label: "Viga em flexão, rigidez especificada",
            inputs: { comprimento: 2, constante_apoio: 48 },
            unavailable: false,
          },
        }),
      ]),
    );
    api.updateAssemblyPart.mockResolvedValue(project([part({})]));
    const user = userEvent.setup();
    renderWorkspace();
    const card = await screen.findByRole("region", { name: t.partRegion("Tampo") });
    // The stored constant reads as the support it is, never as a bare number.
    expect(await within(card).findByText("Biapoiada, carga central")).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: t.load.change }));
    const form = within(card).getByRole("form", { name: t.load.formOf("Tampo") });
    expect(within(form).getByRole("combobox", { name: t.load.support })).toHaveValue("48");
    await user.click(within(form).getByRole("button", { name: t.load.cancel }));

    await user.click(within(card).getByRole("button", { name: t.load.remove }));
    await waitFor(() => expect(api.updateAssemblyPart).toHaveBeenCalledWith(5, 1, { load_case: null }));
  });
});