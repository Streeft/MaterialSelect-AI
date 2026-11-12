// @ts-nocheck
/* eslint-disable react-hooks/refs, react-hooks/immutability -- D-76: the
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
 * MSDS — motion. Split out of `./msds.tsx` (D-209) without changing a line
 * of behaviour: same code, same names, now one file per component family.
 * `./msds.tsx` re-exports every public name, so `@/lib/msds` is unchanged.
 * `@ts-nocheck` and the lint exceptions above: see the note in `./msds.tsx`.
 */
import * as React from "react";
import { prefersReducedMotion } from "./runtime";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  // ---------------------------------------------------------------------
  // useRipple — extraído da Material Design 3: uma camada de estado
  // (hover/pressed translúcidos) mais um círculo que nasce no ponto exato
  // do toque. O host precisa da classe "msds-ripple-host" (position:relative
  // + overflow:hidden). Desligado sob prefers-reduced-motion — só a camada
  // de estado (sem movimento) continua.
  // ---------------------------------------------------------------------
  function useRipple() {
    var s = useState([]);
    var ripples = s[0], setRipples = s[1];
    // The 600 ms cleanup timers are cleared on unmount: one that outlives the
    // component (or, in tests, the jsdom window) calls a setter on nothing, and
    // vitest reports "window is not defined" as an unhandled error (D-202).
    var timers = React.useRef([]);
    useEffect(function () {
      return function () { timers.current.forEach(clearTimeout); timers.current = []; };
    }, []);
    function onPointerDown(e) {
      if (prefersReducedMotion()) return;
      var host = e.currentTarget;
      var rect = host.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 2;
      var x = e.clientX - rect.left - size / 2;
      var y = e.clientY - rect.top - size / 2;
      var id = Date.now() + "-" + Math.random();
      setRipples(function (rs) { return rs.concat([{ id: id, x: x, y: y, size: size }]); });
      var timer = setTimeout(function () {
        timers.current = timers.current.filter(function (t) { return t !== timer; });
        setRipples(function (rs) { return rs.filter(function (r) { return r.id !== id; }); });
      }, 600);
      timers.current.push(timer);
    }
    var layer = h("span", { className: "msds-ripple-clip", "aria-hidden": "true" },
      h("span", { className: "msds-state-layer" }),
      ripples.map(function (r) {
        return h("span", { key: r.id, className: "msds-ripple", style: { left: r.x + "px", top: r.y + "px", width: r.size + "px", height: r.size + "px" } });
      })
    );
    return { onPointerDown: onPointerDown, layer: layer };
  }

  // ---------------------------------------------------------------------
  // useSpring — o sistema físico de movimento da M3: uma mola amortecida
  // (stiffness/dampingRatio) no lugar de curva+duração fixas, resolvida a
  // cada quadro (requestAnimationFrame). Interrompível de verdade — mudar
  // o alvo no meio do gesto faz a mola retarget suavemente a partir da
  // posição e velocidade atuais, nunca reinicia do zero. Valores
  // aproximados dos publicados pela M3 (leitura de referência, não
  // extração ao vivo da especificação — documentado no README).
  //   Spatial  (tamanho/posição, pode ultrapassar antes de assentar)
  //   Effects  (opacidade/cor, sempre crítica — nunca ultrapassa)
  // ---------------------------------------------------------------------
  var SPRING = {
    spatialFast: { stiffness: 1400, dampingRatio: 1 },
    spatialDefault: { stiffness: 700, dampingRatio: 0.9 },
    spatialSlow: { stiffness: 300, dampingRatio: 0.9 },
    effectsFast: { stiffness: 1400, dampingRatio: 1 },
    effectsDefault: { stiffness: 800, dampingRatio: 1 },
    effectsSlow: { stiffness: 400, dampingRatio: 1 }
  };

  // Rodada 8, item 4: 4º parâmetro opcional "resetKey" — quando muda de um
  // render para o outro, força a mola a reassentar em "from" (posição e
  // velocidade) em vez de continuar animando do valor atual. Sem ele
  // (undefined, o padrão), nada muda — todo chamador existente (FAB,
  // useShapeMorph, useScreenTransition, StatTile, ParallelCoords…) continua
  // com o mesmo comportamento de sempre. Existe para useContainerTransform:
  // os 4 hooks (top/left/width/height) já estão montados desde antes do
  // diálogo abrir (com alvo 0), e sem isto a mola "puxaria" de 0 em vez de
  // nascer no retângulo do gatilho a cada nova abertura.
  function useSpring(target, preset, from, resetKey) {
    var p = preset || SPRING.spatialDefault;
    var s = useState(from !== undefined ? from : target);
    var value = s[0], setValue = s[1];
    var ref = React.useRef({ value: from !== undefined ? from : target, velocity: 0, raf: null, target: target });
    var lastResetKey = React.useRef(resetKey);
    if (resetKey !== undefined && resetKey !== lastResetKey.current) {
      lastResetKey.current = resetKey;
      var resetTo = from !== undefined ? from : target;
      ref.current.value = resetTo;
      ref.current.velocity = 0;
      if (value !== resetTo) setValue(resetTo); // ajuste em fase de render — padrão suportado pelo React
    }
    ref.current.target = target;
    useEffect(function () {
      if (prefersReducedMotion()) {
        cancelAnimationFrame(ref.current.raf);
        ref.current.value = target; ref.current.velocity = 0;
        setValue(target);
        return;
      }
      var stiffness = p.stiffness, dampingRatio = p.dampingRatio;
      var damping = dampingRatio * 2 * Math.sqrt(stiffness);
      var last = null;
      function tick(ts) {
        if (last === null) last = ts;
        var dt = Math.min((ts - last) / 1000, 1 / 30);
        last = ts;
        var st = ref.current;
        var force = -stiffness * (st.value - st.target) - damping * st.velocity;
        st.velocity += force * dt;
        st.value += st.velocity * dt;
        var settled = Math.abs(st.value - st.target) < 0.001 && Math.abs(st.velocity) < 0.001;
        if (settled) { st.value = st.target; st.velocity = 0; }
        setValue(st.value);
        if (!settled) ref.current.raf = requestAnimationFrame(tick);
      }
      ref.current.raf = requestAnimationFrame(tick);
      return function () { cancelAnimationFrame(ref.current.raf); };
    }, [target, p.stiffness, p.dampingRatio]);
    return value;
  }

  // ---------------------------------------------------------------------
  // useScreenTransition — Rodada 6, item 11: os dois padrões de transição
  // *entre* telas/estados da M3 (useSpring/SPRING até aqui só animava
  // dentro de uma tela — série de radar, contador). "sharedAxis" desliza o
  // conteúdo novo entrando enquanto o antigo sai pelo lado oposto ao longo
  // de um eixo; "fadeThrough" desvanece o conteúdo antigo, uma pausa breve,
  // e o novo desvanece entrando — sem deslocamento. Implementação: a mesma
  // mola física de useSpring (fórmula idêntica, mesmos presets
  // spatialDefault/effectsDefault) só que resolvida aqui dentro em vez de
  // delegada a useSpring, porque a troca de conteúdo (um nó só, trocado no
  // meio da transição) precisa impor um salto imperativo de posição/
  // opacidade no instante da troca — algo que useSpring, que só reage a
  // mudanças de "target" entre renders, não expõe. Sob
  // prefers-reduced-motion o conteúdo troca na hora, sem opacidade nem
  // deslocamento — mesma disciplina do resto do sistema.
  // ---------------------------------------------------------------------
  function useScreenTransition(activeKey, opts) {
    opts = opts || {};
    var pattern = opts.pattern || "sharedAxis"; // "sharedAxis" | "fadeThrough"
    var axis = opts.axis || "x"; // "x" | "y"
    var distance = opts.distance === undefined ? 28 : opts.distance;
    var ds = useState({ key: activeKey }); var display = ds[0], setDisplay = ds[1];
    var os = useState(1); var opacity = os[0], setOpacity = os[1];
    var xs = useState(0); var disp = xs[0], setDisp = xs[1];
    var animRef = React.useRef(null);
    var prevKeyRef = React.useRef(activeKey);
    useEffect(function () {
      if (activeKey === prevKeyRef.current) return;
      var dir = typeof opts.direction === "function" ? (opts.direction(prevKeyRef.current, activeKey) || 1) : 1;
      prevKeyRef.current = activeKey;
      if (prefersReducedMotion()) {
        cancelAnimationFrame(animRef.current);
        setDisplay({ key: activeKey }); setOpacity(1); setDisp(0);
        return;
      }
      cancelAnimationFrame(animRef.current);
      var outMs = pattern === "fadeThrough" ? 90 : 130;
      var t0 = null;
      function tickOut(ts) {
        if (t0 === null) t0 = ts;
        var p = Math.min((ts - t0) / outMs, 1);
        setOpacity(1 - p);
        setDisp(pattern === "sharedAxis" ? -dir * distance * 0.35 * p : 0);
        if (p < 1) { animRef.current = requestAnimationFrame(tickOut); }
        else { swapIn(); }
      }
      function swapIn() {
        setDisplay({ key: activeKey });
        var ov = 0, ovel = 0;
        var dv = pattern === "sharedAxis" ? dir * distance : 0, dvel = 0;
        setOpacity(ov); setDisp(dv);
        var oStiff = SPRING.effectsDefault.stiffness, oDamp = SPRING.effectsDefault.dampingRatio * 2 * Math.sqrt(oStiff);
        var dStiff = SPRING.spatialDefault.stiffness, dDamp = SPRING.spatialDefault.dampingRatio * 2 * Math.sqrt(dStiff);
        var last = null;
        function tickIn(ts) {
          if (last === null) last = ts;
          var dt = Math.min((ts - last) / 1000, 1 / 30); last = ts;
          var fo = -oStiff * (ov - 1) - oDamp * ovel; ovel += fo * dt; ov += ovel * dt;
          var fd = -dStiff * (dv - 0) - dDamp * dvel; dvel += fd * dt; dv += dvel * dt;
          var settled = Math.abs(ov - 1) < 0.002 && Math.abs(ovel) < 0.002 && Math.abs(dv) < 0.05 && Math.abs(dvel) < 0.05;
          if (settled) { ov = 1; dv = 0; }
          setOpacity(ov); setDisp(dv);
          if (!settled) animRef.current = requestAnimationFrame(tickIn);
        }
        animRef.current = requestAnimationFrame(tickIn);
      }
      animRef.current = requestAnimationFrame(tickOut);
    }, [activeKey, pattern, axis, distance]);
    useEffect(function () { return function () { cancelAnimationFrame(animRef.current); }; }, []);
    var offset = axis === "y" ? { transform: "translateY(" + disp + "px)" } : { transform: "translateX(" + disp + "px)" };
    return { key: display.key, style: Object.assign({ opacity: opacity, willChange: "opacity, transform" }, offset) };
  }

  // ---------------------------------------------------------------------
  // useContainerTransform — Rodada 8, item 4: mede o retângulo do elemento-
  // gatilho (getBoundingClientRect) no instante em que "isOpen" vira true, e
  // anima a superfície que abre daquele retângulo até o tamanho/posição
  // final que ela mesma assumiria por CSS — medido uma vez, no primeiro
  // layout depois de abrir (useLayoutEffect, antes da pintura, para o
  // primeiro quadro já nascer no retângulo do gatilho e não "piscar" no
  // tamanho final antes do zoom começar). top/left/width/height animam via
  // useSpring/SPRING.spatialDefault — a mesma mola física do resto do
  // sistema, nenhuma curva nova. Devolve { surfaceRef, style, active }:
  // "surfaceRef" vai para a prop surfaceRef de Dialog/BottomSheet (a
  // superfície que o hook precisa medir), "style" é o override de
  // position/top/left/width/height a aplicar nela enquanto "active" —
  // quando não há retângulo de gatilho (fechado, ou sem triggerRef.current
  // no instante de abrir), "style" é null e a superfície usa sua posição
  // normal de CSS (comportamento de sempre, sem o hook).
  // ---------------------------------------------------------------------
  var useLayoutEffectSafe = typeof window !== "undefined" && React.useLayoutEffect ? React.useLayoutEffect : useEffect;

  function useContainerTransform(triggerRef, isOpen) {
    var surfaceRef = React.useRef(null);
    var s1 = useState(null); var startRect = s1[0], setStartRect = s1[1];
    var s2 = useState(null); var endRect = s2[0], setEndRect = s2[1];
    var wasOpen = React.useRef(false);
    // "session" — incrementa a cada abertura nova; passado como resetKey aos
    // 4 useSpring abaixo para eles reassentarem em "startRect" em vez de
    // continuar animando do valor da abertura anterior (ou do 0 inicial,
    // antes da primeira abertura — os 4 hooks já estão montados desde então).
    var session = React.useRef(0);

    useLayoutEffectSafe(function () {
      if (isOpen && !wasOpen.current) {
        var tr = triggerRef && triggerRef.current ? triggerRef.current.getBoundingClientRect() : null;
        session.current += 1;
        setStartRect(tr ? { top: tr.top, left: tr.left, width: tr.width, height: tr.height } : null);
        setEndRect(null);
      }
      if (!isOpen) { setStartRect(null); setEndRect(null); }
      wasOpen.current = isOpen;
    }, [isOpen]);

    // Só mede o retângulo final DEPOIS que a superfície já foi montada sem
    // nenhum override de estilo (o style abaixo só existe quando startRect E
    // endRect já são conhecidos) — a superfície nasce na posição normal de
    // CSS por um instante puramente interno (ainda dentro da mesma cascata
    // de layout effects, antes de qualquer pintura), o hook mede esse
    // retângulo como "final", e só então liga o override. Sem essa ordem, o
    // hook mediria a própria superfície já contraída pelo seu override —
    // círculo vicioso que colapsaria tudo para o retângulo do gatilho.
    useLayoutEffectSafe(function () {
      if (isOpen && startRect && !endRect && surfaceRef.current) {
        var r = surfaceRef.current.getBoundingClientRect();
        setEndRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    }, [isOpen, startRect, endRect]);

    var from = startRect || { top: 0, left: 0, width: 0, height: 0 };
    var target = endRect || from;
    var rk = session.current;
    var top = useSpring(target.top, SPRING.spatialDefault, from.top, rk);
    var left = useSpring(target.left, SPRING.spatialDefault, from.left, rk);
    var width = useSpring(target.width, SPRING.spatialDefault, from.width, rk);
    var height = useSpring(target.height, SPRING.spatialDefault, from.height, rk);

    if (!startRect || !endRect) return { surfaceRef: surfaceRef, style: null, active: false };
    return {
      surfaceRef: surfaceRef,
      active: true,
      style: {
        position: "fixed", top: top + "px", left: left + "px", width: width + "px", height: height + "px",
        margin: 0, maxWidth: "none", maxHeight: "none", transform: "none"
      }
    };
  }

  // ---------------------------------------------------------------------
  // useShapeMorph — Rodada 6, item 3 (M3 Expressive): anima border-radius
  // entre um valor de repouso e um valor "apertado" enquanto o ponteiro está
  // pressionado (ou enquanto selecionado, para Chip), com a mesma mola física
  // do resto do sistema (SPRING.spatialFast) em vez de uma curva CSS nova.
  // Como useSpring já desliga sob prefers-reduced-motion (vai direto ao
  // alvo), o morphing desliga sozinho — nenhum código extra aqui precisa
  // checar a preferência de novo. Devolve { radius, bind } — "bind" traz os
  // handlers de pointer down/up/leave/cancel prontos para espalhar no
  // elemento, encadeados com um handler existente se houver.
  function useShapeMorph(rest, pressed, active) {
    var s = useState(false); var down = s[0], setDown = s[1];
    var target = (active !== undefined ? active : down) ? pressed : rest;
    var radius = useSpring(target, SPRING.spatialFast, rest);
    function chain(existing, fn) { return function (e) { fn(e); if (existing) existing(e); }; }
    return {
      radius: radius,
      style: { borderRadius: radius + "px" },
      bind: {
        onPointerDown: function (e) { setDown(true); },
        onPointerUp: function (e) { setDown(false); },
        onPointerLeave: function (e) { setDown(false); },
        onPointerCancel: function (e) { setDown(false); }
      }
    };
  }

  function mergeHandlers(a, b) {
    if (!a) return b; if (!b) return a;
    return function (e) { b(e); a(e); };
  }

export { SPRING, mergeHandlers, useContainerTransform, useLayoutEffectSafe, useRipple, useScreenTransition, useShapeMorph, useSpring };
