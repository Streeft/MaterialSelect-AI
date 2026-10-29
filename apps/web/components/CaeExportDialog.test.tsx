import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Curve, CurveSummary, MaterialCurves } from "@materialselect/shared-types";
import { ApiError, type CaeFormat, type CaeFormatSpec } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { caeText } from "@/lib/i18n-cae";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { flowText } from "@/lib/i18n-flow";
import { DOWNLOAD_REVOKE_DELAY_MS } from "@/lib/rasterize";
import { CaeExportDialog, MaterialExportMenu } from "./CaeExportDialog";

/** C3: the default save keeps the object URL alive past the click (Safari/Firefox). */
async function expectDelayedRevoke(run: () => Promise<void>) {
  const create = vi.fn(() => "blob:fake");
  const revoke = vi.fn();
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const delayed: Array<() => void> = [];
  const realSetTimeout = window.setTimeout.bind(window);
  vi.spyOn(window, "setTimeout").mockImplementation(((cb: () => void, ms?: number) => {
    if (ms === DOWNLOAD_REVOKE_DELAY_MS) {
      delayed.push(cb);
      return 0;
    }
    return realSetTimeout(cb, ms);
  }) as never);
  await run();
  await vi.waitFor(() => expect(create).toHaveBeenCalled());
  expect(revoke).not.toHaveBeenCalled();
  expect(delayed).toHaveLength(1);
  delayed[0]!();
  expect(revoke).toHaveBeenCalledWith("blob:fake");
  vi.restoreAllMocks();
}


const t = ptBR.cae;
const x = caeText;

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

describe("MaterialExportMenu (D-104, D-124)", () => {
  it("is one Exportar menu whose entry opens the CAE dialog", async () => {
    const user = userEvent.setup();
    wrap(<MaterialExportMenu materialId={7} download={vi.fn()} saveFile={vi.fn()} loaders={loaders()} />);

    // One trigger, no row of buttons, and no dialog until asked for.
    const trigger = screen.getByRole("button", { name: ptBR.exports.title });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: new RegExp(t.menuItem) }));

    expect(await screen.findByText(t.title)).toBeInTheDocument();
    expect(screen.getByLabelText(t.formatLabel)).toBeInTheDocument();
    expect(screen.getByLabelText(t.unitsLabel)).toBeInTheDocument();
  });

  it("renders a link to the complete material sheet in HTML/PDF", async () => {
    const user = userEvent.setup();
    wrap(<MaterialExportMenu materialId={42} />);

    const trigger = screen.getByRole("button", { name: ptBR.exports.title });
    await user.click(trigger);

    const sheetItem = screen.getByRole("menuitem", {
      name: /Ficha técnica completa/,
    });
    expect(sheetItem).toHaveAttribute(
      "href",
      expect.stringContaining("/api/exports/materiais/42.html"),
    );
    expect(sheetItem).toHaveAttribute("target", "_blank");
    expect(sheetItem).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("includes unitChoices query param in material sheet export url (D-70)", async () => {
    const user = userEvent.setup();
    wrap(
      <MaterialExportMenu
        materialId={42}
        unitChoices={{ densidade: "g/cm**3" }}
      />,
    );

    const trigger = screen.getByRole("button", { name: ptBR.exports.title });
    await user.click(trigger);

    const sheetItem = screen.getByRole("menuitem", {
      name: /Ficha técnica completa/,
    });
    expect(sheetItem).toHaveAttribute(
      "href",
      expect.stringContaining("unidades=densidade%3Ag%2Fcm**3"),
    );
  });

  it("displays the hint for material sheet export", async () => {
    const user = userEvent.setup();
    wrap(<MaterialExportMenu materialId={42} />);

    const trigger = screen.getByRole("button", { name: ptBR.exports.title });
    await user.click(trigger);

    expect(screen.getByText(flowText.materialExport.sheetHint)).toBeInTheDocument();
  });
});

describe("CaeExportDialog (D-104)", () => {
  it("downloads the chosen format in the chosen unit system", async () => {
    const user = userEvent.setup();
    const blob = new Blob(["*MATERIAL"]);
    const download = vi.fn().mockResolvedValue({ blob, filename: "liga-abaqus.inp" });
    const saveFile = vi.fn();
    const onClose = vi.fn();
    wrap(
      <CaeExportDialog
        materialId={42}
        open
        onClose={onClose}
        download={download}
        saveFile={saveFile}
        loaders={loaders()}
      />,
    );

    await user.selectOptions(screen.getByLabelText(t.formatLabel), "abaqus");
    await user.selectOptions(screen.getByLabelText(t.unitsLabel), "in-lbf-s");
    // The one primary action of the dialog.
    await user.click(screen.getByRole("button", { name: t.download }));

    expect(download).toHaveBeenCalledWith(42, "abaqus", "in-lbf-s");
    await vi.waitFor(() => expect(saveFile).toHaveBeenCalledWith(blob, "liga-abaqus.inp"));
    expect(onClose).toHaveBeenCalled();
  });

  it("revokes the object URL only after the download delay (C3)", async () => {
    const user = userEvent.setup();
    const download = vi.fn().mockResolvedValue({ blob: new Blob(["x"]), filename: "a.inp" });
    await expectDelayedRevoke(async () => {
      wrap(<CaeExportDialog materialId={42} open onClose={vi.fn()} download={download} loaders={loaders()} />);
      await user.selectOptions(screen.getByLabelText(t.formatLabel), "abaqus");
      await user.selectOptions(screen.getByLabelText(t.unitsLabel), "in-lbf-s");
      await user.click(screen.getByRole("button", { name: t.download }));
    });
  });

  it("offers every format and every unit system, with no automatic system", () => {
    wrap(<CaeExportDialog materialId={1} open onClose={vi.fn()} download={vi.fn()} loaders={loaders()} />);
    const formats = Array.from(
      (screen.getByLabelText(t.formatLabel) as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(formats).toEqual([
      "mapdl",
      "abaqus",
      "nastran",
      "lsdyna",
      "matml",
      "nastran-thermal",
      "lsdyna-thermal",
      "mapdl-plastic",
      "abaqus-plastic",
      "nastran-plastic",
      "lsdyna-plastic",
    ]);
    const systems = Array.from(
      (screen.getByLabelText(t.unitsLabel) as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(systems).toEqual(["m-kg-s", "mm-t-s", "in-lbf-s"]);
  });

  it("shows the server's refusal and stays open so another format can be tried", async () => {
    const user = userEvent.setup();
    const detail =
      "Não é possível gerar o cartão Abaqus: falta coeficiente de Poisson no cadastro deste material.";
    const download = vi.fn().mockRejectedValue(new ApiError(detail, 422));
    const onClose = vi.fn();
    const saveFile = vi.fn();
    wrap(
      <CaeExportDialog
        materialId={3}
        open
        onClose={onClose}
        download={download}
        saveFile={saveFile}
        loaders={loaders()}
      />,
    );

    await user.click(screen.getByRole("button", { name: t.download }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.refusedTitle);
    expect(alert).toHaveTextContent("coeficiente de Poisson");
    expect(onClose).not.toHaveBeenCalled();
    expect(saveFile).not.toHaveBeenCalled();

    // Changing the format clears the stale refusal.
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "matml");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names any other failure as an error, not a refusal", async () => {
    const user = userEvent.setup();
    const download = vi.fn().mockRejectedValue(new ApiError("Falha de rede", 500));
    wrap(<CaeExportDialog materialId={3} open onClose={vi.fn()} download={download} loaders={loaders()} />);
    await user.click(screen.getByRole("button", { name: t.download }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.errorTitle);
    expect(alert).not.toHaveTextContent(t.refusedTitle);
  });
});

// --- Thermal and elastoplastic formats (D-112, D-119, D-171) ----------------

const REQUIRED = {
  young: { key: "young", label: "módulo de Young" },
  poisson: { key: "poisson", label: "coeficiente de Poisson" },
  density: { key: "density", label: "densidade" },
  conductivity: { key: "conductivity", label: "condutividade térmica" },
  heat: { key: "specific_heat", label: "calor específico" },
};

function spec(
  key: CaeFormat,
  required: { key: string; label: string }[],
  plastic = false,
  maxPoints: number | null = null,
): CaeFormatSpec {
  return { key, label: key, plastic, required, plastic_max_points: maxPoints };
}

const SPECS: CaeFormatSpec[] = [
  spec("mapdl", [REQUIRED.young, REQUIRED.poisson]),
  spec("abaqus", [REQUIRED.young, REQUIRED.poisson]),
  spec("nastran", [REQUIRED.young, REQUIRED.poisson]),
  spec("lsdyna", [REQUIRED.density, REQUIRED.young, REQUIRED.poisson]),
  spec("matml", []),
  spec("nastran-thermal", [REQUIRED.conductivity, REQUIRED.heat]),
  spec("lsdyna-thermal", [REQUIRED.heat, REQUIRED.conductivity]),
  spec("mapdl-plastic", [REQUIRED.young, REQUIRED.poisson], true, 100),
  spec("abaqus-plastic", [REQUIRED.young, REQUIRED.poisson], true),
  spec("nastran-plastic", [REQUIRED.young, REQUIRED.poisson], true),
  spec("lsdyna-plastic", [REQUIRED.density, REQUIRED.young, REQUIRED.poisson], true),
];

function summary(id: number, title: string, seriesCount: number, kind = "TENSAO_DEFORMACAO") {
  return { id, kind, title, series_count: seriesCount } as unknown as CurveSummary;
}

function curveList(...curves: CurveSummary[]): MaterialCurves {
  return { material_id: 7, material_name: "Liga", total: curves.length, counts_by_kind: [], curves };
}

const familyCurve = {
  id: 11,
  parameter: { unit_label: "°C" },
  series: [
    { id: 1, position: 0, label: null, parameter_value: 20 },
    { id: 2, position: 1, label: "Recozido", parameter_value: 200 },
  ],
} as unknown as Curve;

function loaders(overrides: Record<string, unknown> = {}) {
  return {
    formats: vi.fn().mockResolvedValue(SPECS),
    curves: vi.fn().mockResolvedValue(curveList(summary(11, "Tração por temperatura", 2))),
    curve: vi.fn().mockResolvedValue(familyCurve),
    ...overrides,
  };
}

function open(
  load: ReturnType<typeof loaders>,
  download = vi.fn().mockResolvedValue({ blob: new Blob(["x"]), filename: "m.inp" }),
  onClose = vi.fn(),
) {
  wrap(
    <CaeExportDialog
      materialId={7}
      open
      onClose={onClose}
      download={download}
      saveFile={vi.fn()}
      loaders={load}
    />,
  );
  return { download, onClose };
}

describe("CaeExportDialog: thermal formats (D-112, D-171)", () => {
  it("writes what the server says the thermal format requires, with no curve to choose", async () => {
    const user = userEvent.setup();
    const { download } = open(loaders());
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "nastran-thermal");

    expect(
      await screen.findByText(
        x.requirements.some("condutividade térmica, calor específico"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(x.curve.label)).toBeNull();

    await user.click(screen.getByRole("button", { name: t.download }));
    expect(download).toHaveBeenCalledWith(7, "nastran-thermal", "mm-t-s");
  });

  it("says MatML requires nothing beyond what is registered", async () => {
    const user = userEvent.setup();
    open(loaders());
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "matml");
    expect(await screen.findByText(x.requirements.none)).toBeInTheDocument();
  });

  it("shows the server's 422 for a thermal card the record cannot fill, and stays open", async () => {
    const user = userEvent.setup();
    const detail =
      "Não é possível gerar o cartão Nastran (MAT4): falta calor específico no cadastro deste material.";
    const download = vi.fn().mockRejectedValue(new ApiError(detail, 422));
    const { onClose } = open(loaders(), download);
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "lsdyna-thermal");
    await user.click(screen.getByRole("button", { name: t.download }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.refusedTitle);
    expect(alert).toHaveTextContent("falta calor específico");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("passes axe with a thermal format chosen", async () => {
    const user = userEvent.setup();
    open(loaders());
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "lsdyna-thermal");
    await screen.findByText(x.requirements.some("calor específico, condutividade térmica"));
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("CaeExportDialog: elastoplastic formats (D-119, D-171)", () => {
  it("never picks the curve or the series, and sends both when named", async () => {
    const user = userEvent.setup();
    const { download } = open(loaders());
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "abaqus-plastic");

    // Nothing chosen: the card is not offered, and the page says what is missing.
    const curve = await screen.findByLabelText(x.curve.label);
    expect((curve as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("button", { name: t.download })).toBeDisabled();
    expect(screen.getByText(x.curve.chooseFirst)).toBeInTheDocument();
    expect(screen.getByText(x.requirements.plasticExtra)).toBeInTheDocument();

    await user.selectOptions(curve, "11");
    const series = await screen.findByLabelText(x.series.label);
    expect((series as HTMLSelectElement).value).toBe("");
    const options = Array.from((series as HTMLSelectElement).options).map((o) => o.text);
    expect(options).toEqual([x.series.placeholder, "Série 1 (20 °C)", "Recozido (200 °C)"]);
    expect(screen.getByRole("button", { name: t.download })).toBeDisabled();
    expect(screen.getByText(x.series.chooseFirst)).toBeInTheDocument();

    await user.selectOptions(series, "1");
    await user.click(screen.getByRole("button", { name: t.download }));
    expect(download).toHaveBeenCalledWith(7, "abaqus-plastic", "mm-t-s", { curve: 11, series: 1 });
  });

  it("leaves `serie` out when the curve has a single series", async () => {
    const user = userEvent.setup();
    const load = loaders({
      curves: vi.fn().mockResolvedValue(curveList(summary(5, "Curva única", 1))),
    });
    const { download } = open(load);
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "lsdyna-plastic");
    await user.selectOptions(await screen.findByLabelText(x.curve.label), "5");

    expect(screen.getByText(x.series.single)).toBeInTheDocument();
    expect(screen.queryByLabelText(x.series.label)).toBeNull();
    expect(load.curve).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: t.download }));
    expect(download).toHaveBeenCalledWith(7, "lsdyna-plastic", "mm-t-s", { curve: 5 });
  });

  it("offers only stress-strain curves", async () => {
    const user = userEvent.setup();
    open(
      loaders({
        curves: vi
          .fn()
          .mockResolvedValue(
            curveList(summary(1, "Fadiga", 1, "FADIGA"), summary(2, "Tração", 1)),
          ),
      }),
    );
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "mapdl-plastic");
    const curve = await screen.findByLabelText(x.curve.label);
    expect(Array.from((curve as HTMLSelectElement).options).map((o) => o.value)).toEqual(["", "2"]);
    expect(screen.getByText(x.requirements.maxPoints("100"))).toBeInTheDocument();
  });

  it("writes that the material has no stress-strain curve, and offers nothing to download", async () => {
    const user = userEvent.setup();
    const { download } = open(
      loaders({ curves: vi.fn().mockResolvedValue(curveList(summary(1, "Fadiga", 1, "FADIGA"))) }),
    );
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "nastran-plastic");

    expect(await screen.findByText(x.curve.noneTitle)).toBeInTheDocument();
    expect(screen.getByText(x.curve.noneBody)).toBeInTheDocument();
    expect(screen.queryByLabelText(x.curve.label)).toBeNull();
    expect(screen.getByRole("button", { name: t.download })).toBeDisabled();
    expect(download).not.toHaveBeenCalled();
  });

  it("shows the server's 422 in writing for a curve that cannot become a table", async () => {
    const user = userEvent.setup();
    const detail =
      "Não é possível gerar o cartão Abaqus de “Liga” com a curva “Tração por temperatura”: a curva não declara se é de engenharia ou verdadeira.";
    const download = vi.fn().mockRejectedValue(new ApiError(detail, 422));
    const { onClose } = open(loaders(), download);
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "abaqus-plastic");
    await user.selectOptions(await screen.findByLabelText(x.curve.label), "11");
    await user.selectOptions(await screen.findByLabelText(x.series.label), "0");
    await user.click(screen.getByRole("button", { name: t.download }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.refusedTitle);
    expect(alert).toHaveTextContent("não declara se é de engenharia ou verdadeira");
    expect(onClose).not.toHaveBeenCalled();
    // Moving to another series clears the stale refusal.
    await user.selectOptions(screen.getByLabelText(x.series.label), "1");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows loading while the curves are read, with nothing to download", async () => {
    const user = userEvent.setup();
    open(loaders({ curves: vi.fn(() => new Promise(() => {})) }));
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "abaqus-plastic");
    expect(await screen.findByText(x.curve.loading)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.download })).toBeDisabled();
  });

  it("names the curves failure and reads them again on retry", async () => {
    const user = userEvent.setup();
    const curves = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("Falha de rede", 500))
      .mockResolvedValue(curveList(summary(11, "Tração", 1)));
    open(loaders({ curves }));
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "abaqus-plastic");

    expect(await screen.findByText(x.curve.errorTitle)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: ptBR.ui.retry }));
    expect(await screen.findByLabelText(x.curve.label)).toBeInTheDocument();
    expect(curves).toHaveBeenCalledTimes(2);
  });

  it("passes axe with a curve and a series to choose", async () => {
    const user = userEvent.setup();
    open(loaders());
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "mapdl-plastic");
    await user.selectOptions(await screen.findByLabelText(x.curve.label), "11");
    await screen.findByLabelText(x.series.label);
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("passes axe in the no-curve refusal state", async () => {
    const user = userEvent.setup();
    open(loaders({ curves: vi.fn().mockResolvedValue(curveList()) }));
    await user.selectOptions(screen.getByLabelText(t.formatLabel), "mapdl-plastic");
    await screen.findByText(x.curve.noneTitle);
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("CaeExportDialog: what each format requires is read from the server (D-171)", () => {
  it("says it is reading while the list is on its way, and still offers the elastic card", async () => {
    const user = userEvent.setup();
    const { download } = open(loaders({ formats: vi.fn(() => new Promise(() => {})) }));
    expect(await screen.findByText(x.requirements.loading)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.download }));
    expect(download).toHaveBeenCalledWith(7, "mapdl", "mm-t-s");
  });

  it("names the failure, retries, and then writes the requirements", async () => {
    const user = userEvent.setup();
    const formats = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("Falha de rede", 500))
      .mockResolvedValue(SPECS);
    open(loaders({ formats }));

    expect(await screen.findByText(x.requirements.error)).toBeInTheDocument();
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);

    await user.click(screen.getByRole("button", { name: ptBR.ui.retry }));
    expect(
      await screen.findByText(x.requirements.some("módulo de Young, coeficiente de Poisson")),
    ).toBeInTheDocument();
  });

  it("passes axe in the loading state", async () => {
    open(loaders({ formats: vi.fn(() => new Promise(() => {})) }));
    await screen.findByText(x.requirements.loading);
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
