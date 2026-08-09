import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartToolbar } from "./ChartToolbar";
import { ptBR } from "@/lib/i18n";

const t = ptBR.chart;

/**
 * The toolbar is exercised without Plotly on purpose: the case worth pinning is
 * the one where there is no figure to export, and that is decided before the
 * library is ever loaded.
 */
describe("ChartToolbar", () => {
  it("says the export failed instead of doing nothing visible", async () => {
    const user = userEvent.setup();
    const target = createRef<HTMLDivElement>();
    render(
      <>
        <div ref={target} />
        <ChartToolbar target={target} fileName="mapa" />
      </>,
    );

    await user.click(screen.getByRole("button", { name: t.exportPng }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.exportError);
  });

  it("offers both formats under one labelled group", () => {
    const target = createRef<HTMLDivElement>();
    render(<ChartToolbar target={target} fileName="mapa" disabled />);

    const group = screen.getByRole("group", { name: t.toolbar });
    expect(group).toBeInTheDocument();
    // Disabled while the figure is empty: a button that can only fail is worse
    // than no button.
    for (const name of [t.exportPng, t.exportSvg]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
  });
});
