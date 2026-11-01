import { describe, expect, it } from "vitest";
import { fireEvent, act } from "@testing-library/react";
import { renderWithQuery as render } from "@/lib/testing/queryWrapper";
import { screen } from "shadow-dom-testing-library";
import { ComparisonView, type ComparisonMode } from "./ComparisonView";
import { ptBR } from "@/lib/i18n";
import { allowLoadedRunner } from "@/lib/testing/loadedRunner";
import type { CompareAxis, CompareCell, CompareMaterial, Comparison } from "@/lib/types";

allowLoadedRunner();

/*
 * D-187: the comparator no longer refuses a figure for having "too many"
 * materials. These tests build a whole selection (200 and 600 materials over 15
 * properties, one material in ten with a missing value) and prove that Barras, Radar and
 * Paralelas draw all of it, that nothing is turned into a zero, and that the
 * render stays inside a time budget.
 */

const CLASSES = [
  ["metais", "Metais"],
  ["polimeros", "Polímeros"],
  ["ceramicas", "Cerâmicas"],
  ["compositos", "Compósitos"],
  ["elastomeros", "Elastômeros"],
] as const;
const PROPERTY_COUNT = 15;

function axis(i: number): CompareAxis {
  return {
    property_slug: `prop-${i}`,
    property_name: `Propriedade ${i}`,
    symbol: null,
    unit: "kg/m**3",
    category: "FISICA",
    better_direction: "HIGHER",
    allows_log_scale: false,
    min_value: 0,
    max_value: 1,
    present_count: 0,
    missing_material_ids: [],
  };
}

function cell(slug: string, normalized: number | null): CompareCell {
  return {
    display_unit: null,
    display_value: null,
    display_min: null,
    display_max: null,
    display_uncertainty: null,
    property_slug: slug,
    is_missing: normalized === null,
    value: normalized === null ? null : normalized * 100,
    normalized,
    value_min: null,
    value_max: null,
    original_value: null,
    original_unit: null,
    conversion_method: null,
    uncertainty: null,
    data_quality: "MEDIDO",
    difference_pct: null,
    difference_state: "sem_referencia",
    source_label: null,
    measurement_condition: null,
  };
}

/** `count` materials; one in ten has a gap (null) on one property, the rest a deterministic score. */
function makeSelection(count: number): Comparison {
  const properties = Array.from({ length: PROPERTY_COUNT }, (_, i) => axis(i));
  const materials: CompareMaterial[] = Array.from({ length: count }, (_, m) => {
    const klass = CLASSES[m % CLASSES.length] as (typeof CLASSES)[number];
    const cells = properties.map((p, i) => {
      const gap = m % 10 === 3 && i === m % PROPERTY_COUNT; // one in ten materials has one gap
      return cell(p.property_slug, gap ? null : ((m * 31 + i * 17) % 101) / 100);
    });
    return {
      material_id: m + 1,
      name: `Material ${m + 1}`,
      class_name: klass[1],
      class_slug: klass[0],
      is_demo: true,
      cells,
      complete: cells.every((c) => c.normalized !== null),
    };
  });
  return { normalization: "minmax", properties, materials, notes: [] };
}

function figureOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg[data-chart-figure]");
  if (!svg) throw new Error("the figure was not drawn");
  return svg as SVGSVGElement;
}

const BUDGET_MS = 6000; // jsdom, shared runner: a ceiling for a hang, not a benchmark.

describe.each([200, 600])("ComparisonView with %i materials (D-187)", (count) => {
  const comparison = makeSelection(count);

  it("draws the bars for the whole selection, as thin bars in a scroll box", () => {
    const started = performance.now();
    const { container } = render(<ComparisonView comparison={comparison} mode="bars" />);
    const elapsed = performance.now() - started;
    console.info(`[perf] bars ${count} materiais x ${PROPERTY_COUNT}: ${elapsed.toFixed(0)} ms`);

    const svg = figureOf(container);
    // One bar (or hatched gap) per material per property: nothing dropped.
    const bars = svg.querySelectorAll("g > g > rect:not(.chart-track)");
    expect(bars.length).toBe(count * PROPERTY_COUNT);
    // A tall plot, scrolling in its own region, with a minimum thickness.
    expect(Number(svg.getAttribute("height"))).toBeGreaterThan(count * PROPERTY_COUNT * 3);
    expect(container.querySelector(".chart-scroll-frame")).not.toBeNull();
    expect(Number((bars[0] as SVGRectElement).getAttribute("height"))).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/só é desenhada com até/)).not.toBeInTheDocument();
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("draws every complete material on the radar", () => {
    const started = performance.now();
    const { container } = render(<ComparisonView comparison={comparison} mode="radar" />);
    const elapsed = performance.now() - started;
    console.info(`[perf] radar ${count} materiais x ${PROPERTY_COUNT}: ${elapsed.toFixed(0)} ms`);

    const complete = comparison.materials.filter((m) => m.complete).length;
    expect(complete).toBeGreaterThan(0);
    const polygons = figureOf(container).querySelectorAll("polygon.chart-dense-line");
    expect(polygons.length).toBe(complete);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("draws one line per material on the parallel coordinates, a gap breaking it", () => {
    const started = performance.now();
    const { container } = render(<ComparisonView comparison={comparison} mode="parallel" />);
    const elapsed = performance.now() - started;
    console.info(`[perf] paralelas ${count} materiais x ${PROPERTY_COUNT}: ${elapsed.toFixed(0)} ms`);

    const svg = figureOf(container);
    const lines = svg.querySelectorAll("polyline.chart-dense-line");
    // A material with a gap contributes more than one run, so at least one line each.
    expect(lines.length).toBeGreaterThanOrEqual(count);
    // The plot grows with the count.
    expect(Number(svg.getAttribute("height"))).toBeGreaterThan(340);
    expect(elapsed).toBeLessThan(BUDGET_MS);
  });

  it("still draws the heatmap, and no mode shows a refusal", () => {
    for (const mode of ["bars", "radar", "parallel", "heatmap"] as ComparisonMode[]) {
      const { container, unmount } = render(<ComparisonView comparison={comparison} mode={mode} />);
      expect(figureOf(container)).toBeTruthy();
      expect(container.textContent).not.toMatch(/só é desenhada com até/);
      unmount();
    }
  });
});

describe("the dense figures keep the project's promises", () => {
  const comparison = makeSelection(200);

  it("never turns a gap into a zero: a missing score is a hatched mark, not a bar of width 2", () => {
    const { container } = render(<ComparisonView comparison={comparison} mode="bars" />);
    const gaps = comparison.materials.reduce(
      (sum, m) => sum + m.cells.filter((c) => c.normalized === null).length,
      0,
    );
    const hatched = Array.from(container.querySelectorAll("svg[data-chart-figure] rect")).filter((r) =>
      (r.getAttribute("style") ?? "").includes("url(#"),
    );
    expect(hatched.length).toBe(gaps);
  });

  it("walks the materials with the arrow keys and writes the one in focus", () => {
    const { container } = render(<ComparisonView comparison={comparison} mode="parallel" />);
    const svg = figureOf(container);
    expect(svg.getAttribute("tabindex")).toBe("0");
    expect(container.querySelector(".chart-readout")?.textContent).toBe(ptBR.chart.denseKeys);

    act(() => {
      fireEvent.keyDown(svg, { key: "ArrowRight" });
    });
    const first = container.querySelector(".chart-readout")?.textContent ?? "";
    expect(first).toContain("Material 1 ");
    act(() => {
      fireEvent.keyDown(svg, { key: "ArrowRight" });
    });
    expect(container.querySelector(".chart-readout")?.textContent).toContain("Material 2 ");
    // The one in focus is drawn again, on top, thick.
    expect(svg.querySelectorAll("polyline").length).toBeGreaterThan(200);
    expect(svg.getAttribute("data-focus")).toBe("true");
  });

  it("lists a long legend in its own scrolling box, with a way to hide or show all", () => {
    const { container } = render(<ComparisonView comparison={comparison} mode="parallel" />);
    expect(container.querySelector(".chart-legend-long")).not.toBeNull();
    const hideAll = screen.getByText(ptBR.chart.legendHideAll);
    act(() => {
      fireEvent.click(hideAll);
    });
    expect(figureOf(container).querySelectorAll("polyline.chart-dense-line").length).toBe(0);
    act(() => {
      fireEvent.click(screen.getByText(ptBR.chart.legendShowAll));
    });
    expect(figureOf(container).querySelectorAll("polyline.chart-dense-line").length).toBeGreaterThan(0);
  });

  it("keeps the first material of a class in the class look and varies the next ones", () => {
    const { container } = render(<ComparisonView comparison={comparison} mode="parallel" />);
    const colors = new Set(
      Array.from(container.querySelectorAll("polyline.chart-dense-line")).map(
        (line) => (line as SVGElement).style.stroke,
      ),
    );
    // Five classes, three tones each: more than five looks, so same-class lines differ.
    expect(colors.size).toBeGreaterThan(5);
  });

  it("draws the table in chunks of a hundred rows, and the button brings the rest", () => {
    const { container } = render(<ComparisonView comparison={comparison} mode="table" />);
    expect(container.querySelectorAll("tbody tr").length).toBe(100);
    act(() => {
      fireEvent.click(screen.getByShadowRole("button", { name: ptBR.compare.showAllRows }));
    });
    expect(container.querySelectorAll("tbody tr").length).toBe(200);
  });
});
