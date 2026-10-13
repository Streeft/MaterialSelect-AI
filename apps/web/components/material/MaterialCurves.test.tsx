import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { curveList, emptyCurveList, stressStrain } from "@/components/charts/curveFixtures";

const t = ptBR.curves;

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/app/materiais/2",
}));

const api = vi.hoisted(() => ({
  listMaterialCurves: vi.fn(),
  getMaterialCurve: vi.fn(),
}));
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ApiError: actual.ApiError,
    curveExportUrl: actual.curveExportUrl,
    listMaterialCurves: api.listMaterialCurves,
    getMaterialCurve: api.getMaterialCurve,
  };
});

const { MaterialCurves } = await import("./MaterialCurves");
const { ApiError } = await import("@/lib/api");

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
  nav.replace.mockReset();
  api.listMaterialCurves.mockReset();
  api.getMaterialCurve.mockReset();
});

describe("MaterialCurves (D-106)", () => {
  it("says it is loading", () => {
    api.listMaterialCurves.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByText(t.loading)).toBeInTheDocument();
  });

  it("says it failed, with a retry", async () => {
    api.listMaterialCurves.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByText(t.error)).toBeInTheDocument();
  });

  it("writes 'no curve' and the count per kind instead of an empty plot", async () => {
    api.listMaterialCurves.mockResolvedValue(emptyCurveList);
    const { container } = mount();
    expect(await screen.findByText(t.none)).toBeInTheDocument();
    expect(screen.getByText(t.kindCount("Fadiga (S–N)", 0))).toBeInTheDocument();
    expect(container.querySelector("svg[data-chart-figure]")).toBeNull();
    expect(api.getMaterialCurve).not.toHaveBeenCalled();
  });

  it("draws the first curve in the conventions, then puts a unit choice in the URL", async () => {
    api.listMaterialCurves.mockResolvedValue(curveList);
    api.getMaterialCurve.mockResolvedValue(stressStrain);
    const { container } = mount();
    await waitFor(() => expect(container.querySelectorAll("[data-curve-line]")).toHaveLength(2));
    expect(api.getMaterialCurve).toHaveBeenCalledWith(2, 11, {
      x: undefined,
      y: undefined,
      parameter: undefined,
      scale: undefined,
    });

    await userEvent.selectOptions(screen.getByLabelText(t.unitY("Tensão de engenharia")), "GPa");
    expect(nav.replace).toHaveBeenCalledWith("/app/materiais/2?curva=11&curva_y=GPa", {
      scroll: false,
    });
  });

  it("lets the reader choose the family parameter's unit, labelled, and puts it in the URL", async () => {
    api.listMaterialCurves.mockResolvedValue(curveList);
    api.getMaterialCurve.mockResolvedValue(stressStrain);
    mount();
    const select = await screen.findByLabelText(t.unitParameter("Temperatura"));
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(["degC", "K", "degF"]);
    await userEvent.selectOptions(select, "K");
    expect(nav.replace).toHaveBeenCalledWith("/app/materiais/2?curva=11&curva_param=K", {
      scroll: false,
    });
  });

  it("offers only the scales the backend lists, and puts the choice in the URL", async () => {
    api.listMaterialCurves.mockResolvedValue(curveList);
    api.getMaterialCurve.mockResolvedValue({ ...stressStrain, available_scales: ["linear", "log-y"] });
    mount();
    const select = await screen.findByLabelText(t.scale);
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(options).toEqual(["linear", "log-y"]);
    await userEvent.selectOptions(select, "log-y");
    expect(nav.replace).toHaveBeenCalledWith("/app/materiais/2?curva=11&curva_escala=log-y", {
      scroll: false,
    });
  });

  it("reads the choice back from the URL and asks the backend for it", async () => {
    nav.query = "curva=11&curva_y=GPa&curva_escala=log-x";
    api.listMaterialCurves.mockResolvedValue(curveList);
    api.getMaterialCurve.mockResolvedValue(stressStrain);
    mount();
    await waitFor(() =>
      expect(api.getMaterialCurve).toHaveBeenCalledWith(2, 11, {
        x: undefined,
        y: "GPa",
        parameter: undefined,
        scale: "log-x",
      }),
    );
  });

  it("shows the backend's refusal and clears a stale choice on retry", async () => {
    nav.query = "curva=11&curva_y=furlong";
    api.listMaterialCurves.mockResolvedValue(curveList);
    api.getMaterialCurve.mockRejectedValue(
      new ApiError("Unidade 'furlong' não é admitida no eixo y (Tensão).", 400),
    );
    mount();
    expect(await screen.findByText(/não é admitida no eixo y/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /tentar/i }));
    expect(nav.replace).toHaveBeenCalledWith("/app/materiais/2?curva=11", { scroll: false });
  });

  it("offers the points as CSV in the figure's Exportar menu", async () => {
    api.listMaterialCurves.mockResolvedValue(curveList);
    api.getMaterialCurve.mockResolvedValue(stressStrain);
    mount();
    await screen.findByRole("figure");
    await userEvent.click(screen.getByRole("button", { name: ptBR.chart.exportMenu }));
    const csv = screen.getByRole("menuitem", { name: new RegExp(t.exportCsv.replace(/[()]/g, "\\$&")) });
    expect(csv.getAttribute("href")).toMatch(/\/api\/exports\/materiais\/2\/curvas\/11\.csv$/);
  });

  it("passes axe with a curve drawn", async () => {
    api.listMaterialCurves.mockResolvedValue(curveList);
    api.getMaterialCurve.mockResolvedValue(stressStrain);
    const { container } = mount();
    await screen.findByRole("figure");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
