import { afterEach, describe, expect, it } from "vitest";
import { figureMarkup } from "./figureExport";

/**
 * The export composer, under jsdom. jsdom resolves no custom properties, so
 * the *colours* of an exported file are checked in the browser (D-80); what is
 * pinned here is the structure every file must have: the card's title, the
 * figure, the legend the page draws in HTML, and none of the page's own
 * interactive attributes.
 */
function mountCard(): HTMLElement {
  document.body.innerHTML = `
    <div class="msds-chart-card">
      <h2 class="msds-chart-title">Cobertura por classe</h2>
      <div id="figure">
        <svg data-chart-figure class="chart-svg" role="figure" aria-label="Figura" viewBox="0 0 400 120" width="400" height="120">
          <g class="chart-mark" role="img" tabindex="0" aria-label="Metais: 4">
            <rect x="10" y="10" width="100" height="20" style="fill: rgb(0, 114, 178)"></rect>
          </g>
          <text class="chart-label" x="5" y="50">Metais</text>
        </svg>
        <div class="msds-legend">
          <button class="msds-legend-item" data-off="false">
            <span class="msds-legend-swatch" data-legend-swatch="square" style="background: rgb(24, 128, 56)"></span>
            <span data-legend-label>Preenchido</span>
          </button>
          <button class="msds-legend-item" data-off="true">
            <span class="msds-legend-swatch" data-legend-swatch="square" style="background: rgb(95, 99, 104)"></span>
            <span data-legend-label>Declarado ausente</span>
          </button>
        </div>
      </div>
    </div>`;
  return document.getElementById("figure") as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("figureMarkup", () => {
  it("writes one standalone SVG with the title above and the legend below", async () => {
    const { markup, width, height } = await figureMarkup(mountCard());

    expect(markup.startsWith("<svg")).toBe(true);
    expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(width).toBe(400);
    // Title band + figure + legend band: taller than the figure alone.
    expect(height).toBeGreaterThan(120);
    expect(markup).toContain("Cobertura por classe");
    expect(markup).toContain("Preenchido");
  });

  it("leaves out the series the reader switched off", async () => {
    const { markup } = await figureMarkup(mountCard());

    expect(markup).not.toContain("Declarado ausente");
  });

  it("drops the page's interactive attributes from the figure", async () => {
    const { markup } = await figureMarkup(mountCard());

    expect(markup).not.toContain("tabindex");
    expect(markup).not.toContain('class="chart-mark"');
    // The mark's own words stay: a file opened in a screen reader still reads.
    expect(markup).toContain("Metais: 4");
  });

  it("fails loudly when there is no figure to export", async () => {
    const empty = document.createElement("div");
    await expect(figureMarkup(empty)).rejects.toThrow();
  });
});
