// @ts-nocheck
/* Lint: no React Compiler exception is needed in this file (see `./msds.tsx`). */
"use client";
/**
 * MSDS — LoadingIndicator. Split out of `./msds.tsx` (D-212) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { SPRING, useSpring } from "./motion";
import { prefersReducedMotion } from "./runtime";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // LoadingIndicator — Rodada 7, item 2: o indicador "expressive" da M3, um
  // <path> de SVG cuja geometria interpola continuamente entre formas
  // lobuladas — diferente do morphing de Button/IconButton/FAB/Chip
  // (Rodada 6), que anima border-radius em CSS; aqui é interpolação de
  // coordenadas de ponto de controle, resolvida pela mesma useSpring, só
  // que uma instância por ponto em vez de uma só. Só indeterminado — a M3
  // não define uma variante determinada para esta peça específica (quem
  // precisa de determinado usa o CircularProgress da Rodada 6). Sob
  // prefers-reduced-motion cai para uma forma única estática: a troca de
  // forma-alvo simplesmente para de acontecer (o efeito abaixo nunca reagenda
  // o timer), e cada useSpring individual já vai direto ao alvo sob a mesma
  // preferência (mesma disciplina do resto do sistema) — nenhuma checagem
  // redundante aqui.
  // ---------------------------------------------------------------------
  var LOADING_INDICATOR_N = 6;

  var LOADING_INDICATOR_SHAPES = [
    [1, 1, 1, 1, 1, 1],
    [1.18, 0.78, 1.05, 0.85, 0.92, 1.1],
    [0.82, 1.15, 0.78, 1.08, 1.12, 0.8],
    [1.05, 0.88, 1.15, 0.75, 0.85, 1.05]
  ];

  // Catmull-Rom → Bézier cúbica: liso e fechado sobre os N pontos de
  // controle, sem depender de nenhuma biblioteca de curvas.
  function loadingBlobPath(points) {
    var n = points.length;
    var d = "M" + points[0][0].toFixed(2) + "," + points[0][1].toFixed(2) + " ";
    for (var i = 0; i < n; i++) {
      var p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += "C" + c1x.toFixed(2) + "," + c1y.toFixed(2) + " " + c2x.toFixed(2) + "," + c2y.toFixed(2) + " " + p2[0].toFixed(2) + "," + p2[1].toFixed(2) + " ";
    }
    return d + "Z";
  }

  function LoadingIndicator(props) {
    var size = props.size || 40;
    var reduced = prefersReducedMotion();
    var idxRef = React.useRef(0);
    var si = useState(0); var shapeIdx = si[0], setShapeIdx = si[1];
    useEffect(function () {
      if (reduced) return;
      var timer = setInterval(function () {
        idxRef.current = (idxRef.current + 1) % LOADING_INDICATOR_SHAPES.length;
        setShapeIdx(idxRef.current);
      }, 900);
      return function () { clearInterval(timer); };
    }, [reduced]);
    var target = LOADING_INDICATOR_SHAPES[reduced ? 0 : shapeIdx];
    // Uma useSpring por ponto de controle — hooks sempre na mesma contagem e
    // ordem (LOADING_INDICATOR_N é constante), nunca um array de hooks.
    var r0 = useSpring(target[0], SPRING.spatialSlow, target[0]);
    var r1 = useSpring(target[1], SPRING.spatialSlow, target[1]);
    var r2 = useSpring(target[2], SPRING.spatialSlow, target[2]);
    var r3 = useSpring(target[3], SPRING.spatialSlow, target[3]);
    var r4 = useSpring(target[4], SPRING.spatialSlow, target[4]);
    var r5 = useSpring(target[5], SPRING.spatialSlow, target[5]);
    var radii = [r0, r1, r2, r3, r4, r5];
    var cx = size / 2, cy = size / 2, R = size / 2 - 2;
    var pts = radii.map(function (r, i) {
      var angle = -Math.PI / 2 + i * (2 * Math.PI / LOADING_INDICATOR_N);
      return [cx + R * r * Math.cos(angle), cy + R * r * Math.sin(angle)];
    });
    return h("span", {
      className: "msds-loadingindicator", style: { width: size + "px", height: size + "px" },
      role: "progressbar", "aria-label": props.label || "Carregando", "aria-busy": "true"
    },
      h("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, className: "msds-loadingindicator-svg" },
        h("path", { d: loadingBlobPath(pts), fill: "currentColor" })
      )
    );
  }

export { LOADING_INDICATOR_N, LOADING_INDICATOR_SHAPES, LoadingIndicator, loadingBlobPath };
