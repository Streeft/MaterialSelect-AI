import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithQuery as render } from "@/lib/testing/queryWrapper";
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import type { PropertyMap } from "@/lib/types";
import { AshbyMap } from "./AshbyMap";
import { pointerToData } from "./plotlyPointer";
import { exportFigure, figureMarkup, REPORT_FIGURE } from "@/lib/figureExport";
import { isBoxSelection, isDefaultMapState, DEFAULT_MAP_STATE, MAP_LIVE_URL } from "@/app/app/mapas/mapUrl";
import { readUrlState, writeUrlState } from "@/lib/urlState";

/**
 * D-213: the map's new interactions, against a stand-in Plotly that emits what
 * Plotly emits and reports what it was handed.
 */
vi.mock("react-plotly.js", () => ({
  default: (props: {
    data?: { name?: string; x?: unknown[]; customdata?: unknown[] }[];
    layout?: { dragmode?: unknown; uirevision?: string };
    onSelected?: (event: unknown) => void;
  }) => (
    <div
      data-testid="plotly-mock"
      data-dragmode={String(props.layout?.dragmode)}
      data-traces={JSON.stringify((props.data ?? []).map((trace) => trace.name ?? ""))}
    >
      <button
        type="button"
        data-testid="lasso"
        onClick={() =>
          props.onSelected?.({
            lassoPoints: { x: [0, 1], y: [0, 1] },
            points: [{ customdata: 1 }, { customdata: 0 }, { customdata: "level:0" }, { customdata: 1 }],
          })
        }
      />
    </div>
  ),
}));

vi.mock("./plotlyPointer", async (original) => {
  const actual = await original<typeof import("./plotlyPointer")>();
  return {
    ...actual,
    pointerToData: vi.fn((_graph: unknown, clientX: number, clientY: number) => ({
      x: clientX / 10,
      y: clientY,
    })),
  };
});

const c = ptBR.chart;

function makeMap(): PropertyMap {
  const point = (id: number, name: string, x: number, y: number) => ({
    material_id: id,
    material_name: name,
    class_name: "Metais",
    class_slug: "metais",
    is_demo: true,
    x,
    y,
    x_min: null,
    x_max: null,
    y_min: null,
    y_max: null,
    x_uncertainty: null,
    y_uncertainty: null,
    x_is_interval: false,
    y_is_interval: false,
    x_quality: "MEDIDO" as const,
    y_quality: "MEDIDO" as const,
    index_value: null,
    index_undefined_reason: null,
  });
  const axis = (slug: string, name: string) => ({
    is_index: false,
    property_slug: slug,
    property_name: name,
    expression: null,
    symbol: null,
    unit: "GPa",
    category: null,
    better_direction: "HIGHER" as const,
    allows_log_scale: true,
    min_value: 1,
    max_value: 10,
  });
  return {
    scale: "log",
    x_axis: axis("densidade", "Densidade"),
    y_axis: axis("modulo_young", "Módulo de Young"),
    points: [point(11, "Aço", 7.8, 200), point(12, "Alumínio", 2.7, 69)],
    envelopes: [],
    envelopes_alt: [],
    excluded: [],
    index: null,
    considered_count: 2,
    plotted_count: 2,
    notes: [],
  };
}

const line = {
  points: [
    [1, 10],
    [10, 1000],
  ],
  handle: [3.16, 100],
  label: "M = 2 (móvel)",
};

describe("AshbyMap — laço, anéis e linha móvel (D-213)", () => {
  it("o laço devolve os ids dos registros dentro dele, sem repetir e sem a linha de índice", async () => {
    const user = userEvent.setup();
    const onSelectPoints = vi.fn();
    render(<AshbyMap map={makeMap()} enableBoxSelect enableLasso onSelectPoints={onSelectPoints} />);
    await user.click(await screen.findByTestId("lasso"));
    expect(onSelectPoints).toHaveBeenCalledWith([12, 11]);
  });

  it("o cursor oferece caixa, laço, mover linha e navegar quando a página dá cada um", async () => {
    const user = userEvent.setup();
    render(
      <AshbyMap map={makeMap()} enableBoxSelect enableLasso movableLine={line} onDragLine={vi.fn()} />,
    );
    const group = screen.getByShadowRole("group", { name: c.dragMode });
    expect(within(group).getAllByShadowRole("button").map((b) => b.textContent)).toEqual([
      c.dragModeSelect,
      c.dragModeLasso,
      c.dragModeLine,
      c.dragModeZoom,
    ]);
    const mock = await screen.findByTestId("plotly-mock");
    await user.click(within(group).getByShadowRole("button", { name: c.dragModeLasso }));
    expect(mock).toHaveAttribute("data-dragmode", "lasso");
    await user.click(within(group).getByShadowRole("button", { name: c.dragModeLine }));
    // Moving the line takes the drag from Plotly: no zoom, no box.
    expect(mock).toHaveAttribute("data-dragmode", "false");
  });

  it("arrastar a linha diz à página onde está o ponteiro, e só isso", async () => {
    const user = userEvent.setup();
    const onDragLine = vi.fn();
    render(<AshbyMap map={makeMap()} enableBoxSelect movableLine={line} onDragLine={onDragLine} />);
    await screen.findByTestId("plotly-mock");
    await user.click(screen.getByShadowRole("button", { name: c.dragModeLine }));

    const surface = screen.getByTestId("line-drag-surface");
    fireEvent.pointerDown(surface, { clientX: 30, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(surface, { clientX: 40, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 50, clientY: 70, pointerId: 1 });
    // A move without a press is a hover, not a drag.
    fireEvent.pointerMove(surface, { clientX: 90, clientY: 90, pointerId: 1 });

    expect(onDragLine.mock.calls).toEqual([
      [{ x: 3, y: 50 }, "move"],
      [{ x: 4, y: 60 }, "move"],
      [{ x: 5, y: 70 }, "end"],
    ]);
  });

  it("desenha a linha móvel, a alça, os selecionados e o ponto em foco como camadas próprias", async () => {
    render(
      <AshbyMap
        map={makeMap()}
        enableBoxSelect
        selectedIds={[11]}
        activeId={12}
        movableLine={line}
        onDragLine={vi.fn()}
      />,
    );
    const traces = JSON.parse(
      (await screen.findByTestId("plotly-mock")).getAttribute("data-traces") ?? "[]",
    ) as string[];
    expect(traces).toEqual(expect.arrayContaining(["selection", "active", "M = 2 (móvel)", "handle"]));
    // And the legend names the movable line.
    expect(screen.getByShadowRole("button", { name: "M = 2 (móvel)" })).toBeInTheDocument();
  });

  it("a moldura oferece a figura para relatório quando a página pede", async () => {
    const user = userEvent.setup();
    render(<AshbyMap map={makeMap()} reportExport />);
    await user.click(screen.getByShadowRole("button", { name: c.exportMenu }));
    expect(await screen.findByShadowRole("menuitem", { name: new RegExp(c.exportReportPng) })).toBeInTheDocument();
    expect(screen.getByShadowRole("menuitem", { name: new RegExp(c.exportReportSvg) })).toBeInTheDocument();
  });
});

describe("pointerToData (D-213)", () => {
  it("usa a conversão do próprio eixo do Plotly a partir da área do gráfico", async () => {
    const { pointerToData: real } = await vi.importActual<typeof import("./plotlyPointer")>("./plotlyPointer");
    const graph = document.createElement("div") as HTMLElement & { _fullLayout?: unknown };
    graph.getBoundingClientRect = () => ({ left: 100, top: 50 }) as DOMRect;
    graph._fullLayout = {
      xaxis: { _offset: 76, _length: 400, p2d: (px: number) => 10 ** (px / 100) },
      yaxis: { _offset: 16, _length: 300, p2d: (py: number) => 300 - py },
    };
    expect(real(graph, 100 + 76 + 200, 50 + 16 + 100)).toEqual({ x: 100, y: 200 });
    // Outside the plotting area — on the margin with the tick labels — nothing.
    expect(real(graph, 100 + 10, 50 + 100)).toBeNull();
    expect(real(null, 0, 0)).toBeNull();
    expect(pointerToData).toBeDefined();
  });
});

describe("estado do mapa na URL (D-213)", () => {
  it("só aceita uma caixa com quatro limites numéricos ou abertos", () => {
    expect(isBoxSelection({ xMin: 1, xMax: null, yMin: 2, yMax: 3 })).toBe(true);
    expect(isBoxSelection({ xMin: null, xMax: null, yMin: null, yMax: null })).toBe(false);
    expect(isBoxSelection({ xMin: "1", xMax: 2, yMin: 2, yMax: 3 })).toBe(false);
    expect(isBoxSelection([1, 2, 3, 4])).toBe(false);
  });

  it("o mapa de chegada não suja o endereço, e o resto vai e volta", () => {
    expect(isDefaultMapState({ ...DEFAULT_MAP_STATE })).toBe(true);
    expect(isDefaultMapState({ ...DEFAULT_MAP_STATE, scale: "linear" })).toBe(false);

    const search = writeUrlState(MAP_LIVE_URL, "?nivel=2", {
      state: null,
      selection: [3, 4, 5, 9],
      box: { xMin: 1.5, xMax: null, yMin: null, yMax: 300 },
      line: 25000000,
      restrictMaterials: [],
    });
    const params = new URLSearchParams(search);
    expect(params.get("nivel")).toBe("2");
    expect(params.get("sel")).toBe("3-5,9");
    expect(params.get("estado")).toBeNull();
    expect(params.get("materiais")).toBeNull();
    const back = readUrlState(MAP_LIVE_URL, search);
    expect(back.selection).toEqual([3, 4, 5, 9]);
    expect(back.box).toEqual({ xMin: 1.5, xMax: null, yMin: null, yMax: 300 });
    expect(back.line).toBe(25000000);
    // A tampered level falls back to "no line", never to 0.
    expect(readUrlState(MAP_LIVE_URL, "?linha=abc").line).toBeNull();
  });
});

describe("figura para relatório (D-213)", () => {
  function mountCard(): HTMLElement {
    document.body.innerHTML = `
      <div class="msds-chart-card">
        <h2 class="msds-chart-title">Módulo de Young × Densidade</h2>
        <p data-chart-description>12 de 14 materiais plotados</p>
        <span data-chart-meta>guia: E / ρ</span>
        <div id="figure">
          <svg data-chart-figure viewBox="0 0 400 120" width="400" height="120"><rect x="1" y="1" width="5" height="5"></rect></svg>
        </div>
      </div>`;
    return document.getElementById("figure") as HTMLElement;
  }

  it("leva a descrição e o guia sob o título, que a figura comum não leva", async () => {
    const plain = await figureMarkup(mountCard());
    expect(plain.markup).not.toContain("12 de 14 materiais plotados");
    const report = await figureMarkup(mountCard(), { report: true });
    expect(report.markup).toContain("12 de 14 materiais plotados · guia: E / ρ");
    expect(report.height).toBeGreaterThan(plain.height);
  });

  it("rasteriza em 3× e nomeia o arquivo pelo que ele é", async () => {
    const canvases: { width: number; height: number }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    try {
      const container = mountCard();
      const { width } = await figureMarkup(container, { report: true });
      await exportFigure(
        container,
        "png",
        "mapa-relatorio",
        {
          loadImage: async () => ({}) as CanvasImageSource,
          createCanvas: (w, h) => {
            const canvas = {
              width: w,
              height: h,
              getContext: () => ({ drawImage: (() => undefined) as CanvasRenderingContext2D["drawImage"] }),
              toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(["png"])),
            };
            canvases.push(canvas);
            return canvas;
          },
          createObjectURL: () => "blob:test",
          revokeObjectURL: () => undefined,
          setTimeout: () => 0,
        },
        { report: true },
      );
      expect(canvases[0]?.width).toBe(width * REPORT_FIGURE.pngScale);
    } finally {
      click.mockRestore();
      document.body.innerHTML = "";
    }
  });
});
