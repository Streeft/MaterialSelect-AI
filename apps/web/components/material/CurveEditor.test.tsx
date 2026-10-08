import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import type { CurveKindSpec } from "@/lib/types";

const t = ptBR.curves.edit;

const api = vi.hoisted(() => ({
  listCurveKinds: vi.fn(),
  createMaterialCurve: vi.fn(),
  replaceMaterialCurve: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  listCurveKinds: api.listCurveKinds,
  createMaterialCurve: api.createMaterialCurve,
  replaceMaterialCurve: api.replaceMaterialCurve,
}));

const { CurveEditor, parsePoints } = await import("./CurveEditor");

const units = (list: string[]) => list.map((unit) => ({ unit, label: unit }));
const specs: CurveKindSpec[] = [
  {
    kind: "TENSAO_DEFORMACAO",
    label: "Tensão–deformação",
    x_quantities: [{ key: "deformacao", name: "Deformação", reading_unit: "%", units: units(["%", "dimensionless"]) }],
    y_quantities: [{ key: "tensao", name: "Tensão", reading_unit: "MPa", units: units(["MPa", "GPa"]) }],
    parameter_quantities: [
      { key: "temperatura", name: "Temperatura", reading_unit: "degC", units: units(["degC", "K"]) },
    ],
  },
];

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CurveEditor materialId={3} onDone={vi.fn()} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.listCurveKinds.mockReset().mockResolvedValue(specs);
  api.createMaterialCurve.mockReset().mockResolvedValue({});
  api.replaceMaterialCurve.mockReset();
});

describe("parsePoints", () => {
  it("reads x; y with a decimal comma and the four-column band form", () => {
    expect(parsePoints("0; 0\n0,2; 400,5\n1,5; 520; 500; 540", 1)).toEqual({
      points: [
        { x: 0, y: 0 },
        { x: 0.2, y: 400.5 },
        { x: 1.5, y: 520, y_min: 500, y_max: 540 },
      ],
    });
  });

  it("does not sort, fill or drop: blank lines are skipped, a bad line is named", () => {
    expect(parsePoints("2 5\n\n1 3", 1)).toEqual({
      points: [
        { x: 2, y: 5 },
        { x: 1, y: 3 },
      ],
    });
    expect(parsePoints("1; 2\n3; abc", 2)).toEqual({ error: t.badLine(2, 2) });
    expect(parsePoints("1; 2; 3", 1)).toEqual({ error: t.badLine(1, 1) });
    expect(parsePoints("1; ", 1)).toEqual({ error: t.badLine(1, 1) });
  });
});

describe("CurveEditor (TM4-d)", () => {
  it("sends the points in the source's units and lets the server convert", async () => {
    mount();
    await userEvent.type(await screen.findByRole("textbox", { name: t.titleField }), "Tração");
    await userEvent.type(screen.getByRole("textbox", { name: t.source }), "Ensaio Z");
    await userEvent.type(screen.getByRole("textbox", { name: t.points }), "0; 0{Enter}0,2; 400");
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    await waitFor(() => expect(api.createMaterialCurve).toHaveBeenCalled());
    expect(api.createMaterialCurve).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        kind: "TENSAO_DEFORMACAO",
        title: "Tração",
        x_quantity: "deformacao",
        x_unit: "%",
        y_quantity: "tensao",
        y_unit: "MPa",
        parameter_quantity: null,
        source_label: "Ensaio Z",
        series: [
          {
            label: null,
            conditions: null,
            parameter: null,
            parameter_unit: null,
            points: [
              { x: 0, y: 0 },
              { x: 0.2, y: 400 },
            ],
          },
        ],
      }),
    );
  });

  it("names the wrong line instead of sending", async () => {
    mount();
    await userEvent.type(await screen.findByRole("textbox", { name: t.points }), "1; x");
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.badLine(1, 1));
    expect(api.createMaterialCurve).not.toHaveBeenCalled();
  });

  it("shows the server's refusal", async () => {
    api.createMaterialCurve.mockRejectedValue(new Error("x tem de crescer ao longo da série"));
    mount();
    await userEvent.type(await screen.findByRole("textbox", { name: t.points }), "1; 1{Enter}0; 2");
    await userEvent.click(screen.getByRole("button", { name: ptBR.actions.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent("x tem de crescer");
  });
});
