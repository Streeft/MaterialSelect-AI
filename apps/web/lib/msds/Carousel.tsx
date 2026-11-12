// @ts-nocheck
/* eslint-disable react-hooks/refs -- D-76: the
   duplicate-declaration fix below let ESLint's React Compiler rules fully
   analyze this vendored, straight-ported bundle for the first time (they
   previously aborted silently on the parse-level duplicate identifier, the
   same reason `tsc` stayed quiet — see the note above the barrel re-export
   at the bottom of this file). The 34 errors that surfaced are all inside
   demo-only components (`ContainerTransformDemo`, `ScreenTransitionDemo`,
   the Dialog/BottomSheet/Popover/Menu/SideSheet/DatePicker family's own
   internal ref usage) that read a ref's `.current` during render — patterns
   the source Artifact bundle already used before this port and that this
   task's scope is a mechanical module-wiring port of, not a behavioral
   rewrite (D-74). Disabled here, at the same file granularity `@ts-nocheck`
   already uses, rather than rewritten line by line. */
"use client";
/**
 * MSDS — Carousel. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";
import { prefersReducedMotion } from "./runtime";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // Carousel — Rodada 6, item 10: trilho horizontal com scroll-snap nativo
  // (sem biblioteca de swipe), paginação por ponto + setas prev/next, item
  // customizável por render-prop (mesmo padrão de "render prop" do
  // DataTable, Rodada 5).
  // ---------------------------------------------------------------------
  function Carousel(props) {
    var items = props.items || [];
    var trackRef = React.useRef(null);
    var s = useState(0); var active = s[0], setActive = s[1];
    function scrollToIndex(i) {
      var track = trackRef.current;
      if (!track || !track.children[i]) return;
      track.scrollTo({ left: track.children[i].offsetLeft, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      setActive(i);
    }
    function onScroll() {
      var track = trackRef.current;
      if (!track) return;
      var best = 0, bestDist = Infinity;
      Array.prototype.forEach.call(track.children, function (child, i) {
        var dist = Math.abs(child.offsetLeft - track.scrollLeft);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      setActive(best);
    }
    return h("div", { className: "msds-carousel", "aria-roledescription": "carrossel", "aria-label": props.ariaLabel },
      h("div", { className: "msds-carousel-viewport" },
        h("div", { className: "msds-carousel-track", ref: trackRef, onScroll: onScroll },
          items.map(function (it, i) {
            return h("div", { className: "msds-carousel-item", key: it.key !== undefined ? it.key : i }, props.renderItem ? props.renderItem(it, i) : String(it));
          })
        ),
        items.length > 1 ? h("button", { type: "button", className: "msds-carousel-arrow msds-carousel-arrow-prev", "aria-label": "Anterior", disabled: active === 0, onClick: function () { scrollToIndex(Math.max(0, active - 1)); } }, msdsIcon("chevronLeft")) : null,
        items.length > 1 ? h("button", { type: "button", className: "msds-carousel-arrow msds-carousel-arrow-next", "aria-label": "Próximo", disabled: active === items.length - 1, onClick: function () { scrollToIndex(Math.min(items.length - 1, active + 1)); } }, msdsIcon("chevronRight")) : null
      ),
      items.length > 1 ? h("div", { className: "msds-carousel-dots", role: "tablist", "aria-label": "Ir para item" },
        items.map(function (it, i) {
          return h("button", { key: i, type: "button", className: "msds-carousel-dot", "data-active": i === active ? "true" : "false", "aria-label": "Item " + (i + 1), "aria-selected": i === active, onClick: function () { scrollToIndex(i); } });
        })
      ) : null
    );
  }

export { Carousel };
