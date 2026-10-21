import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fichaText } from "@/lib/i18n-ficha";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { hysteresisLoop, stressStrain } from "@/components/charts/curveFixtures";
import type { CurveValue } from "@/lib/types";

const t = fichaText.curveValue;

const api = vi.hoisted(() => ({ getCurveValue: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getCurveValue: api.getCurveValue,
}));

const { CurveValueReader } = await import("./CurveValueReader");
const { ApiError } = await import("@/lib/api");

/** What the backend answers for x = 0,1 % on the two-temperature fixture. */
const ABSENCE = "Sem ponto declarado em 0,1 % nesta série; nada foi interpolado.";
function answer(overrides: Partial<CurveValue> = {}): CurveValue {
  return {
    curve_id: 11,
    material_id: 2,
    title: stressStrain.title,
    rule: "Só se lê o ponto que a fonte declarou exatamente neste valor de x; nada é interpolado, extrapolado nem reamostrado. Sem ponto declarado ali, o valor está ausente.",
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
      {
        series_id: 102,
        label: null,
        conditions: null,
        parameter_value: 300,
        parameter_original: 300,
        parameter_original_unit: "degC",
        found: false,
        position: null,
        x_original: null,
        y: null,
        y_min: null,
        y_max: null,
        y_original: null,
        y_min_original: null,
        y_max_original: null,
        absence: ABSENCE,
      },
    ],
    source_label: "Dataset Demo MaterialSelect",
    citation: null,
    is_demo: true,
    ...overrides,
  };
}

function mount(curve = stressStrain) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CurveValueReader curve={curve} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.getCurveValue.mockReset();
});

describe("CurveValueReader (TM4-b, D-110)", () => {
  it("asks the backend with the x typed, its unit and the figure's own reading units", async () => {
    api.getCurveValue.mockResolvedValue(answer());
    mount();
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "0,1");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    await waitFor(() => expect(api.getCurveValue).toHaveBeenCalledTimes(1));
    // "0,1" is 0.1: the pt-BR comma is only a way to type it. Y and the family
    // parameter go in the units the figure is drawn in.
    expect(api.getCurveValue).toHaveBeenCalledWith(2, 11, {
      at: 0.1,
      atUnit: "%",
      y: "MPa",
      parameter: "degC",
    });
  });

  it("lets the x unit be chosen among the axis' own and sends it", async () => {
    api.getCurveValue.mockResolvedValue(answer());
    mount();
    const select = screen.getByLabelText(t.fieldUnit);
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.value)).toEqual([
      "%",
      "dimensionless",
    ]);
    await userEvent.selectOptions(select, "dimensionless");
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "0.001");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    await waitFor(() =>
      expect(api.getCurveValue).toHaveBeenCalledWith(2, 11, expect.objectContaining({ at: 0.001, atUnit: "dimensionless" })),
    );
  });

  it("shows the value with its unit and the quality, and the absence written", async () => {
    api.getCurveValue.mockResolvedValue(answer());
    const { container } = mount();
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "0,1");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));

    const result = await waitFor(() => {
      const el = container.querySelector("[data-curve-value='result']");
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    expect(within(result).getByText("205 MPa")).toBeInTheDocument();
    expect(within(result).getByText(t.foundCount(1, 2, "0,1 %"))).toBeInTheDocument();
    // Quality of the curve and its source travel with the number.
    expect(within(result).getByText(ptBR.quality.ESTIMADO)).toBeInTheDocument();
    expect(within(result).getByText(ptBR.curves.source("Dataset Demo MaterialSelect"))).toBeInTheDocument();
    // The series without a declared point says so, in the backend's words, with
    // the "Ausente" badge — no number, no dash, no zero.
    const rows = within(result).getAllByRole("row");
    const absent = rows.find((row) => row.textContent?.includes(ABSENCE))!;
    expect(within(absent).getByText(ptBR.quality.AUSENTE)).toBeInTheDocument();
    // One cell holds the whole sentence: no value cell exists to show a zero.
    expect(absent.querySelectorAll("td")).toHaveLength(1);
    expect(absent.textContent).not.toMatch(/MPa/);
    // The rule is the backend's own sentence, repeated, not paraphrased here.
    expect(within(result).getByText(answer().rule, { exact: false })).toBeInTheDocument();
  });

  it("shows a declared band beside the value when the source gave one", async () => {
    const base = answer();
    api.getCurveValue.mockResolvedValue(
      answer({
        found_count: 1,
        series: [{ ...base.series[0]!, y: 185, y_min: 175, y_max: 195, y_original: 185 }],
      }),
    );
    mount();
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "0,1");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(await screen.findByText("175 – 195 MPa")).toBeInTheDocument();
  });

  it("refuses text that is not a number without asking the backend", async () => {
    mount();
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "vinte");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(await screen.findByText(t.invalidNumber)).toBeInTheDocument();
    expect(api.getCurveValue).not.toHaveBeenCalled();
  });

  it("refuses an empty field the same way — an empty x is not zero", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    expect(await screen.findByText(t.invalidNumber)).toBeInTheDocument();
    expect(api.getCurveValue).not.toHaveBeenCalled();
  });

  it("writes the backend's refusal", async () => {
    api.getCurveValue.mockRejectedValue(
      new ApiError("Unidade 'furlong' não é admitida no eixo x (Deformação).", 400),
    );
    mount();
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "1");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.error);
    expect(alert).toHaveTextContent(/não é admitida no eixo x/);
  });

  it("offers no form on a trajectory and writes the reason instead (D-118)", () => {
    const { container } = mount(hysteresisLoop);
    expect(screen.getByText(t.pathTitle)).toBeInTheDocument();
    expect(screen.getByText(t.pathReason)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.submit })).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(api.getCurveValue).not.toHaveBeenCalled();
  });

  it("starts clean for another curve", async () => {
    api.getCurveValue.mockResolvedValue(answer());
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (curve: typeof stressStrain) => (
      <QueryClientProvider client={client}>
        <CurveValueReader curve={curve} />
      </QueryClientProvider>
    );
    const { rerender } = render(view(stressStrain));
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "0,1");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    await screen.findByText("205 MPa");
    rerender(view({ ...stressStrain, id: 99 }));
    expect(screen.queryByText("205 MPa")).toBeNull();
    expect(screen.getByLabelText(t.fieldAt("Deformação de engenharia"))).toHaveValue("");
  });

  it("passes axe: form, result, error and trajectory note", async () => {
    api.getCurveValue.mockResolvedValue(answer());
    const { container, unmount } = mount();
    expect(await findA11yViolations(container), "form").toEqual([]);
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "0,1");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    await screen.findByText("205 MPa");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
    unmount();

    api.getCurveValue.mockRejectedValue(new ApiError("Falha escrita.", 422));
    const failed = mount();
    await userEvent.type(screen.getByLabelText(t.fieldAt("Deformação de engenharia")), "1");
    await userEvent.click(screen.getByRole("button", { name: t.submit }));
    await screen.findByRole("alert");
    expect(await findA11yViolations(failed.container), "error").toEqual([]);
    failed.unmount();

    const path = mount(hysteresisLoop);
    expect(await findA11yViolations(path.container), "path").toEqual([]);
  });
});
