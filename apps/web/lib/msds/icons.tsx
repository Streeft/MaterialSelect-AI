// @ts-nocheck
/**
 * MSDS icon set, ported verbatim from the Artifact-built design system
 * (Round 6 M3 grammar: rounder strokes, several filled glyphs). This file
 * is a mechanical port of `Icon(name)` from the source bundle — the switch
 * statement and svg shape data are kept as-is; only the module wiring
 * changed (window.React -> import, function expression -> export).
 *
 * `@ts-nocheck`: this is a straight port of externally authored, already
 * working JS (see docs/DECISIONS.md D-74) rather than newly written
 * application code — adding full strict typing to a 2600-line vendored
 * bundle was not a good use of a bounded follow-up slice. Consumers
 * outside `lib/msds` should treat exports as `any` and narrow locally.
 */
import * as React from "react";

const h = React.createElement;

export function msdsIcon(name) {
    var line = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
    var small = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" };
    switch (name) {
      case "home": return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" },
        h("path", { d: "M12 3.2a1.5 1.5 0 0 1 .98.36l7 6a1.5 1.5 0 0 1 .52 1.14V19a2 2 0 0 1-2 2h-3.5a1 1 0 0 1-1-1v-4.5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1V20a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2v-8.3a1.5 1.5 0 0 1 .52-1.14l7-6A1.5 1.5 0 0 1 12 3.2Z" }));
      case "map": return h("svg", line, h("circle", { cx: 12, cy: 10, r: 3.2 }), h("path", { d: "M12 21.2c-1.4 0-7.5-6.8-7.5-11.2a7.5 7.5 0 1 1 15 0c0 4.4-6.1 11.2-7.5 11.2Z" }));
      case "compare": return h("svg", line, h("path", { d: "M7.5 4.5v11.5a3 3 0 0 0 3 3H17" }), h("path", { d: "M16.5 19.5V8a3 3 0 0 0-3-3H7" }));
      case "catalog": return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" },
        h("rect", { x: 3.5, y: 3.5, width: 7.5, height: 7.5, rx: 2.6 }), h("rect", { x: 13, y: 3.5, width: 7.5, height: 7.5, rx: 2.6, opacity: 0.55 }),
        h("rect", { x: 3.5, y: 13, width: 7.5, height: 7.5, rx: 2.6, opacity: 0.55 }), h("rect", { x: 13, y: 13, width: 7.5, height: 7.5, rx: 2.6 }));
      case "dashboard": return h("svg", line, h("path", { d: "M4 15.2a8 8 0 1 1 16 0" }), h("path", { d: "M12 15.2 15.6 9.4" }), h("circle", { cx: 12, cy: 15.2, r: 1.4, fill: "currentColor", stroke: "none" }));
      case "import": return h("svg", line, h("path", { d: "M12 4.2v10.6" }), h("path", { d: "M7.2 10l4.8 4.8 4.8-4.8" }), h("path", { d: "M5 19.2h14" }));
      case "chevrons": return h("svg", small, h("path", { d: "M11 17l-5-5 5-5" }), h("path", { d: "M18 17l-5-5 5-5" }));
      case "star": return h("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "currentColor" }, h("path", { d: "M12.7 2.9a.8.8 0 0 0-1.4 0L9.2 8.1l-5.6.6a.8.8 0 0 0-.46 1.4l4.2 3.8-1.2 5.5a.8.8 0 0 0 1.2.87L12 17.2l4.9 3.1a.8.8 0 0 0 1.2-.87l-1.2-5.5 4.2-3.8a.8.8 0 0 0-.46-1.4l-5.6-.6Z" }));
      case "starOutline": return h("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round" }, h("path", { d: "M12.7 2.9a.8.8 0 0 0-1.4 0L9.2 8.1l-5.6.6a.8.8 0 0 0-.46 1.4l4.2 3.8-1.2 5.5a.8.8 0 0 0 1.2.87L12 17.2l4.9 3.1a.8.8 0 0 0 1.2-.87l-1.2-5.5 4.2-3.8a.8.8 0 0 0-.46-1.4l-5.6-.6Z" }));
      case "check": return h("svg", line, h("path", { d: "M4.5 12.8 9.2 17.5 19.5 6.5" }));
      case "minus": return h("svg", line, h("path", { d: "M5.5 12h13" }));
      case "close": return h("svg", line, h("path", { d: "M6.5 6.5l11 11" }), h("path", { d: "M17.5 6.5l-11 11" }));
      case "search": return h("svg", line, h("circle", { cx: 10.5, cy: 10.5, r: 6.3 }), h("path", { d: "M19.6 19.6l-4.4-4.4" }));
      case "chevronDown": return h("svg", small, h("path", { d: "M6 9.2l6 6 6-6" }));
      case "alert": return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" },
        h("path", { d: "M10.6 3.8a1.6 1.6 0 0 1 2.8 0l8.2 14.6a1.6 1.6 0 0 1-1.4 2.4H3.8a1.6 1.6 0 0 1-1.4-2.4Z" }),
        h("rect", { x: 11, y: 9.5, width: 2, height: 5, rx: 1, fill: "var(--surface-200, #fff)" }),
        h("circle", { cx: 12, cy: 17, r: 1.1, fill: "var(--surface-200, #fff)" }));
      case "plus": return h("svg", line, h("path", { d: "M12 5.5v13" }), h("path", { d: "M5.5 12h13" }));
      case "filter": return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" },
        h("path", { d: "M3.6 4.6A1 1 0 0 1 4.4 4h15.2a1 1 0 0 1 .76 1.65l-6 7v6.6a1 1 0 0 1-1.45.9l-3.5-1.75A1 1 0 0 1 9 17.5v-4.85l-6-7A1 1 0 0 1 3.6 4.6Z" }));
      case "ruler": return h("svg", line, h("rect", { x: 3.6, y: 9.6, width: 16.8, height: 4.8, rx: 1.8, transform: "rotate(-45 12 12)" }), h("path", { d: "M9.6 12.8l1.6 1.6" }), h("path", { d: "M12.8 9.6l1.6 1.6" }));
      case "tag": return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" },
        h("path", { d: "M11.4 3.6h5.8A2.2 2.2 0 0 1 19.4 5.8v5.8a2.2 2.2 0 0 1-.64 1.55l-7.2 7.2a2.2 2.2 0 0 1-3.11 0l-4.4-4.4a2.2 2.2 0 0 1 0-3.11l7.2-7.2a2.2 2.2 0 0 1 1.55-.64Z" }),
        h("circle", { cx: 14.6, cy: 8.4, r: 1.6, fill: "var(--surface-200, #fff)" }));
      case "leaf": return h("svg", line, h("path", { d: "M5.2 18.8C4.6 10 10.8 4 19.8 4.2c.6 8.6-5.4 14.8-14.6 14.6Z" }), h("path", { d: "M5.5 18.5c2.8-4.6 5.6-7.4 10.2-10" }));
      case "battery": return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" },
        h("rect", { x: 2.6, y: 6.6, width: 16.8, height: 10.8, rx: 3.2 }),
        h("rect", { x: 20.4, y: 10, width: 1.8, height: 4, rx: 0.9 }),
        h("rect", { x: 5, y: 9, width: 4, height: 6, rx: 1.2, fill: "var(--surface-200, #fff)" }));
      case "gear": return h("svg", line, h("circle", { cx: 12, cy: 12, r: 3.2 }), h("path", { d: "M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.7 5.3l-1.85 1.85M7.15 16.85 5.3 18.7M18.7 18.7l-1.85-1.85M7.15 7.15 5.3 5.3" }));
      case "flask": return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" },
        h("path", { d: "M9.8 2.8h4.4a1 1 0 0 1 0 2h-.4v5.9l5.1 8.4a2 2 0 0 1-1.7 3H6.8a2 2 0 0 1-1.7-3l5.1-8.4V4.8h-.4a1 1 0 1 1 0-2Z" }),
        h("path", { d: "M7.6 15.4h8.8", stroke: "var(--surface-200, #fff)", strokeWidth: 2, fill: "none", strokeLinecap: "round" }));
      case "bookmark": return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" },
        h("path", { d: "M7.2 3.2h9.6a1.6 1.6 0 0 1 1.6 1.6v14.6a1 1 0 0 1-1.55.83L12 16.8l-4.85 3.43A1 1 0 0 1 5.6 19.4V4.8a1.6 1.6 0 0 1 1.6-1.6Z" }));
      case "layers": return h("svg", line, h("path", { d: "M12 3.4 20.6 8 12 12.6 3.4 8Z" }), h("path", { d: "m4.4 12.4 7.6 4 7.6-4" }), h("path", { d: "m4.4 16.4 7.6 4 7.6-4" }));
      case "list": return h("svg", line, h("path", { d: "M9.5 6.4h10.1" }), h("path", { d: "M9.5 12h10.1" }), h("path", { d: "M9.5 17.6h10.1" }), h("circle", { cx: 4.6, cy: 6.4, r: 1.3, fill: "currentColor", stroke: "none" }), h("circle", { cx: 4.6, cy: 12, r: 1.3, fill: "currentColor", stroke: "none" }), h("circle", { cx: 4.6, cy: 17.6, r: 1.3, fill: "currentColor", stroke: "none" }));
      case "menu": return h("svg", line, h("path", { d: "M4.5 7.2h15" }), h("path", { d: "M4.5 12h15" }), h("path", { d: "M4.5 16.8h15" }));
      case "dots": return h("svg", line, h("circle", { cx: 6, cy: 12, r: 1.5, fill: "currentColor", stroke: "none" }), h("circle", { cx: 12, cy: 12, r: 1.5, fill: "currentColor", stroke: "none" }), h("circle", { cx: 18, cy: 12, r: 1.5, fill: "currentColor", stroke: "none" }));
      // ---- Rodada 6: glifos novos (SideSheet, SplitButton, DatePicker,
      // TimePicker, Carousel, CircularProgress, ScreenTransitionDemo) ----
      case "chevronLeft": return h("svg", small, h("path", { d: "M15 5.2 8.5 12l6.5 6.8" }));
      case "chevronRight": return h("svg", small, h("path", { d: "M9 5.2 15.5 12 9 18.8" }));
      case "calendar": return h("svg", line, h("rect", { x: 3.4, y: 5.2, width: 17.2, height: 15.4, rx: 3.4 }), h("path", { d: "M3.4 10h17.2" }), h("path", { d: "M8 3v3.6" }), h("path", { d: "M16 3v3.6" }), h("circle", { cx: 8.4, cy: 14.4, r: 1.1, fill: "currentColor", stroke: "none" }), h("circle", { cx: 12, cy: 14.4, r: 1.1, fill: "currentColor", stroke: "none" }));
      case "clock": return h("svg", line, h("circle", { cx: 12, cy: 12, r: 8.6 }), h("path", { d: "M12 7.4V12l3.4 2" }));
      case "panelRight": return h("svg", line, h("rect", { x: 3.2, y: 4.6, width: 17.6, height: 14.8, rx: 3.4 }), h("path", { d: "M14.8 4.6v14.8" }));
      case "grid": return h("svg", { width: 20, height: 20, viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" },
        h("rect", { x: 3.4, y: 3.4, width: 7.4, height: 7.4, rx: 2.4 }), h("rect", { x: 13.2, y: 3.4, width: 7.4, height: 7.4, rx: 2.4, opacity: 0.55 }),
        h("rect", { x: 3.4, y: 13.2, width: 7.4, height: 7.4, rx: 2.4, opacity: 0.55 }), h("rect", { x: 13.2, y: 13.2, width: 7.4, height: 7.4, rx: 2.4 }));
      default: return null;
    }
  }

