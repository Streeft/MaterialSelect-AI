import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import type { CompositionEntry } from "@/lib/types";

const t = ptBR.detail.edit;

const api = vi.hoisted(() => ({
  replaceMaterialComposition: vi.fn(),
  replaceMaterialDesignations: vi.fn(),
  listSources: vi.fn(),
  addMaterialCompositionEntry: vi.fn(),
  updateMaterialCompositionEntry: vi.fn(),
  deleteMaterialCompositionEntry: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  replaceMaterialComposition: api.replaceMaterialComposition,
  replaceMaterialDesignations: api.replaceMaterialDesignations,
  listSources: api.listSources,
  addMaterialCompositionEntry: api.addMaterialCompositionEntry,
  updateMaterialCompositionEntry: api.updateMaterialCompositionEntry,
  deleteMaterialCompositionEntry: api.deleteMaterialCompositionEntry,
}));

const { CompositionEditor, DesignationEditor } = await import("./IdentityEditors");

const chromium: CompositionEntry = {
  element: "Cr",
  element_name: "Cromo",
  atomic_number: 24,
  state: "faixa",
  value_min: 16,
  value_max: 18.5,
  value_nominal: null,
  original_unit: "%",
  normalized_min: 16,
  normalized_max: 18.5,
  normalized_nominal: null,
  canonical_unit: "percent",
  conversion_method: null,
  notes: null,
  data_quality: "IMPORTADO",
  source_label: "Fonte A",
  citation: null,
  is_demo: false,
};

function mount(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const SOURCES = [
  { id: 3, label: "Norma cadastrada", is_demo: false },
  { id: 4, label: "Fonte fictícia", is_demo: true },
];

beforeEach(() => {
  api.replaceMaterialComposition.mockReset().mockResolvedValue({});
  api.replaceMaterialDesignations.mockReset().mockResolvedValue({});
  api.listSources.mockReset().mockResolvedValue(SOURCES);
  api.addMaterialCompositionEntry.mockReset();
  api.updateMaterialCompositionEntry.mockReset();
  api.deleteMaterialCompositionEntry.mockReset().mockResolvedValue({ composition: [] });
});

describe("edição da composição (TM2-a)", () => {
  it("sends what the source wrote, with an unstated bound as null and never 0", async () => {
    const onDone = vi.fn();
    mount(<CompositionEditor materialId={7} entries={[chromium]} onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    await waitFor(() => expect(api.replaceMaterialComposition).toHaveBeenCalled());
    expect(api.replaceMaterialComposition).toHaveBeenCalledWith(7, [
      {
        element: "Cr",
        state: "faixa",
        condition_label: null,
        source_label: "Fonte A",
        citation: null,
        data_quality: "IMPORTADO",
        value_min: 16,
        value_max: 18.5,
        value_nominal: null,
        unit: "%",
      },
    ]);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("sends the condition as typed, and blank as no condition (TM2-c)", async () => {
    mount(
      <CompositionEditor
        materialId={7}
        entries={[chromium, { ...chromium, element: "Ni", condition_label: "laminado" }]}
        onDone={vi.fn()}
      />,
    );
    const [first] = screen.getAllByRole("textbox", { name: t.condition });
    await userEvent.type(first!, "  fundido ");
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    await waitFor(() => expect(api.replaceMaterialComposition).toHaveBeenCalled());
    const [, payload] = api.replaceMaterialComposition.mock.calls[0]!;
    expect(payload.map((row: { condition_label: string | null }) => row.condition_label)).toEqual([
      "fundido",
      "laminado",
    ]);
  });

  it("refuses a number it cannot read instead of sending it", async () => {
    mount(<CompositionEditor materialId={7} entries={[{ ...chromium, value_min: null }]} onDone={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: t.min }), "abc");
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent("número inválido");
    expect(api.replaceMaterialComposition).not.toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    api.replaceMaterialComposition.mockRejectedValue(Object.assign(new Error("Faixa invertida"), { status: 422 }));
    mount(<CompositionEditor materialId={7} entries={[chromium]} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Faixa invertida");
  });

  it("saving with no rows is the explicit 'no composition', not zero", async () => {
    mount(<CompositionEditor materialId={7} entries={[]} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    await waitFor(() => expect(api.replaceMaterialComposition).toHaveBeenCalledWith(7, []));
  });
});

describe("qualidade e fonte por linha (TM2-f, D-255)", () => {
  it("keeps the stored quality instead of turning it into an estimate", async () => {
    mount(<CompositionEditor materialId={7} entries={[chromium]} onDone={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: t.quality })).toHaveValue("IMPORTADO");
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    await waitFor(() => expect(api.replaceMaterialComposition).toHaveBeenCalled());
    expect(api.replaceMaterialComposition.mock.calls[0]![1][0].data_quality).toBe("IMPORTADO");
  });

  it("asks the quality of a first new row instead of assuming one", async () => {
    mount(<CompositionEditor materialId={7} entries={[]} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: t.addElement }));
    await userEvent.type(screen.getByRole("textbox", { name: t.element }), "Ni");
    await userEvent.type(screen.getByRole("textbox", { name: t.newSourceLabel }), "Folha nova");
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent("qualidade do dado");
    expect(api.replaceMaterialComposition).not.toHaveBeenCalled();
  });

  it("offers the registered sources, never a demonstration one for a real record", async () => {
    mount(<CompositionEditor materialId={7} entries={[chromium]} onDone={vi.fn()} />);
    const source = screen.getByRole("combobox", { name: t.source });
    await screen.findByRole("option", { name: "Norma cadastrada" });
    expect(screen.queryByRole("option", { name: "Fonte fictícia" })).toBeNull();
    await userEvent.selectOptions(source, "3");
    expect(screen.queryByRole("textbox", { name: t.newSourceLabel })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    await waitFor(() => expect(api.replaceMaterialComposition).toHaveBeenCalled());
    const [row] = api.replaceMaterialComposition.mock.calls[0]![1];
    expect(row.source_id).toBe(3);
    expect(row).not.toHaveProperty("source_label");
  });
});

describe("uma linha por vez (TM2-g, D-255)", () => {
  it("saves a stored row alone, by its id", async () => {
    api.updateMaterialCompositionEntry.mockResolvedValue({
      composition: [{ ...chromium, id: 11, value_min: 17 }],
    });
    mount(<CompositionEditor materialId={7} entries={[{ ...chromium, id: 11 }]} onDone={vi.fn()} />);
    const min = screen.getByRole("textbox", { name: t.min });
    await userEvent.clear(min);
    await userEvent.type(min, "17");
    await userEvent.click(screen.getByRole("button", { name: t.saveRow(1) }));
    await waitFor(() => expect(api.updateMaterialCompositionEntry).toHaveBeenCalled());
    const [materialId, entryId, payload] = api.updateMaterialCompositionEntry.mock.calls[0]!;
    expect([materialId, entryId, payload.value_min]).toEqual([7, 11, 17]);
    expect(api.replaceMaterialComposition).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent(t.rowSaved(1));
  });

  it("adds a new row alone, reusing the previous row's quality and source", async () => {
    api.addMaterialCompositionEntry.mockResolvedValue({
      composition: [{ ...chromium, id: 11 }, { ...chromium, id: 12, element: "Ni" }],
    });
    mount(<CompositionEditor materialId={7} entries={[{ ...chromium, id: 11 }]} onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: t.addElement }));
    const [, element] = screen.getAllByRole("textbox", { name: t.element });
    await userEvent.type(element!, "Ni");
    await userEvent.click(screen.getByRole("button", { name: t.saveRow(2) }));
    await waitFor(() => expect(api.addMaterialCompositionEntry).toHaveBeenCalled());
    const [, payload] = api.addMaterialCompositionEntry.mock.calls[0]!;
    expect(payload).toMatchObject({ element: "Ni", data_quality: "IMPORTADO", source_label: "Fonte A" });
  });

  it("removes a stored row only after confirmation", async () => {
    mount(<CompositionEditor materialId={7} entries={[{ ...chromium, id: 11 }]} onDone={vi.fn()} />);
    await userEvent.click(
      screen.getByRole("button", { name: `${ptBR.actions.remove}: ${t.rowLabel(1)}` }),
    );
    expect(api.deleteMaterialCompositionEntry).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: ptBR.actions.remove }),
    );
    await waitFor(() => expect(api.deleteMaterialCompositionEntry).toHaveBeenCalledWith(7, 11));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: t.element })).toBeNull());
  });
});

describe("edição das designações (TM2-a)", () => {
  it("sends the code as typed with its source", async () => {
    mount(
      <DesignationEditor
        materialId={7}
        designations={[
          { system: "UNS", system_label: "UNS", code: "S30400", region: null, source_label: "Norma Y", citation: null, is_demo: false },
        ]}
        onDone={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    await waitFor(() =>
      expect(api.replaceMaterialDesignations).toHaveBeenCalledWith(7, [
        { system: "UNS", code: "S30400", region: null, source_label: "Norma Y", citation: null },
      ]),
    );
  });
});
