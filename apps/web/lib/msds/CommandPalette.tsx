// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — CommandPalette. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { msdsIcon } from "./icons";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // CommandPalette — Ctrl/Cmd+K, busca ao vivo. Assinatura #1.
  // ---------------------------------------------------------------------
  function CommandPalette(props) {
    var os = useState(false); var open = os[0], setOpen = os[1];
    var qs = useState(""); var query = qs[0], setQuery = qs[1];
    var items = props.items || [];
    var filtered = query ? items.filter(function (it) { return it.label.toLowerCase().indexOf(query.toLowerCase()) !== -1; }) : items;

    useEffect(function () {
      function onKey(e) {
        var mod = e.metaKey || e.ctrlKey;
        if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(function (o) { return !o; }); }
        if (e.key === "Escape") setOpen(false);
      }
      window.addEventListener("keydown", onKey);
      return function () { window.removeEventListener("keydown", onKey); };
    }, []);

    if (!open) {
      return h("button", { className: "msds-btn msds-btn-secondary msds-btn-md", onClick: function () { setOpen(true); } },
        msdsIcon("search"), h("span", null, "Buscar"), h("kbd", { className: "msds-kbd" }, "⌘K")
      );
    }
    return h("div", { className: "msds-dialog-backdrop", onMouseDown: function (e) { if (e.target === e.currentTarget) setOpen(false); } },
      h("div", { className: "msds-command", "data-tonal-elevation": props.tonalElevation ? "true" : "false" },
        h("div", { className: "msds-command-input-row" },
          msdsIcon("search"),
          h("input", { className: "msds-command-input", autoFocus: true, placeholder: "Buscar material por nome ou classe…", value: query, onChange: function (e) { setQuery(e.target.value); } })
        ),
        h("ul", { className: "msds-command-list", role: "listbox" },
          filtered.length ? filtered.map(function (it) {
            return h("li", { key: it.id, role: "option", className: "msds-command-item", onClick: function () { props.onSelect && props.onSelect(it); setOpen(false); setQuery(""); } },
              h("span", { className: "msds-chip-dot", style: { background: it.color } }),
              h("span", null, it.label), h("span", { className: "msds-command-cls" }, it.cls)
            );
          }) : h("li", { className: "msds-command-empty" }, "Nenhum material encontrado.")
        )
      )
    );
  }

export { CommandPalette };
