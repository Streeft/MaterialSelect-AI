import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fichaText } from "@/lib/i18n-ficha";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import {
  curveList,
  hysteresisList,
  hysteresisLoop,
  stressStrain,
} from "@/components/charts/curveFixtures";

const t = fichaText.curveValue;

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
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

const reading = {
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
  found_count: 1,
  series: [
    {
      series_id: 101,
      label: null,
      conditions: null,
      parameter_value: 20,
      parameter_original: 20,
      parameter_original_unit: "degC",
      found: true,
      position: 1,
      x_original: 0.1,
      y: 205,
      y_min: null,
      y_max: null,
      y_original: 205,
      y_min_original: null,
      y_max_original: null,
      absence: null,
    },
  ],
  source_label: "Dataset Demo MaterialSelect",
  citation: null,
  is_demo: true,
};

/** The query string of the last address the page asked the router for. */
function lastAddress(): URLSearchParams {
  const call = nav.replace.mock.calls[nav.replace.mock.calls.length - 1];
  const url = String(call?.[0] ?? "");
  return new URLSearchParams(url.includes("?") ? url.split("?")[1] : "");
}

beforeEach(() => {
  nav.query = "";
  nav.replace.mockReset();
  api.listMaterialCurves.mockReset();
  api.getMaterialCurve.mockReset();
  api.getCurveValue.mockReset();
  api.listMaterialCurves.mockResolvedValue(curveList);
  api.getMaterialCurve.mockResolvedValue(stressStrain);
  api.getCurveValue.mockResolvedValue(reading);
});

describe("MaterialCurves: o valor lido vai no endereço (D-175)", () => {
  it("ler um valor escreve a curva, o valor e a unidade no endereço", async () => {
    mount();
    await screen.findByRole("figure");
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "0,1");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const address = lastAddress();
    expect(address.get("curva")).toBe("11");
    expect(address.get("curva_valor")).toBe("0.1");
    expect(address.get("curva_valor_un")).toBe("%");
  });

  it("abre um link com o valor: campo preenchido, leitura feita, resultado na tela", async () => {
    nav.query = "curva=11&curva_valor=0.1&curva_valor_un=%25";
    const { container } = mount();

    expect(await screen.findByText("205 MPa")).toBeInTheDocument();
    expect(screen.getByLabelText(t.fieldAt("Deformação de engenharia"))).toHaveValue("0,1");
    expect(api.getCurveValue).toHaveBeenCalledTimes(1);
    expect(api.getCurveValue).toHaveBeenCalledWith(
      2,
      11,
      expect.objectContaining({ at: 0.1, atUnit: "%" }),
    );
    expect(container.querySelector("[data-curve-value='result']")).not.toBeNull();
  });

  it("o valor do link sem `curva=` é o da curva que a tela mostra", async () => {
    nav.query = "curva_valor=0.1&curva_valor_un=%25";
    mount();
    expect(await screen.findByText("205 MPa")).toBeInTheDocument();
  });

  it("valor inválido no link: erro escrito, nenhuma leitura, e o valor sai do endereço", async () => {
    nav.query = "curva=11&curva_valor=abc&curva_valor_un=%25&nivel=2";
    const { container } = mount();

    expect(await screen.findByText(t.linkInvalidAt("abc"))).toBeInTheDocument();
    expect(api.getCurveValue).not.toHaveBeenCalled();
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const address = lastAddress();
    expect(address.has("curva_valor")).toBe(false);
    expect(address.has("curva_valor_un")).toBe(false);
    // What the page does not own stays.
    expect(address.get("curva")).toBe("11");
    expect(address.get("nivel")).toBe("2");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("trocar de curva tira o valor do endereço", async () => {
    nav.query = "curva=11&curva_valor=0.1&curva_valor_un=%25";
    api.listMaterialCurves.mockResolvedValue({
      ...curveList,
      curves: [curveList.curves[0]!, { ...curveList.curves[0]!, id: 12, title: "Outra" }],
    });
    mount();
    await screen.findByText("205 MPa");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: ptBR.curves.picker }), "12");

    const address = lastAddress();
    expect(address.get("curva")).toBe("12");
    expect(address.has("curva_valor")).toBe(false);
    expect(address.has("curva_valor_un")).toBe(false);
  });
});
