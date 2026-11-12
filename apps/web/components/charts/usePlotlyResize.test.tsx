import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { usePlotlyResize } from "./usePlotlyResize";

/**
 * D-226: a Plotly figure is an image to assistive technology, but its modebar is
 * made of buttons, which Plotly puts inside `.svg-container`. The image role goes
 * on the drawing layer, never on a node that also holds the modebar (axe
 * `nested-interactive`).
 */
function Figure({ label }: { label: string }) {
  const ref = usePlotlyResize<HTMLDivElement>(label);
  return (
    <div ref={ref} role="group" aria-label={label} data-testid="box">
      <div className="js-plotly-plot">
        <div className="plot-container">
          <div className="svg-container">
            <svg className="main-svg" data-testid="drawing" />
            <svg className="main-svg" data-testid="top-layer" />
            <div className="modebar-container">
              <button type="button" aria-label="Ampliar">
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

describe("usePlotlyResize: the figure's image role (D-226)", () => {
  it("puts role=img and the name on the drawing layer, apart from the modebar buttons", async () => {
    const { container } = render(<Figure label="Mapa de teste" />);
    const drawing = screen.getByTestId("drawing");
    expect(drawing).toHaveAttribute("role", "img");
    expect(drawing).toHaveAttribute("aria-label", "Mapa de teste");
    expect(screen.getByTestId("top-layer")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("box")).not.toHaveAttribute("role", "img");
    expect(drawing.querySelector("button")).toBeNull();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("labels a drawing that Plotly builds after the first render", async () => {
    render(<Figure label="Mapa de teste" />);
    const box = screen.getByTestId("box");
    const container = document.createElement("div");
    container.className = "svg-container";
    const late = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    late.setAttribute("class", "main-svg");
    container.appendChild(late);
    box.appendChild(container);
    await waitFor(() => expect(late).toHaveAttribute("role", "img"));
    expect(late).toHaveAttribute("aria-label", "Mapa de teste");
  });
});
