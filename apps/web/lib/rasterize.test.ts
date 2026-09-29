import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DOWNLOAD_REVOKE_DELAY_MS,
  MAX_CANVAS_PIXELS,
  MAX_CANVAS_SIDE,
  RasterizeError,
  canvasSize,
  downloadBlob,
  fitScale,
  svgDimensions,
  svgToPngBlob,
  svgToPngDownload,
  type RasterCanvas,
  type RasterizeDeps,
} from "./rasterize";

/**
 * jsdom has no canvas, no image decoder and no `URL.createObjectURL`, so every
 * browser piece is a fake here. What is pinned: how the size is read, how the
 * scale is capped, that every object URL is revoked, how the download is
 * triggered, and that each failure surfaces as a `RasterizeError` with its
 * own reason.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

function root(attributes: Record<string, string>): Element {
  const element = document.createElementNS(SVG_NS, "svg");
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function svg(attributes: string): string {
  return `<svg xmlns="${SVG_NS}" ${attributes}><rect width="10" height="10"/></svg>`;
}

interface Harness {
  deps: RasterizeDeps;
  created: Blob[];
  revoked: string[];
  canvases: Array<RasterCanvas & { drawn?: [number, number] }>;
  loaded: string[];
  timers: Array<{ callback: () => void; ms: number }>;
  fetchCalls: Array<{ input: string; init?: RequestInit }>;
}

function harness(options: {
  response?: Response | (() => Promise<Response>);
  drawError?: unknown;
  toBlobError?: unknown;
  blob?: Blob | null;
  imageError?: unknown;
  noContext?: boolean;
} = {}): Harness {
  const created: Blob[] = [];
  const revoked: string[] = [];
  const canvases: Harness["canvases"] = [];
  const loaded: string[] = [];
  const timers: Harness["timers"] = [];
  const fetchCalls: Harness["fetchCalls"] = [];
  const png = options.blob === undefined ? new Blob(["png"], { type: "image/png" }) : options.blob;

  const deps: RasterizeDeps = {
    fetch: async (input, init) => {
      fetchCalls.push({ input, init });
      const response = options.response ?? new Response(svg('width="100" height="50"'), { status: 200 });
      return typeof response === "function" ? response() : response;
    },
    loadImage: async (src) => {
      loaded.push(src);
      if (options.imageError) throw options.imageError;
      return {} as CanvasImageSource;
    },
    createCanvas: (width, height) => {
      const canvas: Harness["canvases"][number] = {
        width,
        height,
        getContext: () =>
          options.noContext
            ? null
            : {
                drawImage: ((_image: CanvasImageSource, _x: number, _y: number, w: number, h: number) => {
                  if (options.drawError) throw options.drawError;
                  canvas.drawn = [w, h];
                }) as CanvasRenderingContext2D["drawImage"],
              },
        toBlob: (callback, type) => {
          if (options.toBlobError) throw options.toBlobError;
          expect(type).toBe("image/png");
          callback(png);
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
    document,
    setTimeout: (callback, ms) => {
      timers.push({ callback, ms });
      return 0;
    },
  };
  return { deps, created, revoked, canvases, loaded, timers, fetchCalls };
}

function securityError(): DOMException {
  return new DOMException("The canvas has been tainted by cross-origin data.", "SecurityError");
}

async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(RasterizeError);
    return (error as RasterizeError).reason;
  }
  throw new Error("expected a rejection");
}

/** jsdom's Blob has no `text()`; FileReader it is. */
function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("svgDimensions", () => {
  it("reads width and height attributes, with or without px", () => {
    expect(svgDimensions(root({ width: "640", height: "480px" }))).toEqual({ width: 640, height: 480 });
  });

  it("falls back to the viewBox when the attributes are missing", () => {
    expect(svgDimensions(root({ viewBox: "0 0 800 600" }))).toEqual({ width: 800, height: 600 });
  });

  it("accepts a comma-separated viewBox", () => {
    expect(svgDimensions(root({ viewBox: "10,20,300,150" }))).toEqual({ width: 300, height: 150 });
  });

  it("treats a percentage as absent and uses the viewBox", () => {
    expect(svgDimensions(root({ width: "100%", height: "100%", viewBox: "0 0 400 200" }))).toEqual({
      width: 400,
      height: 200,
    });
  });

  it("derives the missing side from the viewBox aspect ratio", () => {
    expect(svgDimensions(root({ width: "200", viewBox: "0 0 400 100" }))).toEqual({ width: 200, height: 50 });
    expect(svgDimensions(root({ height: "300", viewBox: "0 0 400 100" }))).toEqual({ width: 1200, height: 300 });
  });

  it("returns null when nothing names a size", () => {
    expect(svgDimensions(root({}))).toBeNull();
    expect(svgDimensions(root({ width: "0", height: "10" }))).toBeNull();
    expect(svgDimensions(root({ viewBox: "0 0 0 100" }))).toBeNull();
    expect(svgDimensions(root({ viewBox: "garbage" }))).toBeNull();
  });
});

describe("fitScale / canvasSize", () => {
  it("keeps the requested scale when the canvas fits", () => {
    expect(fitScale(800, 600, 2)).toBe(2);
    expect(canvasSize(800, 600, 2)).toEqual({ width: 1600, height: 1200, scale: 2 });
  });

  it("reduces the scale to stay under the iOS pixel budget", () => {
    const size = canvasSize(4000, 3000, 2);
    expect(size.scale).toBeLessThan(2);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  it("reduces the scale to respect the per-side ceiling", () => {
    const size = canvasSize(20_000, 100, 2);
    expect(size.width).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  it("never raises the scale", () => {
    expect(fitScale(10, 10, 1)).toBe(1);
  });
});

describe("svgToPngBlob", () => {
  it("draws the SVG at the scaled size and revokes its object URL", async () => {
    const h = harness();
    const blob = await svgToPngBlob(svg('width="100" height="50"'), 3, h.deps);
    expect(blob.type).toBe("image/png");
    expect(h.canvases[0]).toMatchObject({ width: 300, height: 150, drawn: [300, 150] });
    expect(h.loaded).toEqual(["blob:test/1"]);
    expect(h.revoked).toEqual(["blob:test/1"]);
    expect(h.created[0]?.type).toContain("image/svg+xml");
  });

  it("writes explicit width/height into an SVG that only has a viewBox", async () => {
    const h = harness();
    await svgToPngBlob(svg('viewBox="0 0 120 80"'), 1, h.deps);
    const markup = await blobText(h.created[0]!);
    expect(markup).toContain('width="120"');
    expect(markup).toContain('height="80"');
    expect(h.canvases[0]).toMatchObject({ width: 120, height: 80 });
  });

  it("caps the canvas of a very large SVG", async () => {
    const h = harness();
    await svgToPngBlob(svg('width="5000" height="4000"'), 2, h.deps);
    const canvas = h.canvases[0]!;
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(MAX_CANVAS_PIXELS);
  });

  it("refuses an SVG with no size", async () => {
    expect(await reasonOf(svgToPngBlob(svg(""), 2, harness().deps))).toBe("dimensions");
  });

  it("refuses a document that is not SVG", async () => {
    expect(await reasonOf(svgToPngBlob("<html><body>erro</body></html>", 2, harness().deps))).toBe("parse");
    expect(await reasonOf(svgToPngBlob("not xml at all <", 2, harness().deps))).toBe("parse");
  });

  it("maps a SecurityError from toBlob to reason 'tainted' and still revokes", async () => {
    const h = harness({ toBlobError: securityError() });
    expect(await reasonOf(svgToPngBlob(svg('width="10" height="10"'), 2, h.deps))).toBe("tainted");
    expect(h.revoked).toEqual(["blob:test/1"]);
  });

  it("maps a SecurityError from drawImage to reason 'tainted'", async () => {
    const h = harness({ drawError: securityError() });
    expect(await reasonOf(svgToPngBlob(svg('width="10" height="10"'), 2, h.deps))).toBe("tainted");
  });

  it("maps a null blob to reason 'encode'", async () => {
    const h = harness({ blob: null });
    expect(await reasonOf(svgToPngBlob(svg('width="10" height="10"'), 2, h.deps))).toBe("encode");
    expect(h.revoked).toEqual(["blob:test/1"]);
  });

  it("maps an image that fails to decode to reason 'load' and still revokes", async () => {
    const h = harness({ imageError: new Error("broken") });
    expect(await reasonOf(svgToPngBlob(svg('width="10" height="10"'), 2, h.deps))).toBe("load");
    expect(h.revoked).toEqual(["blob:test/1"]);
  });

  it("maps a missing 2D context to reason 'canvas'", async () => {
    const h = harness({ noContext: true });
    expect(await reasonOf(svgToPngBlob(svg('width="10" height="10"'), 2, h.deps))).toBe("canvas");
  });
});

describe("svgToPngDownload", () => {
  it("fetches with the session cookie and clicks a download anchor with the filename", async () => {
    const h = harness();
    const clicks: Array<{ href: string; download: string; attached: boolean }> = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.getAttribute("href") ?? "", download: this.download, attached: this.isConnected });
    });
    try {
      await svgToPngDownload("/api/notebooks/1/studio/2/export.svg", "mapa-mental.png", 2, h.deps);
    } finally {
      click.mockRestore();
    }

    expect(h.fetchCalls).toEqual([
      { input: "/api/notebooks/1/studio/2/export.svg", init: { credentials: "include" } },
    ]);
    expect(clicks).toEqual([{ href: "blob:test/2", download: "mapa-mental.png", attached: true }]);
    expect(document.querySelectorAll("a").length).toBe(0);

    // The SVG URL is revoked at once; the PNG URL only after the delay.
    expect(h.revoked).toEqual(["blob:test/1"]);
    expect(h.timers).toHaveLength(1);
    expect(h.timers[0]!.ms).toBe(DOWNLOAD_REVOKE_DELAY_MS);
    h.timers[0]!.callback();
    expect(h.revoked).toEqual(["blob:test/1", "blob:test/2"]);
  });

  it("turns a non-OK response into reason 'fetch' with the status", async () => {
    const h = harness({ response: new Response("nope", { status: 404 }) });
    const error = await svgToPngDownload("/x.svg", "x.png", 2, h.deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RasterizeError);
    expect(error).toMatchObject({ reason: "fetch", status: 404 });
    expect(h.created).toHaveLength(0);
  });

  it("turns a network failure into reason 'fetch'", async () => {
    const h = harness({ response: () => Promise.reject(new TypeError("Failed to fetch")) });
    expect(await reasonOf(svgToPngDownload("/x.svg", "x.png", 2, h.deps))).toBe("fetch");
  });

  it("surfaces a tainted canvas as reason 'tainted' and leaves no anchor behind", async () => {
    const h = harness({ toBlobError: securityError() });
    expect(await reasonOf(svgToPngDownload("/x.svg", "x.png", 2, h.deps))).toBe("tainted");
    expect(document.querySelectorAll("a").length).toBe(0);
    expect(h.revoked).toEqual(["blob:test/1"]);
  });
});

describe("downloadBlob", () => {
  it("clicks a detached-afterwards anchor and revokes its URL only after the delay", () => {
    const h = harness();
    const clicks: Array<{ href: string; download: string; attached: boolean }> = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.getAttribute("href") ?? "", download: this.download, attached: this.isConnected });
    });
    try {
      downloadBlob(new Blob(["<svg/>"], { type: "image/svg+xml" }), "figura.svg", h.deps);
    } finally {
      click.mockRestore();
    }

    expect(clicks).toEqual([{ href: "blob:test/1", download: "figura.svg", attached: true }]);
    expect(document.querySelectorAll("a").length).toBe(0);
    expect(h.revoked).toEqual([]);
    expect(h.timers.map((timer) => timer.ms)).toEqual([DOWNLOAD_REVOKE_DELAY_MS]);
    h.timers[0]!.callback();
    expect(h.revoked).toEqual(["blob:test/1"]);
  });
});
