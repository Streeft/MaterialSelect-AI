import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { ChartFrame } from "./ChartFrame";
import { ChartLegend, LEGEND_LONG, type LegendItem } from "./ChartLegend";
import { tipValue } from "./ChartTooltip";
import { BoxPlotChart, type BoxRow } from "./BoxPlotChart";
import { FigureData } from "./FigureData";

const csv = vi.hoisted(() => ({ downloadCsv: vi.fn() }));
vi.mock("@/lib/figureCsv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/figureCsv")>()),
  downloadCsv: csv.downloadCsv,
}));

const t = ptBR.chart;

beforeEach(() => csv.downloadCsv.mockReset());

function items(n: number): LegendItem[] {
  return Array.from({ length: n }, (_, i) => ({
    key: String(i),
    label: `Material ${i}`,
    color: "rgb(var(--accent))",
  }));
}

function Legend({ n }: { n: number }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const list = items(n);
  return (
    <ChartLegend
      items={list}
      hidden={hidden}
      onToggle={(key) =>
        setHidden((cur) => {
          const next = new Set(cur);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        })
      }
      onIsolate={setHidden}
      onSetAll={(hide) => setHidden(hide ? new Set(list.map((i) => i.key)) : new Set())}
    />
  );
}

describe("legend: isolate and collapse (D-211)", () => {
  it("a click hides one series; Shift + click isolates it; again restores all", async () => {
    const user = userEvent.setup();
    render(<Legend n={3} />);
    const b = screen.getByRole("button", { name: "Material 1" });

    await user.click(b);
    expect(b).toHaveAttribute("aria-pressed", "false");
    await user.click(b);

    await user.keyboard("{Shift>}");
    await user.click(b);
    await user.keyboard("{/Shift}");
    expect(screen.getByRole("button", { name: "Material 0" })).toHaveAttribute("aria-pressed", "false");
    expect(b).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Material 2" })).toHaveAttribute("aria-pressed", "false");

    await user.keyboard("{Shift>}");
    await user.click(b);
    await user.keyboard("{/Shift}");
    expect(screen.getByRole("button", { name: "Material 0" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a long legend can be put away and brought back", async () => {
    const user = userEvent.setup();
    render(<Legend n={LEGEND_LONG + 5} />);
    const toggle = screen.getByRole("button", { name: t.legendCollapse(LEGEND_LONG + 5) });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: t.legendToggle })).toBeVisible();

    await user.click(toggle);
    const expand = screen.getByRole("button", { name: t.legendExpand(LEGEND_LONG + 5) });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: t.legendToggle })).toBeNull();

    await user.click(expand);
    expect(screen.getByRole("group", { name: t.legendToggle })).toBeVisible();
  });
});

describe("tipValue", () => {
  it("writes pt-BR with the unit and a written absence", () => {
    expect(tipValue(2.7, "g/cm**3")).toMatch(/^2,7 g\/cm/);
    expect(tipValue(null, "GPa")).toBe(ptBR.quality.AUSENTE);
    expect(tipValue(Number.NaN)).toBe(ptBR.quality.AUSENTE);
    expect(tipValue(1500)).toBe("1.500");
  });
});

describe("ChartFrame CSV (D-211)", () => {
  it("offers the table as CSV in the Exportar menu", async () => {
    const user = userEvent.setup();
    render(
      <ChartFrame
        title="Figura"
        exportName="figura"
        table={
          <FigureData
            caption="Dados"
            rows={[{ id: 1, name: "Aço", v: "7,85" }]}
            rowKey={(r) => r.id}
            rowHeader={{ header: "Material", cell: (r) => r.name }}
            columns={[{ key: "v", header: "Densidade", numeric: true, cell: (r) => r.v }]}
          />
        }
      >
        <svg data-chart-figure />
      </ChartFrame>,
    );
    await user.click(await screen.findByShadowRole("button", { name: t.exportMenu }));
    await user.click(await screen.findByShadowRole("menuitem", { name: new RegExp(`^${t.exportCsv}`) }));
    expect(csv.downloadCsv).toHaveBeenCalledTimes(1);
    const [text, name] = csv.downloadCsv.mock.calls[0] as [string, string];
    expect(name).toBe("figura");
    expect(text).toContain("Material;Densidade");
    expect(text).toContain("Aço;7,85");
  });

  it("has no axe violations with the legend and the menu", async () => {
    const { container } = render(
      <ChartFrame title="Figura" exportName="figura" footer={<Legend n={3} />}>
        <svg data-chart-figure role="img" aria-label="x" />
      </ChartFrame>,
    );
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("BoxPlotChart reads the domain from the API (ADR 0004)", () => {
  const rows: BoxRow[] = [
    { key: "a", label: "Metais", color: "rgb(var(--accent))", symbol: "circle", count: 2, minimum: 2, q1: 3, median: 4, q3: 5, maximum: 8 },
  ];
  const describe_ = (row: BoxRow) => ({ aria: row.label });

  it("draws the axis over the server's extent, not one it derived", () => {
    const { container } = render(
      <div style={{ width: 600 }}>
        <BoxPlotChart
          figureLabel="f"
          rows={rows}
          scale="linear"
          domains={{ linear: [0, 100], log: null }}
          axisTitle="Eixo"
          describe={describe_}
        />
      </div>,
    );
    const ticks = Array.from(container.querySelectorAll(".chart-tick")).map((n) => n.textContent);
    // The data end at 8; ticks reaching 100 can only come from the sent domain.
    expect(ticks.some((t) => t === "100")).toBe(true);
  });
});
