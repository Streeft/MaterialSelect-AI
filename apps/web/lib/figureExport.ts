// Image export for every figure in the application (D-80).
//
// Two kinds of figure exist since the MSDS port: the property maps are still
// drawn by Plotly, and everything else is an SVG this app draws itself. Both end
// up here as one standalone SVG document, which is then either downloaded as is
// or rasterised to PNG — so the two kinds export the same way, with the same
// title band, the same legend and the same background.
//
// Strictly presentation: nothing here reads, converts or recomputes a value.

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The presentation properties copied from the live figure onto the clone.
 *
 * A standalone SVG file has no stylesheet, and this app's colours are CSS
 * custom properties (`rgb(var(--ink))`), which resolve to nothing outside the
 * page — an exported file that kept them would open black. The computed value
 * of each property is concrete (`rgb(23, 26, 33)`), so it is what gets written.
 */
const PAINT_PROPS = [
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "visibility",
] as const;

const TEXT_PROPS = [
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-anchor",
  "dominant-baseline",
  "letter-spacing",
] as const;

const TEXT_TAGS = new Set(["svg", "text", "tspan", "textPath"]);

/** Attributes that only mean something inside the live, interactive page. */
const DROPPED_ATTRIBUTES = ["class", "tabindex", "role", "aria-pressed", "data-active", "data-dim"];

/**
 * Copy the computed presentation of `source` (and its subtree) onto `target`.
 *
 * `target` must be a deep clone of `source`, so the two trees walk in step.
 * An author's inline `transform` is kept verbatim — the radar's spring writes
 * one, and at rest it is the identity — but a CSS animation's transform is not
 * copied: a bar caught mid-grow would otherwise be exported half as long.
 */
export function inlineComputedStyles(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source);
  const declarations: string[] = [];
  for (const prop of PAINT_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (value) declarations.push(`${prop}:${value}`);
  }
  if (TEXT_TAGS.has(source.tagName)) {
    for (const prop of TEXT_PROPS) {
      const value = computed.getPropertyValue(prop);
      if (value) declarations.push(`${prop}:${value}`);
    }
  }
  const own = (source as SVGElement | HTMLElement).style;
  if (own?.transform) declarations.push(`transform:${own.transform}`);
  if (own?.transformOrigin) declarations.push(`transform-origin:${own.transformOrigin}`);
  if (computed.display === "none") declarations.push("display:none");
  target.setAttribute("style", declarations.join(";"));
  for (const attribute of DROPPED_ATTRIBUTES) target.removeAttribute(attribute);

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  sourceChildren.forEach((child, index) => {
    const twin = targetChildren[index];
    if (twin) inlineComputedStyles(child, twin);
  });
}

/**
 * `url("http://host/page#hatch")` → `url(#hatch)`: a computed paint server is
 * resolved against the page's address, which a downloaded file does not have.
 */
function localiseUrls(markup: string): string {
  return markup.replace(/url\((?:&quot;|["'])?[^)#"']*#([^)"'&]+)(?:&quot;|["'])?\)/g, "url(#$1)");
}

function svgEl<K extends keyof SVGElementTagNameMap>(
  doc: Document,
  tag: K,
  attributes: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const element = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  return element;
}

/**
 * Width of `text` as the page would set it, for laying the legend out.
 *
 * Measured by a throwaway SVG `<text>` rather than a canvas: it is the same
 * text engine the exported file will use, and where there is none (jsdom) the
 * call simply fails and a rough estimate stands in.
 */
function textWidth(text: string, style: CSSStyleDeclaration): number {
  const probe = document.createElementNS(SVG_NS, "svg");
  probe.setAttribute("style", "position:absolute;visibility:hidden;width:0;height:0;overflow:hidden");
  try {
    const node = document.createElementNS(SVG_NS, "text");
    node.setAttribute(
      "style",
      `font-family:${style.fontFamily};font-size:${style.fontSize};font-weight:${style.fontWeight}`,
    );
    node.textContent = text;
    probe.appendChild(node);
    document.body.appendChild(probe);
    const width = node.getComputedTextLength();
    if (width > 0) return width;
  } catch {
    // No layout engine: fall through to the estimate.
  } finally {
    probe.remove();
  }
  return text.length * 6.6;
}

interface Band {
  node: SVGGElement;
  height: number;
}

/** The figure's title, as a band above it — the card title the page shows. */
function titleBand(doc: Document, container: HTMLElement): Band | null {
  const card = container.closest(".msds-chart-card");
  const heading = card?.querySelector<HTMLElement>(".msds-chart-title");
  const text = heading?.textContent?.trim();
  if (!heading || !text) return null;
  const style = window.getComputedStyle(heading);
  const group = svgEl(doc, "g", { "data-export": "title" });
  const node = svgEl(doc, "text", { x: 16, y: 22 });
  node.setAttribute(
    "style",
    `fill:${style.color};font-family:${style.fontFamily};font-size:14px;font-weight:600`,
  );
  node.textContent = text;
  group.appendChild(node);
  return { node: group, height: 32 };
}

/**
 * The HTML legend (MSDS buttons) redrawn in SVG under the figure.
 *
 * The page's legend is interactive HTML, outside the `<svg>`, so a naive export
 * would lose it — and a figure whose colours are not named is a figure nobody
 * can read once it leaves the page. Only the series that are *on* are written:
 * the file shows what the reader was looking at.
 */
function legendBand(doc: Document, container: HTMLElement, width: number): Band | null {
  const items = Array.from(container.querySelectorAll<HTMLElement>(".msds-legend-item")).filter(
    (item) => item.dataset.off !== "true",
  );
  if (items.length === 0) return null;

  const group = svgEl(doc, "g", { "data-export": "legend" });
  const defs = svgEl(doc, "defs", {});
  group.appendChild(defs);
  let hatchDefined = false;

  const padX = 16;
  const rowHeight = 22;
  const gap = 18;
  let x = padX;
  let y = 0;

  for (const item of items) {
    const labelNode = item.querySelector<HTMLElement>("[data-legend-label]");
    const label = (labelNode ?? item).textContent?.trim() ?? "";
    const labelStyle = window.getComputedStyle(labelNode ?? item);
    const swatchNode = item.querySelector<HTMLElement | SVGSVGElement>("[data-legend-swatch]");
    const kind = swatchNode?.getAttribute("data-legend-swatch") ?? "square";
    const swatchWidth = kind === "line" ? 18 : 12;
    const itemWidth = swatchWidth + 6 + textWidth(label, labelStyle);
    if (x > padX && x + itemWidth > width - padX) {
      x = padX;
      y += rowHeight;
    }

    const cy = y + rowHeight / 2;
    if (swatchNode && (kind === "symbol" || kind === "line") && swatchNode instanceof SVGSVGElement) {
      const clone = swatchNode.cloneNode(true) as SVGSVGElement;
      inlineComputedStyles(swatchNode, clone);
      clone.setAttribute("x", String(x));
      clone.setAttribute("y", String(cy - Number(swatchNode.getAttribute("height") ?? 12) / 2));
      clone.removeAttribute("aria-hidden");
      group.appendChild(clone);
    } else if (kind === "hatch" && swatchNode) {
      const border = window.getComputedStyle(swatchNode).borderTopColor;
      if (!hatchDefined) {
        const pattern = svgEl(doc, "pattern", {
          id: "export-hatch",
          width: 4,
          height: 4,
          patternUnits: "userSpaceOnUse",
          patternTransform: "rotate(45)",
        });
        pattern.appendChild(svgEl(doc, "line", { x1: 0, y1: 0, x2: 0, y2: 4, stroke: border, "stroke-width": 1.5 }));
        defs.appendChild(pattern);
        hatchDefined = true;
      }
      group.appendChild(
        svgEl(doc, "rect", {
          x,
          y: cy - 5,
          width: 10,
          height: 10,
          rx: 3,
          fill: "url(#export-hatch)",
          stroke: border,
          "stroke-dasharray": "2 1.5",
        }),
      );
    } else {
      const color = swatchNode ? window.getComputedStyle(swatchNode).backgroundColor : "rgb(0,0,0)";
      group.appendChild(
        svgEl(doc, "rect", {
          x,
          y: cy - 5,
          width: 10,
          height: 10,
          rx: 3,
          fill: color,
          stroke: "rgba(0,0,0,0.15)",
        }),
      );
    }

    const text = svgEl(doc, "text", { x: x + swatchWidth + 6, y: cy + 4 });
    text.setAttribute(
      "style",
      `fill:${labelStyle.color};font-family:${labelStyle.fontFamily};font-size:${labelStyle.fontSize};font-weight:${labelStyle.fontWeight}`,
    );
    text.textContent = label;
    group.appendChild(text);
    x += itemWidth + gap;
  }

  return { node: group, height: y + rowHeight + 8 };
}

/** The colour behind the figure on the page, so the file reads the same off it. */
function backgroundOf(container: HTMLElement): string {
  let node: HTMLElement | null = container;
  while (node) {
    const color = window.getComputedStyle(node).backgroundColor;
    if (color && color !== "transparent" && !/rgba\(.*,\s*0\)$/.test(color)) return color;
    node = node.parentElement;
  }
  return "rgb(255, 255, 255)";
}

/**
 * Wrap a figure's own SVG (already standalone) with the title band above it,
 * the legend below it and an opaque background, and serialise the result.
 */
function compose(
  container: HTMLElement,
  figure: SVGSVGElement,
  width: number,
  height: number,
  fontCss: string,
): { markup: string; width: number; height: number } {
  const doc = document.implementation.createDocument(SVG_NS, "svg", null);
  const root = doc.documentElement as unknown as SVGSVGElement;
  const title = titleBand(doc, container);
  const legend = legendBand(doc, container, width);
  const top = title?.height ?? 8;
  const total = top + height + (legend ? legend.height + 8 : 8);

  root.setAttribute("xmlns", SVG_NS);
  root.setAttribute("width", String(Math.round(width)));
  root.setAttribute("height", String(Math.round(total)));
  root.setAttribute("viewBox", `0 0 ${Math.round(width)} ${Math.round(total)}`);
  if (fontCss) {
    const style = svgEl(doc, "style", {});
    style.textContent = fontCss;
    root.appendChild(style);
  }
  root.appendChild(svgEl(doc, "rect", { x: 0, y: 0, width, height: total, fill: backgroundOf(container) }));
  if (title) root.appendChild(title.node);

  const placed = doc.importNode(figure, true) as SVGSVGElement;
  placed.setAttribute("x", "0");
  placed.setAttribute("y", String(top));
  placed.setAttribute("width", String(width));
  placed.setAttribute("height", String(height));
  root.appendChild(placed);

  if (legend) {
    legend.node.setAttribute("transform", `translate(0 ${top + height + 4})`);
    root.appendChild(legend.node);
  }

  const markup = new XMLSerializer().serializeToString(root);
  return { markup: localiseUrls(markup), width, height: total };
}

/** Base64 of an ArrayBuffer, in chunks (a spread of 100 KB overflows the stack). */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Whether a face's `unicode-range` covers basic Latin — the subset that sets
 * this app's labels. Parsed rather than pattern-matched: the browser
 * re-serialises `U+0000-00FF` as `U+0-FF`.
 */
function coversLatin(range: string): boolean {
  if (!range.trim()) return true;
  return range.split(",").some((part) => {
    const match = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(part.trim());
    if (!match?.[1]) return false;
    const start = parseInt(match[1].replace(/\?/g, "0"), 16);
    const end = parseInt(match[2] ?? match[1].replace(/\?/g, "f"), 16);
    return start <= 0x41 && end >= 0x7a;
  });
}

/**
 * The app's own faces (Public Sans, IBM Plex Mono), embedded as data URLs.
 *
 * A downloaded SVG — and the PNG rasterised from it — cannot reach the page's
 * `next/font` files, so without this the figure would be set in whatever the
 * reader's machine falls back to. Only the Latin subset is embedded, and only
 * the families the figure actually names. Best effort: any failure (a
 * cross-origin sheet, a fetch error) leaves the file with the fallback chain.
 */
async function embeddedFontCss(markup: string): Promise<string> {
  const wanted = ["Public Sans", "IBM Plex Mono"].filter((family) => markup.includes(family));
  if (wanted.length === 0) return "";
  const rules: string[] = [];
  let budget = 600_000;
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(cssRules)) {
      if (typeof CSSFontFaceRule === "undefined" || !(rule instanceof CSSFontFaceRule)) continue;
      const family = rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
      if (!wanted.includes(family)) continue;
      if (!coversLatin(rule.style.getPropertyValue("unicode-range"))) continue;
      const src = /url\(["']?([^"')]+)["']?\)/.exec(rule.style.getPropertyValue("src"))?.[1];
      if (!src) continue;
      try {
        const response = await fetch(new URL(src, sheet.href ?? window.location.href));
        if (!response.ok) continue;
        const buffer = await response.arrayBuffer();
        budget -= buffer.byteLength;
        if (budget < 0) return rules.join("");
        const weight = rule.style.getPropertyValue("font-weight") || "400";
        const style = rule.style.getPropertyValue("font-style") || "normal";
        rules.push(
          `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};` +
            `src:url(data:font/woff2;base64,${toBase64(buffer)}) format('woff2');}`,
        );
      } catch {
        // Leave this face out; the fallback chain still names a sans-serif.
      }
    }
  }
  return rules.join("");
}

async function rasterise(markup: string, width: number, height: number, scale = 2): Promise<string> {
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("SVG could not be rasterised."));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await loaded;
  try {
    await image.decode();
  } catch {
    // `onload` already fired; decode() is only a stricter wait.
  }
  // An embedded font can finish decoding a frame after the image does.
  await new Promise((resolve) => setTimeout(resolve, 60));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function triggerDownload(href: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * The figure inside `container` as one standalone SVG document.
 *
 * A Plotly figure is asked for its own SVG (the custom bundle's `toImage`, the
 * very instance that drew it); an MSDS figure is cloned and every node gets its
 * computed paint written inline. Either way the result then goes through the
 * same `compose` step.
 */
export async function figureMarkup(
  container: HTMLElement,
): Promise<{ markup: string; width: number; height: number }> {
  const graph = container.querySelector<HTMLElement>(".js-plotly-plot");
  let figure: SVGSVGElement;
  let width: number;
  let height: number;

  if (graph) {
    width = graph.clientWidth || 1100;
    height = graph.clientHeight || 640;
    const plotly = (await import("@/lib/plotly-custom")).default;
    const dataUrl = await plotly.toImage(graph, { format: "svg", width, height, scale: 1 });
    const comma = dataUrl.indexOf(",");
    const head = dataUrl.slice(0, comma);
    const body = dataUrl.slice(comma + 1);
    const text = head.includes(";base64") ? atob(body) : decodeURIComponent(body);
    const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
    figure = parsed.documentElement as unknown as SVGSVGElement;
  } else {
    const live = container.querySelector<SVGSVGElement>("svg[data-chart-figure]");
    // English on purpose: never shown. The toolbar maps any failure to
    // `ptBR.chart.exportError`, where the pt-BR sentence lives.
    if (!live) throw new Error("Figure not rendered yet.");
    // The figure is drawn at its measured size, so its viewBox *is* its size.
    const [, , boxWidth = 0, boxHeight = 0] = (live.getAttribute("viewBox") ?? "")
      .split(/[\s,]+/)
      .map(Number);
    width = boxWidth > 0 ? boxWidth : live.clientWidth || 640;
    height = boxHeight > 0 ? boxHeight : live.clientHeight || 360;
    figure = live.cloneNode(true) as SVGSVGElement;
    inlineComputedStyles(live, figure);
    figure.removeAttribute("aria-label");
  }

  const draft = compose(container, figure, width, height, "");
  const fontCss = await embeddedFontCss(draft.markup);
  return fontCss ? compose(container, figure, width, height, fontCss) : draft;
}

/** Download the figure inside `container` as PNG (2×) or SVG. */
export async function exportFigure(
  container: HTMLElement | null,
  format: "png" | "svg",
  fileName: string,
): Promise<void> {
  if (!container) throw new Error("Figure not rendered yet.");
  const { markup, width, height } = await figureMarkup(container);
  if (format === "svg") {
    const blob = new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${markup}`], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${fileName}.svg`);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const png = await rasterise(markup, width, height);
  triggerDownload(png, `${fileName}.png`);
}
