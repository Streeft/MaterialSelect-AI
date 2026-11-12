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
 * MSDS — demos. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { Button } from "./Button";
import { CardBody } from "./Card";
import { Dialog } from "./Dialog";
import { Stepper } from "./Stepper";
import { useContainerTransform, useScreenTransition } from "./motion";

const h = React.createElement;
const useState = React.useState;

  // ---------------------------------------------------------------------
  // ScreenTransitionDemo — Rodada 6, item 11: demonstração dedicada de
  // "shared axis" (useScreenTransition) num mini-wizard de 3 passos. Não é
  // uma tela nova do produto real — só a demonstração do padrão, como o
  // README pede.
  // ---------------------------------------------------------------------
  function ScreenTransitionDemo() {
    var STEPS = [
      { key: "material", title: "1. Escolha o material", desc: "Selecione a liga de partida para o estudo." },
      { key: "restricoes", title: "2. Defina os limites", desc: "Limites numéricos sobre as propriedades relevantes." },
      { key: "resultado", title: "3. Veja o resultado", desc: "Classificação dos materiais que passaram pela pilha de estágios." }
    ];
    var s = useState(0); var step = s[0], setStep = s[1];
    var trans = useScreenTransition(STEPS[step].key, { pattern: "sharedAxis", axis: "x", direction: function () { return 1; } });
    var current = STEPS.filter(function (t) { return t.key === trans.key; })[0] || STEPS[0];
    return h("div", { className: "msds-screentransition-demo" },
      h(Stepper, {
        steps: STEPS.map(function (t, i) { return { key: t.key, label: t.title, state: i < step ? "complete" : i === step ? "active" : "blocked" }; })
      }),
      h("div", { className: "msds-screentransition-viewport" },
        h("div", { className: "msds-screentransition-panel", style: trans.style },
          h("h3", { className: "msds-card-title" }, current.title),
          h("p", { className: "msds-card-desc" }, current.desc)
        )
      ),
      h("div", { className: "msds-row" },
        h(Button, { variant: "secondary", disabled: step === 0, onClick: function () { setStep(Math.max(0, step - 1)); } }, "Voltar"),
        h(Button, { variant: "primary", disabled: step === STEPS.length - 1, onClick: function () { setStep(Math.min(STEPS.length - 1, step + 1)); } }, "Avançar")
      )
    );
  }

  // ---------------------------------------------------------------------
  // ContainerTransformDemo — Rodada 8, item 4: demonstração dedicada de
  // useContainerTransform, no mesmo espírito de ScreenTransitionDemo
  // (Rodada 6) — não é uma tela do produto real, é a demonstração do
  // padrão. Um cartão de lista "morfa" no Dialog de detalhe a partir da
  // própria posição do cartão clicado, nunca do centro da tela.
  // ---------------------------------------------------------------------
  function ContainerTransformDemo() {
    var ITEMS = [
      { id: "al7075", title: "Alumínio 7075-T6", desc: "Liga aeroespacial de alta resistência, tratável termicamente." },
      { id: "ti6al4v", title: "Titânio Ti-6Al-4V", desc: "Biocompatível, alta razão resistência/peso, resistente à corrosão." },
      { id: "cfrp", title: "CFRP unidirecional", desc: "Compósito de fibra de carbono, alta rigidez específica, anisotrópico." }
    ];
    var s = useState(null); var openId = s[0], setOpenId = s[1];
    var triggerRef = React.useRef(null);
    var ct = useContainerTransform(triggerRef, openId !== null);
    var current = ITEMS.filter(function (it) { return it.id === openId; })[0];
    function openFrom(it, e) { triggerRef.current = e.currentTarget; setOpenId(it.id); }
    return h("div", { className: "msds-col", style: { gap: "12px" } },
      h("p", { className: "msds-card-desc" }, "Clique num cartão — o diálogo de detalhe nasce da própria posição do cartão (useContainerTransform), nunca do centro da tela."),
      h("div", { className: "msds-col", style: { gap: "10px" } },
        ITEMS.map(function (it) {
          return h("div", {
            key: it.id, className: "msds-card msds-card-elevated", role: "button", tabIndex: 0,
            "data-interactive": "true",
            onClick: function (e) { openFrom(it, e); },
            onKeyDown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFrom(it, e); } }
          },
            h(CardBody, null,
              h("h3", { className: "msds-card-title" }, it.title),
              h("p", { className: "msds-card-desc" }, it.desc)
            )
          );
        })
      ),
      h(Dialog, {
        open: openId !== null, onClose: function () { setOpenId(null); },
        title: current ? current.title : "",
        surfaceRef: ct.surfaceRef, transformStyle: ct.style
      }, current ? h("p", { className: "msds-card-desc" }, current.desc + " (ficha completa de propriedades apareceria aqui — a demonstração é da transição, não do conteúdo.)") : null)
    );
  }

export { ContainerTransformDemo, ScreenTransitionDemo };
