import { afterEach, describe, expect, it, vi } from "vitest";
import { exportFigure, figureMarkup } from "./figureExport";
import { DOWNLOAD_REVOKE_DELAY_MS, RasterizeError, type RasterizeDeps } from "./rasterize";

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
    // Well-formed: declared once (a duplicate `xmlns` fails to reparse).
    expect(markup.match(/ xmlns="/g)).toHaveLength(1);
    const reparsed = new DOMParser().parseFromString(markup, "image/svg+xml");
    expect(reparsed.getElementsByTagName("parsererror")).toHaveLength(0);
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

/**
 * `exportFigure` rasterises through `lib/rasterize.ts`, the one implementation
 * the Studio's PNG uses too. jsdom has no canvas nor `URL.createObjectURL`, so
 * the browser pieces are fakes; what is pinned is the behaviour the two copies
 * used to disagree on: 2× scale, the figure's background drawn as part of the
 * SVG, every object URL revoked, and a tainted canvas as a typed error.
 */
function fakeDeps(options: { toBlobError?: unknown } = {}) {
  const created: Blob[] = [];
  const revoked: string[] = [];
  const timers: Array<{ callback: () => void; ms: number }> = [];
  const canvases: Array<{ width: number; height: number }> = [];
  const deps: Partial<RasterizeDeps> = {
    loadImage: async () => ({}) as CanvasImageSource,
    createCanvas: (width, height) => {
      const canvas = {
        width,
        height,
        getContext: () => ({ drawImage: (() => undefined) as CanvasRenderingContext2D["drawImage"] }),
        toBlob: (callback: (blob: Blob | null) => void) => {
          if (options.toBlobError) throw options.toBlobError;
          callback(new Blob(["png"], { type: "image/png" }));
        },
      };
      canvases.push(canvas);
      return canvas;
    },
    createObjectURL: (blob) => {
      created.push(blob);
      return `blob:test/${created.length}`;
    },
    revokeObjectURL: (url) => {
      revoked.push(url);
    },
    setTimeout: (callback, ms) => {
      timers.push({ callback, ms });
      return 0;
    },
  };
  return { deps, created, revoked, timers, canvases };
}

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function captureClicks() {
  const clicks: Array<{ href: string; download: string }> = [];
  const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.getAttribute("href") ?? "", download: this.download });
  });
  return { clicks, restore: () => spy.mockRestore() };
}

describe("exportFigure", () => {
  it("rasterises the composed SVG at 2×, background included, and revokes both URLs", async () => {
    const container = mountCard();
    const { width, height } = await figureMarkup(container);
    const h = fakeDeps();
    const click = captureClicks();
    try {
      await exportFigure(container, "png", "cobertura", h.deps);
    } finally {
      click.restore();
    }

    expect(h.canvases.map(({ width: w, height: hh }) => ({ width: w, height: hh }))).toEqual([
      { width: width * 2, height: Math.floor(height * 2) },
    ]);
    // The SVG that was drawn carries the page's background as its first
    // rectangle: the PNG reads the same off the page, never transparent.
    const drawn = await blobText(h.created[0]!);
    expect(drawn).toMatch(/<rect x="0" y="0" width="400" height="[\d.]+" fill="rgb\(255, 255, 255\)"/);
    expect(click.clicks).toEqual([{ href: "blob:test/2", download: "cobertura.png" }]);
    expect(h.revoked).toEqual(["blob:test/1"]);
    expect(h.timers.map((timer) => timer.ms)).toEqual([DOWNLOAD_REVOKE_DELAY_MS]);
    h.timers[0]!.callback();
    expect(h.revoked).toEqual(["blob:test/1", "blob:test/2"]);
  });

  it("downloads the SVG through an object URL that is revoked afterwards", async () => {
    const h = fakeDeps();
    const click = captureClicks();
    try {
      await exportFigure(mountCard(), "svg", "cobertura", h.deps);
    } finally {
      click.restore();
    }

    expect(h.canvases).toHaveLength(0);
    expect(click.clicks).toEqual([{ href: "blob:test/1", download: "cobertura.svg" }]);
    expect(await blobText(h.created[0]!)).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<svg/);
    h.timers[0]!.callback();
    expect(h.revoked).toEqual(["blob:test/1"]);
  });

  it("turns a tainted canvas into a RasterizeError and downloads nothing", async () => {
    const h = fakeDeps({
      toBlobError: new DOMException("The canvas has been tainted.", "SecurityError"),
    });
    const click = captureClicks();
    let error: unknown;
    try {
      await exportFigure(mountCard(), "png", "cobertura", h.deps).catch((caught: unknown) => {
        error = caught;
      });
    } finally {
      click.restore();
    }

    expect(error).toBeInstanceOf(RasterizeError);
    expect(error).toMatchObject({ reason: "tainted" });
    expect(click.clicks).toHaveLength(0);
    expect(h.revoked).toEqual(["blob:test/1"]);
  });
});
