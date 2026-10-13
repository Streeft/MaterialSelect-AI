import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import type { CompositionEntry } from "@/lib/types";

const t = ptBR.detail.edit;

const api = vi.hoisted(() => ({
  replaceMaterialComposition: vi.fn(),
  replaceMaterialDesignations: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  replaceMaterialComposition: api.replaceMaterialComposition,
  replaceMaterialDesignations: api.replaceMaterialDesignations,
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

beforeEach(() => {
  api.replaceMaterialComposition.mockReset().mockResolvedValue({});
  api.replaceMaterialDesignations.mockReset().mockResolvedValue({});
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
        source_label: "Fonte A",
        citation: null,
        value_min: 16,
        value_max: 18.5,
        value_nominal: null,
        unit: "%",
      },
    ]);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("refuses a number it cannot read instead of sending it", async () => {
    mount(<CompositionEditor materialId={7} entries={[{ ...chromium, value_min: null }]} onDone={vi.fn()} />);
    await userEvent.type(screen.getByRole("textbox", { name: t.min }), "abc");
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent("número inválido");
    expect(api.replaceMaterialComposition).not.toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    api.replaceMaterialComposition.mockRejectedValue(new Error("Faixa invertida"));
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
