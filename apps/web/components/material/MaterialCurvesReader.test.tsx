import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fichaText } from "@/lib/i18n-ficha";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import {
  curveList,
  hysteresisList,
  hysteresisLoop,
  stressStrain,
} from "@/components/charts/curveFixtures";

const t = fichaText.curveValue;

const nav = vi.hoisted(() => ({ query: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/app/materiais/2",
}));

const api = vi.hoisted(() => ({
  listMaterialCurves: vi.fn(),
  getMaterialCurve: vi.fn(),
  getCurveValue: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  listMaterialCurves: api.listMaterialCurves,
  getMaterialCurve: api.getMaterialCurve,
  getCurveValue: api.getCurveValue,
}));

const { MaterialCurves } = await import("./MaterialCurves");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MaterialCurves materialId={2} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nav.query = "";
  api.listMaterialCurves.mockReset();
  api.getMaterialCurve.mockReset();
  api.getCurveValue.mockReset();
});

describe("MaterialCurves: reading a value and the path's direction on the sheet", () => {
  it("offers the reader under the figure of a function curve", async () => {
    api.listMaterialCurves.mockResolvedValue(curveList);
    api.getMaterialCurve.mockResolvedValue(stressStrain);
    mount();
    await screen.findByRole("figure");
    expect(screen.getByRole("heading", { name: t.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.submit })).toBeInTheDocument();
  });

  it("reads through the backend and shows nothing before the reader asks", async () => {
    api.listMaterialCurves.mockResolvedValue(curveList);
    api.getMaterialCurve.mockResolvedValue(stressStrain);
    api.getCurveValue.mockResolvedValue({
      curve_id: 11,
      material_id: 2,
      title: stressStrain.title,
      rule: "Regra do servidor.",
      at: 0.1,
      at_unit: "%",
      at_unit_label: "%",
      x_quantity_label: "Deformação",
      y_quantity_label: "Tensão",
      y_unit: "MPa",
      y_unit_label: "MPa",
      parameter_unit_label: "°C",
      found_count: 2,
      series: stressStrain.series.map((s) => ({
        series_id: s.id,
        label: null,
        conditions: null,
        parameter_value: s.parameter_value,
        parameter_original: s.parameter_original,
        parameter_original_unit: s.parameter_original_unit,
        found: true,
        position: 1,
        x_original: 0.1,
        y: s.points[1]!.y,
        y_min: null,
        y_max: null,
        y_original: s.points[1]!.y_original,
        y_min_original: null,
        y_max_original: null,
        absence: null,
      })),
      source_label: "Dataset Demo MaterialSelect",
      citation: null,
      is_demo: true,
    });
    const { container } = mount();
    await screen.findByRole("figure");
    expect(container.querySelector("[data-curve-value='result']")).toBeNull();
    expect(api.getCurveValue).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "0,1");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(await screen.findByText("205 MPa")).toBeInTheDocument();
    expect(screen.getByText("185 MPa")).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("shows the hysteresis example with its direction and the written reason, no reader", async () => {
    api.listMaterialCurves.mockResolvedValue(hysteresisList);
    api.getMaterialCurve.mockResolvedValue(hysteresisLoop);
    const { container } = mount();
    await waitFor(() => expect(container.querySelector("[data-curve-start]")).not.toBeNull());
    expect(container.querySelectorAll("[data-curve-arrow]").length).toBeGreaterThan(0);
    expect(screen.getByText(t.pathReason)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.submit })).toBeNull();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
