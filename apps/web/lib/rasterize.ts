// SVG → PNG in the browser: the one rasteriser of the application.
//
// Two callers, one implementation (D-98 left two, and the page figures' copy
// had neither the canvas ceiling nor the typed error):
//
// - the Studio's "PNG (imagem)" export (D-98). The backend draws the
//   infographic and the mind map as SVG and serves them as an export; the PNG
//   is that same file rasterised here, so the picture on the page, the SVG
//   download and the PNG download can never disagree. `svgToPngDownload`
//   fetches whatever the "Exportar ▾" menu links to for SVG
//   (`studioExportUrl(…, "svg")` in `lib/api.ts`) with the session cookie;
// - every chart's "Exportar ▾ → PNG" (`lib/figureExport.ts`, D-80), which
//   composes the figure into one standalone SVG and hands the markup to
//   `svgToPngBlob`.
//
// Strictly presentation: nothing here reads or recomputes a value. The SVG is
// drawn as it is — its own background rectangle included, the canvas is never
// cleared or filled — from a same-origin `blob:` URL, never from a network
// address, so the canvas is not tainted by the fetch itself. If it still is (an
// external `<image>` or font inside the file, or a browser that taints on
// `foreignObject`), the export fails with a typed error (`RasterizeError`,
// reason `tainted`) and the UI tells the reader to download the SVG instead.

/** iOS Safari refuses canvases above this many pixels (4096 × 4096). */
export const MAX_CANVAS_PIXELS = 16_777_216;

/** A conservative per-side ceiling; browsers differ between 16 384 and 32 767. */
export const MAX_CANVAS_SIDE = 16_384;

/** How long a download's object URL outlives the click (Safari/Firefox need it to). */
export const DOWNLOAD_REVOKE_DELAY_MS = 30_000;

/** Grace period after an image decodes, for the fonts embedded in it. */
const FONT_SETTLE_MS = 60;

/**
 * Why a rasterisation failed — each one a different sentence for the reader.
 *
 * - `fetch`: the SVG could not be downloaded (network error or non-OK status);
 * - `parse`: the response is not an SVG document;
 * - `dimensions`: the SVG names no usable size (no width/height, no viewBox);
 * - `load`: the browser could not decode the SVG as an image;
 * - `canvas`: no 2D canvas is available;
 * - `tainted`: the canvas refused to export (`SecurityError`);
 * - `encode`: the canvas produced no PNG (`toBlob` gave `null`).
 */
export type RasterizeReason =
  | "fetch"
  | "parse"
  | "dimensions"
  | "load"
  | "canvas"
  | "tainted"
  | "encode";

export class RasterizeError extends Error {
  readonly reason: RasterizeReason;
  /** HTTP status of the SVG request, when `reason === "fetch"` and there was one. */
  readonly status?: number;

  constructor(reason: RasterizeReason, message: string, options?: { status?: number; cause?: unknown }) {
    super(message);
    this.name = "RasterizeError";
    this.reason = reason;
    if (options?.status !== undefined) this.status = options.status;
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

/** The minimum a canvas has to offer here; `HTMLCanvasElement` satisfies it. */
export interface RasterCanvas {
  width: number;
  height: number;
  getContext(kind: "2d"): Pick<CanvasRenderingContext2D, "drawImage"> | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string): void;
}

/**
 * The browser pieces this module touches, injectable so tests (jsdom has no
 * canvas, no image decoder and no `URL.createObjectURL`) can supply fakes.
 * Call sites never pass it.
 */
export interface RasterizeDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  loadImage: (src: string) => Promise<CanvasImageSource>;
  createCanvas: (width: number, height: number) => RasterCanvas;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  document: Document;
  setTimeout: (callback: () => void, ms: number) => unknown;
}

async function loadImageElement(src: string): Promise<CanvasImageSource> {
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("image failed to load"));
  });
  image.src = src;
  await loaded;
  if (typeof image.decode === "function") {
    try {
      await image.decode();
    } catch {
      // `onload` already fired; decode() is only a stricter wait, and some
      // engines reject it for SVG sources that draw fine.
    }
  }
  // An embedded font (the chart exports inline the app's faces as data URLs)
  // can finish decoding a frame after the image does.
  await new Promise((resolve) => window.setTimeout(resolve, FONT_SETTLE_MS));
  return image;
}

function defaultDeps(): RasterizeDeps {
  return {
    fetch: (input, init) => fetch(input, init),
    loadImage: loadImageElement,
    createCanvas: (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    },
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    document,
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  };
}

function resolveDeps(overrides?: Partial<RasterizeDeps>): RasterizeDeps {
  if (overrides && isComplete(overrides)) return overrides;
  return { ...defaultDeps(), ...overrides };
}

function isComplete(deps: Partial<RasterizeDeps>): deps is RasterizeDeps {
  return (
    deps.fetch !== undefined &&
    deps.loadImage !== undefined &&
    deps.createCanvas !== undefined &&
    deps.createObjectURL !== undefined &&
    deps.revokeObjectURL !== undefined &&
    deps.document !== undefined &&
    deps.setTimeout !== undefined
  );
}

/**
 * A length attribute in user units, or `null` when it is absent, relative
 * (`%`, `em`) or not positive — any of which leaves the size to the viewBox.
 */
function parseLength(raw: string | null): number | null {
  if (raw === null) return null;
  const match = /^\s*([+]?\d*\.?\d+(?:e[+-]?\d+)?)\s*(px)?\s*$/i.exec(raw);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseViewBox(raw: string | null): { width: number; height: number } | null {
  if (raw === null) return null;
  const parts = raw.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const width = parts[2] as number;
  const height = parts[3] as number;
  return width > 0 && height > 0 ? { width, height } : null;
}

/**
 * The intrinsic size of an SVG root: its `width`/`height` attributes, each
 * falling back to the viewBox (scaled by the viewBox's aspect ratio when only
 * one attribute is given). `null` when neither says anything usable.
 */
export function svgDimensions(root: Element): { width: number; height: number } | null {
  const width = parseLength(root.getAttribute("width"));
  const height = parseLength(root.getAttribute("height"));
  if (width !== null && height !== null) return { width, height };
  const box = parseViewBox(root.getAttribute("viewBox"));
  if (!box) return null;
  if (width !== null) return { width, height: (width * box.height) / box.width };
  if (height !== null) return { width: (height * box.width) / box.height, height };
  return box;
}

/**
 * The scale actually used: the one asked for, reduced until the canvas fits
 * both `MAX_CANVAS_PIXELS` and `MAX_CANVAS_SIDE`. Never raised.
 */
export function fitScale(
  width: number,
  height: number,
  scale: number,
  maxPixels: number = MAX_CANVAS_PIXELS,
  maxSide: number = MAX_CANVAS_SIDE,
): number {
  const byArea = Math.sqrt(maxPixels / (width * height));
  const bySide = maxSide / Math.max(width, height);
  return Math.min(scale, byArea, bySide);
}

/** Canvas size in whole pixels for an SVG size and a requested scale, capped. */
export function canvasSize(
  width: number,
  height: number,
  scale: number,
): { width: number; height: number; scale: number } {
  const used = fitScale(width, height, scale);
  return {
    width: Math.max(1, Math.floor(width * used)),
    height: Math.max(1, Math.floor(height * used)),
    scale: used,
  };
}

/**
 * Parse `svgText`, check it is an SVG with a size, and return it serialised
 * with explicit `width`/`height` — Firefox will not draw an SVG image that
 * lacks them (bug 700533).
 */
function prepareSvg(svgText: string): { markup: string; width: number; height: number } {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  } catch (cause) {
    throw new RasterizeError("parse", "The response is not an SVG document.", { cause });
  }
  const root = doc.documentElement;
  if (
    !root ||
    root.localName !== "svg" ||
    root.namespaceURI !== "http://www.w3.org/2000/svg" ||
    doc.getElementsByTagName("parsererror").length > 0
  ) {
    throw new RasterizeError("parse", "The response is not an SVG document.");
  }
  const size = svgDimensions(root);
  if (!size) {
    throw new RasterizeError("dimensions", "The SVG has no width/height and no viewBox.");
  }
  root.setAttribute("width", String(size.width));
  root.setAttribute("height", String(size.height));
  return { markup: new XMLSerializer().serializeToString(root), ...size };
}

function isSecurityError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "SecurityError"
  );
}

function canvasToBlob(canvas: RasterCanvas): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new RasterizeError("encode", "The canvas produced no PNG."));
      }, "image/png");
    } catch (error) {
      reject(
        isSecurityError(error)
          ? new RasterizeError("tainted", "The canvas is tainted and cannot be exported.", { cause: error })
          : new RasterizeError("encode", "The canvas could not be encoded as PNG.", { cause: error }),
      );
    }
  });
}

/**
 * Rasterise an SVG document to a PNG `Blob` at `scale` × its intrinsic size
 * (reduced when the canvas would be too large; see `fitScale`).
 *
 * Throws `RasterizeError` — never a bare `DOMException` — so the caller can
 * branch on `reason`.
 */
export async function svgToPngBlob(
  svgText: string,
  scale = 2,
  deps?: Partial<RasterizeDeps>,
): Promise<Blob> {
  const env = resolveDeps(deps);
  const svg = prepareSvg(svgText);
  const size = canvasSize(svg.width, svg.height, scale);

  const svgUrl = env.createObjectURL(new Blob([svg.markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    let image: CanvasImageSource;
    try {
      image = await env.loadImage(svgUrl);
    } catch (cause) {
      throw new RasterizeError("load", "The SVG could not be decoded as an image.", { cause });
    }

    const canvas = env.createCanvas(size.width, size.height);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new RasterizeError("canvas", "No 2D canvas context is available.");
    try {
      context.drawImage(image, 0, 0, size.width, size.height);
    } catch (error) {
      if (isSecurityError(error)) {
        throw new RasterizeError("tainted", "The SVG could not be drawn on the canvas.", { cause: error });
      }
      throw new RasterizeError("load", "The SVG could not be drawn on the canvas.", { cause: error });
    }
    return await canvasToBlob(canvas);
  } finally {
    env.revokeObjectURL(svgUrl);
  }
}

/**
 * Fetch the SVG export at `url` (with the session cookie), rasterise it and
 * hand the PNG to the reader as `filename`.
 */
export async function svgToPngDownload(
  url: string,
  filename: string,
  scale = 2,
  deps?: Partial<RasterizeDeps>,
): Promise<void> {
  const env = resolveDeps(deps);

  let response: Response;
  try {
    response = await env.fetch(url, { credentials: "include" });
  } catch (cause) {
    throw new RasterizeError("fetch", "The SVG could not be downloaded.", { cause });
  }
  if (!response.ok) {
    throw new RasterizeError("fetch", `The SVG request failed with status ${response.status}.`, {
      status: response.status,
    });
  }
  let svgText: string;
  try {
    svgText = await response.text();
  } catch (cause) {
    throw new RasterizeError("fetch", "The SVG response could not be read.", { cause });
  }

  const png = await svgToPngBlob(svgText, scale, env);
  downloadBlob(png, filename, env);
}

/**
 * Hand `blob` to the reader as a download named `filename`.
 *
 * The object URL outlives the click by `DOWNLOAD_REVOKE_DELAY_MS`: Safari and
 * Firefox read the blob after `click()` returns, and an early revoke cancels
 * the download silently. Revoked all the same — a URL left alive holds the
 * whole file in memory for as long as the page is open.
 */
export function downloadBlob(blob: Blob, filename: string, deps?: Partial<RasterizeDeps>): void {
  const env = resolveDeps(deps);
  const doc = env.document;
  const url = env.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  doc.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    env.setTimeout(() => env.revokeObjectURL(url), DOWNLOAD_REVOKE_DELAY_MS);
  }
}
