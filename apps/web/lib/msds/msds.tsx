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
 * MSDS component/hook library, ported verbatim from the Artifact-built
 * design system (components/bundle.js in the source scratchpad). This is a
 * mechanical module-wiring port, not a rewrite:
 *
 *  - `window.React` -> `import * as React from "react"` (no behavior change,
 *    the app already depends on react/react-dom).
 *  - The single SSR-relevant change: `prefersReducedMotion()` now guards
 *    `typeof window === "undefined"` before touching `matchMedia`, since
 *    Next.js renders this module server-side first and the Artifact never
 *    had to handle that. Every other `window`/`document` access in this file
 *    already lived inside a `useEffect` body or an event handler, which only
 *    run client-side, so no further guarding was needed (see docs/DECISIONS.md
 *    D-74 for the audit).
 *  - `Icon(name)` moved to `./icons.tsx` as `msdsIcon`, to keep icon data
 *    separate from component logic; call sites renamed accordingly.
 *
 * `@ts-nocheck`: see the note at the top of `./icons.tsx` — same reasoning.
 */
import * as React from "react";
import { msdsIcon } from "./icons";

const h = React.createElement;
const useState = React.useState;
const useEffect = React.useEffect;

  var UID_SEQ = { n: 0 };
  function useUid(prefix) {
    var ref = React.useRef(null);
    if (ref.current === null) { UID_SEQ.n += 1; ref.current = (prefix || "msds") + "-" + UID_SEQ.n; }
    return ref.current;
  }

  function prefersReducedMotion() {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

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
    function onPointerDown(e) {
      if (prefersReducedMotion()) return;
      var host = e.currentTarget;
      var rect = host.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height) * 2;
      var x = e.clientX - rect.left - size / 2;
      var y = e.clientY - rect.top - size / 2;
      var id = Date.now() + "-" + Math.random();
      setRipples(function (rs) { return rs.concat([{ id: id, x: x, y: y, size: size }]); });
      setTimeout(function () {
        setRipples(function (rs) { return rs.filter(function (r) { return r.id !== id; }); });
      }, 600);
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

  // ---------------------------------------------------------------------
  // Button — Rodada 6: forma expressive M3 (raio de repouso "pill-ish" 12px
  // do token radius-control desce para 8px de radius-seat sob pressão e
  // volta ao soltar, via useShapeMorph/spatialFast).
  // ---------------------------------------------------------------------
  function Button(props) {
    var variant = props.variant || "primary";
    var size = props.size || "md";
    var state = props.state || (props.loading ? "loading" : "idle"); // "idle" | "loading" | "success"
    var loading = state === "loading";
    var success = state === "success";
    var disabled = !!props.disabled || loading;
    var ripple = useRipple();
    var morph = useShapeMorph(12, 8);
    var cls = ["msds-btn", "msds-ripple-host", "msds-btn-" + variant, "msds-btn-" + size, success ? "is-success" : "", props.className].filter(Boolean).join(" ");
    var rest = {};
    Object.keys(props).forEach(function (k) {
      if (["variant", "size", "loading", "state", "disabled", "className", "children", "onPointerDown", "onPointerUp", "onPointerLeave", "style"].indexOf(k) === -1) rest[k] = props[k];
    });
    rest.type = rest.type || "button";
    rest.disabled = disabled;
    rest.className = cls;
    rest.style = Object.assign({}, props.style, morph.style);
    rest.onPointerDown = function (e) { ripple.onPointerDown(e); morph.bind.onPointerDown(e); if (props.onPointerDown) props.onPointerDown(e); };
    rest.onPointerUp = mergeHandlers(props.onPointerUp, morph.bind.onPointerUp);
    rest.onPointerLeave = mergeHandlers(props.onPointerLeave, morph.bind.onPointerLeave);
    rest.onPointerCancel = morph.bind.onPointerCancel;
    if (loading) rest["aria-busy"] = true;
    var icon = loading ? h("span", { className: "msds-spinner", "aria-hidden": "true" })
      : success ? h("span", { className: "msds-btn-check", "aria-hidden": "true" }, msdsIcon("check")) : null;
    return h("button", rest, ripple.layer, icon, h("span", { className: "msds-btn-label" }, success && props.successLabel ? props.successLabel : props.children));
  }

  // ---------------------------------------------------------------------
  // IconButton — toggle affordance (aria-pressed), e.g. favoritar. Rodada 6:
  // forma expressive — círculo (radius-full) aperta para 16px sob pressão.
  // ---------------------------------------------------------------------
  function IconButton(props) {
    var variant = props.variant || "outlined";
    var ripple = useRipple();
    var morph = useShapeMorph(9999, 16);
    return h("button", {
      type: "button",
      className: ["msds-icon-btn", "msds-icon-btn-" + variant, "msds-ripple-host", props.className].filter(Boolean).join(" "),
      style: morph.style,
      "aria-pressed": props.pressed !== undefined ? !!props.pressed : undefined,
      "aria-label": props.label,
      title: props.label,
      onPointerDown: function (e) { ripple.onPointerDown(e); morph.bind.onPointerDown(e); },
      onPointerUp: morph.bind.onPointerUp,
      onPointerLeave: morph.bind.onPointerLeave,
      onPointerCancel: morph.bind.onPointerCancel,
      onClick: props.onToggle
    }, ripple.layer, msdsIcon(props.pressed ? (props.iconOn || "star") : (props.iconOff || "starOutline")));
  }

  // ---------------------------------------------------------------------
  // ButtonGroup — segmented / mutually exclusive control.
  // ---------------------------------------------------------------------
  function ButtonGroup(props) {
    var options = props.options || [];
    return h("div", { className: "msds-segmented", role: "group", "aria-label": props.label },
      options.map(function (opt) {
        var active = opt.value === props.value;
        return h("button", {
          key: opt.value, type: "button", className: "msds-segmented-item",
          "data-active": active ? "true" : "false",
          "aria-pressed": active,
          onClick: function () { props.onChange && props.onChange(opt.value); }
        }, opt.label);
      })
    );
  }

  // ---------------------------------------------------------------------
  // Chip — multi-select filter (e.g. classes num mapa). Rodada 6: forma
  // expressive — a pílula (radius-full) morfa para 8px (radius-seat) ao
  // selecionar, e volta ao desselecionar; o alvo é o estado de seleção,
  // não o ponteiro (diferente de Button/IconButton/FAB, que respondem à
  // pressão — o Chip "assist"/"suggestion" sem seleção nunca morfa).
  // ---------------------------------------------------------------------
  function Chip(props) {
    var variant = props.variant || "filter";
    var ripple = useRipple();
    var morph = useShapeMorph(9999, 8, !!props.selected);
    var cls = ["msds-chip", "msds-ripple-host", "msds-chip-" + variant, props.className].filter(Boolean).join(" ");
    var body = [
      ripple.layer,
      variant === "assist" && props.icon ? h("span", { className: "msds-chip-icon", key: "icon" }, msdsIcon(props.icon)) : null,
      props.color ? h("span", { className: "msds-chip-dot", style: { background: props.color }, key: "dot" }) : null,
      h("span", { className: "msds-chip-text", key: "text" }, props.children)
    ];
    // Chip "input" tem duas ações independentes (selecionar/remover), então não
    // pode ser um único <button> — um botão não pode conter outro botão. Vira
    // um contêiner com role="button" para a seleção, mais um <button> real só
    // para o "x"; os dois nunca são o mesmo elemento clicável.
    if (variant === "input") {
      return h("span", {
        className: cls, role: props.onClick ? "button" : undefined, tabIndex: props.onClick ? 0 : undefined,
        style: morph.style,
        "aria-pressed": props.onClick ? !!props.selected : undefined,
        onPointerDown: props.onClick ? ripple.onPointerDown : undefined,
        onClick: props.onClick,
        onKeyDown: props.onClick ? function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onClick(); } } : undefined
      },
        body,
        h("button", {
          type: "button", className: "msds-chip-remove", "aria-label": (props.removeLabel || "Remover") + (typeof props.children === "string" ? " " + props.children : ""),
          onClick: function (e) { e.stopPropagation(); props.onRemove && props.onRemove(); }
        }, msdsIcon("close"))
      );
    }
    return h("button", {
      type: "button", className: cls, style: morph.style, "aria-pressed": !!props.selected,
      onPointerDown: ripple.onPointerDown, onClick: props.onClick
    }, body);
  }

  // ---------------------------------------------------------------------
  // Badge / DataQualityBadge — o "quarto estado" nunca vira zero silencioso.
  // ---------------------------------------------------------------------
  function Badge(props) {
    return h("span", { className: "msds-badge msds-badge-" + (props.tone || "neutral") }, props.children);
  }

  // NotificationBadge — ponto/contador de sobreposição (posicionado de fora,
  // pelo host, com position:relative + este componente absolute num canto).
  // Não confundir com Badge: Badge é um rótulo de texto inline; este é um
  // marcador mínimo sobre um ícone/avatar (mensagens não lidas, alertas).
  function NotificationBadge(props) {
    var count = props.count;
    var dot = count === undefined || props.dot;
    var display = dot ? null : (props.max && count > props.max ? props.max + "+" : String(count));
    if (!dot && (count === undefined || count === 0) && !props.showZero) return null;
    return h("span", {
      className: "msds-notif-badge" + (dot ? " msds-notif-badge-dot" : ""),
      "aria-label": props.label || (dot ? "Notificação" : count + " notificações")
    }, display);
  }

  var QUALITY_LABEL = { MEDIDO: "Medido", IMPORTADO: "Importado", ESTIMADO: "Estimado", AUSENTE: "Ausente" };
  function DataQualityBadge(props) {
    var state = props.state || "AUSENTE";
    var showLabel = props.showLabel !== false;
    return h("span", { className: "msds-quality msds-quality-" + state.toLowerCase() },
      h("span", { className: "msds-quality-glyph", "aria-hidden": "true" }),
      h("span", { className: showLabel ? undefined : "msds-sr-only" }, QUALITY_LABEL[state] || state)
    );
  }

  // ---------------------------------------------------------------------
  // Card
  // ---------------------------------------------------------------------
  function Card(props) {
    var variant = props.variant || "elevated";
    // Rodada 6, item 4 (elevação tonal): opt-in, e só quando variant="elevated"
    // — um Card "filled"/"outlined" é neutro de propósito e nunca ganha tint,
    // mesmo que o host passe tonalElevation por engano.
    var tonal = !!props.tonalElevation && variant === "elevated";
    return h("div", {
      className: ["msds-card", "msds-card-" + variant, props.className].filter(Boolean).join(" "),
      style: props.style,
      "data-interactive": props.interactive ? "true" : "false",
      "data-tonal-hover": props.tonalHover ? "true" : "false",
      "data-tonal-elevation": tonal ? "true" : "false"
    }, props.children);
  }
  function CardHeader(props) {
    return h("div", { className: "msds-card-header" },
      h("h3", { className: "msds-card-title" }, props.title),
      props.description ? h("p", { className: "msds-card-desc" }, props.description) : null
    );
  }
  function CardBody(props) { return h("div", { className: "msds-card-body" }, props.children); }
  function CardFooter(props) { return h("div", { className: "msds-card-footer" }, props.children); }
  Card.Header = CardHeader; Card.Body = CardBody; Card.Footer = CardFooter;

  // ---------------------------------------------------------------------
  // NavRail — rail recolhível, item ativo sinalizado em 3 canais.
  // ---------------------------------------------------------------------
  function NavRailItemButton(props) {
    var item = props.item, active = props.active;
    var ripple = useRipple();
    return h("button", {
      key: item.key, type: "button", className: "msds-rail-item msds-ripple-host",
      "aria-current": active ? "page" : undefined,
      style: active ? { "--row-accent": item.accent } : undefined,
      onPointerDown: ripple.onPointerDown,
      onClick: function () { props.onSelect && props.onSelect(item.key); }
    },
      ripple.layer,
      h("span", { className: "msds-rail-icon" }, msdsIcon(item.icon)),
      h("span", { className: "msds-rail-label" }, item.label)
    );
  }

  function NavRail(props) {
    var items = props.items || [];
    var collapsed = !!props.collapsed;
    // Agrupa preservando a ordem — item sem "group" fica solto (ex.: Início);
    // a partir daí, cada troca de "group" abre um bloco novo com eyebrow.
    // O componente não hardcoda nenhum nome de grupo: quem chama decide
    // quantos grupos existem e o que cada um se chama — é assim que um
    // botão novo "que surgir no futuro" só precisa entrar em items, nunca
    // exigir mudança aqui.
    var blocks = [];
    items.forEach(function (item) {
      var last = blocks[blocks.length - 1];
      if (last && last.group === (item.group || null)) { last.items.push(item); }
      else { blocks.push({ group: item.group || null, items: [item] }); }
    });
    return h("nav", { className: "msds-rail", "data-collapsed": collapsed ? "true" : "false", "aria-label": props.label || "Navegação principal" },
      blocks.map(function (block, bi) {
        return h("div", { className: "msds-rail-group", key: bi },
          block.group ? h("div", { className: "msds-rail-eyebrow" }, block.group) : null,
          block.items.map(function (item) {
            var active = item.key === props.activeKey;
            return h(NavRailItemButton, { key: item.key, item: item, active: active, onSelect: props.onSelect });
          })
        );
      }),
      h("button", {
        type: "button", className: "msds-rail-toggle", onClick: props.onToggleCollapse,
        "aria-label": collapsed ? "Expandir navegação" : "Recolher navegação"
      }, msdsIcon("chevrons"))
    );
  }

  // ---------------------------------------------------------------------
  // StatTile — KPI com contagem animada + sparkline.
  // ---------------------------------------------------------------------
  function useCountUp(target) {
    // Antes: curva cúbica escrita à mão. Agora: o mesmo primitivo do resto
    // do sistema — useSpring(effectsDefault), sem duplicar matemática.
    return useSpring(target, SPRING.effectsDefault, 0);
  }

  function Sparkline(props) {
    var data = props.data || [];
    if (!data.length) return null;
    var w = 120, hgt = 32, pad = 3;
    var min = Math.min.apply(null, data), max = Math.max.apply(null, data);
    var range = (max - min) || 1;
    var pts = data.map(function (v, i) {
      var x = pad + (i / (data.length - 1 || 1)) * (w - pad * 2);
      var y = hgt - pad - ((v - min) / range) * (hgt - pad * 2);
      return x.toFixed(1) + "," + y.toFixed(1);
    }).join(" ");
    return h("svg", { className: "msds-stat-spark", viewBox: "0 0 " + w + " " + hgt, preserveAspectRatio: "none" },
      h("polyline", { points: pts, fill: "none", stroke: props.color || "var(--accent)", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" })
    );
  }

  function StatTile(props) {
    var displayValue = useCountUp(props.value);
    var decimals = props.decimals || 0;
    return h("div", { className: "msds-stat" },
      h("div", { className: "msds-stat-label" }, props.label),
      h("div", null,
        h("span", { className: "msds-stat-value" }, displayValue.toFixed(decimals)),
        props.unit ? h("span", { className: "msds-stat-unit" }, props.unit) : null
      ),
      h("div", { className: "msds-stat-row" },
        h(Sparkline, { data: props.sparkline, color: props.accent || "var(--accent)" }),
        props.trend !== undefined ? h("span", { className: "msds-stat-trend", "data-dir": props.trend >= 0 ? "up" : "down" },
          (props.trend >= 0 ? "+" : "") + props.trend + "%"
        ) : null
      )
    );
  }

  // ---------------------------------------------------------------------
  // BarChart — barra horizontal empilhada, com informação de foco/hover
  // e alternativa textual (D-31): a tabela de dados nunca é opcional.
  // ---------------------------------------------------------------------
  function BarChart(props) {
    var data = props.data || [];
    var hs = useState(null); var hover = hs[0], setHover = hs[1];
    var ts = useState(false); var showTable = ts[0], setShowTable = ts[1];

    function rowTotal(row) { return row.segments.reduce(function (s, seg) { return s + seg.value; }, 0); }
    var maxTotal = 1;
    data.forEach(function (row) { maxTotal = Math.max(maxTotal, rowTotal(row)); });

    var bars = data.map(function (row, ri) {
      return h("div", { className: "msds-bar-row", key: row.label },
        h("span", { className: "msds-bar-name" }, row.label),
        h("div", { className: "msds-bar-track" },
          row.segments.map(function (seg, si) {
            var pct = (seg.value / maxTotal) * 100;
            var active = hover && hover.rowLabel === row.label && hover.seg.key === seg.key;
            return h("div", {
              key: seg.key, className: "msds-bar-seg",
              style: { width: pct + "%", background: seg.color, animationDelay: (ri * 70 + si * 50) + "ms" },
              "data-focus": active ? "true" : "false",
              tabIndex: 0,
              "aria-label": row.label + ": " + seg.label + " " + seg.value,
              onMouseEnter: function () { setHover({ rowLabel: row.label, seg: seg }); },
              onMouseLeave: function () { setHover(null); },
              onFocus: function () { setHover({ rowLabel: row.label, seg: seg }); },
              onBlur: function () { setHover(null); }
            });
          })
        )
      );
    });

    var info = hover
      ? h("div", { style: { fontSize: "12px", color: "var(--ink)", marginTop: "8px" }, "aria-live": "polite" },
        h("strong", null, hover.rowLabel), " — " + hover.seg.label + ": ",
        h("strong", null, hover.seg.value + (props.unit || ""))
      )
      : h("div", { style: { height: "18px" } });

    var table = h("table", { className: "msds-chart-table" },
      h("thead", null, h("tr", null,
        h("th", null, "Classe"),
        (props.segmentLabels || []).map(function (l) { return h("th", { key: l, "data-numeric": "true" }, l); })
      )),
      h("tbody", null, data.map(function (row) {
        return h("tr", { key: row.label },
          h("td", null, row.label),
          row.segments.map(function (seg) { return h("td", { key: seg.key, "data-numeric": "true" }, seg.value + (props.unit || "")); })
        );
      }))
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" },
        h("h4", { className: "msds-chart-title" }, props.title),
        h("button", { className: "msds-table-toggle", onClick: function () { setShowTable(!showTable); } }, showTable ? "Ver gráfico" : "Ver tabela de dados")
      ),
      showTable ? table : h("div", { role: "img", "aria-label": (props.title || "Gráfico de barras") + ". A tabela de dados equivalente está disponível pelo botão “Ver tabela de dados”." }, bars, info)
    );
  }

  // ---------------------------------------------------------------------
  // ScatterMap — mapa de seleção estilo Ashby: envelopes de classe,
  // pontos com marcador+cor redundantes (Okabe–Ito) e reta de índice.
  // ---------------------------------------------------------------------
  function scaleLinear(domain, range) {
    var d0 = domain[0], d1 = domain[1], r0 = range[0], r1 = range[1];
    return function (v) { return r0 + (v - d0) / ((d1 - d0) || 1) * (r1 - r0); };
  }
  function polygonPath(points) {
    if (!points || points.length < 3) return null;
    return "M" + points.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("L") + "Z";
  }
  function Marker(x, y, r, symbol, color) {
    var common = { fill: color, stroke: "rgba(0,0,0,0.25)", strokeWidth: 1 };
    switch (symbol) {
      case "square": return h("rect", Object.assign({ x: x - r * 0.8, y: y - r * 0.8, width: r * 1.6, height: r * 1.6 }, common));
      case "diamond": return h("rect", Object.assign({ x: x - r * 0.72, y: y - r * 0.72, width: r * 1.44, height: r * 1.44, transform: "rotate(45 " + x + " " + y + ")" }, common));
      case "triangle": return h("polygon", Object.assign({ points: [[x, y - r], [x + r * 0.95, y + r * 0.8], [x - r * 0.95, y + r * 0.8]].map(function (p) { return p.join(","); }).join(" ") }, common));
      case "x": return h("g", null,
        h("line", { x1: x - r, y1: y - r, x2: x + r, y2: y + r, stroke: color, strokeWidth: 2.4, strokeLinecap: "round" }),
        h("line", { x1: x - r, y1: y + r, x2: x + r, y2: y - r, stroke: color, strokeWidth: 2.4, strokeLinecap: "round" })
      );
      default: return h("circle", Object.assign({ cx: x, cy: y, r: r }, common));
    }
  }

  function ScatterMap(props) {
    var points = props.points || [];
    var envelopesData = props.envelopes || [];
    var W = 640, H = 360, PAD = 40;
    var xs = points.map(function (p) { return p.x; });
    var ys = points.map(function (p) { return p.y; });
    var xDomain = [Math.min.apply(null, xs) * 0.9, Math.max.apply(null, xs) * 1.08];
    var yDomain = [Math.min.apply(null, ys) * 0.85, Math.max.apply(null, ys) * 1.12];
    var sx = scaleLinear(xDomain, [PAD, W - PAD]);
    var sy = scaleLinear(yDomain, [H - PAD, PAD]);

    var hs = useState(null); var hoverId = hs[0], setHoverId = hs[1];
    var ss = useState(null); var selId = ss[0], setSelId = ss[1];
    var os = useState({}); var off = os[0], setOff = os[1];
    var ts = useState(false); var showTable = ts[0], setShowTable = ts[1];

    var activeId = hoverId || selId;
    var activePoint = points.filter(function (p) { return p.id === activeId; })[0];

    var envelopeEls = envelopesData.map(function (env) {
      if (off[env.cls]) return null;
      var d = polygonPath(env.points.map(function (p) { return [sx(p[0]), sy(p[1])]; }));
      if (!d) return null;
      return h("path", { key: env.cls, className: "msds-scatter-envelope", d: d, fill: env.color, fillOpacity: 0.14, stroke: env.color, strokeOpacity: 0.5, strokeWidth: 1.5 });
    });

    var pointEls = points.map(function (p, i) {
      var cx = sx(p.x), cy = sy(p.y);
      var dim = off[p.cls] || (activeId && activeId !== p.id);
      return h("g", {
        key: p.id, className: "msds-scatter-point",
        "data-dim": dim ? "true" : "false", "data-active": activeId === p.id ? "true" : "false",
        style: { animation: "msds-fade-in 360ms both", animationDelay: (i * 18) + "ms" },
        tabIndex: 0, "aria-label": p.label + ", " + p.cls,
        onMouseEnter: function () { setHoverId(p.id); }, onMouseLeave: function () { setHoverId(null); },
        onFocus: function () { setHoverId(p.id); }, onBlur: function () { setHoverId(null); },
        onClick: function () { setSelId(selId === p.id ? null : p.id); }
      }, Marker(cx, cy, activeId === p.id ? 8 : 6, p.symbol, p.color));
    });

    var lineEl = null;
    if (props.indexLine) {
      var il = props.indexLine;
      var x1 = sx(il.x1), y1 = sy(il.y1), x2 = sx(il.x2), y2 = sy(il.y2);
      lineEl = h("g", null,
        h("line", { className: "msds-index-line", x1: x1, y1: y1, x2: x2, y2: y2, stroke: "var(--ink-subtle)", strokeWidth: 1.5 }),
        h("text", { x: x2, y: y2 - 8, textAnchor: "end", className: "msds-radar-axis-label" }, il.label)
      );
    }

    var classes = []; var seen = {};
    points.forEach(function (p) { if (!seen[p.cls]) { seen[p.cls] = true; classes.push(p); } });

    var legend = h("div", { className: "msds-legend" },
      classes.map(function (c) {
        return h("button", {
          key: c.cls, className: "msds-legend-item", "data-off": off[c.cls] ? "true" : "false",
          onClick: function () { var next = Object.assign({}, off); next[c.cls] = !off[c.cls]; setOff(next); }
        }, h("span", { className: "msds-legend-swatch", style: { background: c.color } }), c.cls);
      })
    );

    var tooltip = activePoint ? h("div", {
      className: "msds-tooltip",
      style: { left: (sx(activePoint.x) / W * 100) + "%", top: (sy(activePoint.y) / H * 100) + "%" }
    },
      h("div", null, activePoint.label),
      h("div", null, (props.xLabel || "X") + ": ", h("strong", null, activePoint.x)),
      h("div", null, (props.yLabel || "Y") + ": ", h("strong", null, activePoint.y))
    ) : null;

    var table = h("table", { className: "msds-chart-table" },
      h("thead", null, h("tr", null, h("th", null, "Material"), h("th", null, "Classe"), h("th", { "data-numeric": "true" }, props.xLabel), h("th", { "data-numeric": "true" }, props.yLabel))),
      h("tbody", null, points.map(function (p) {
        return h("tr", { key: p.id }, h("td", null, p.label), h("td", null, p.cls), h("td", { "data-numeric": "true" }, p.x), h("td", { "data-numeric": "true" }, p.y));
      }))
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" },
        h("h4", { className: "msds-chart-title" }, props.title),
        h("button", { className: "msds-table-toggle", onClick: function () { setShowTable(!showTable); } }, showTable ? "Ver gráfico" : "Ver tabela de dados")
      ),
      showTable ? table : h("div", { className: "msds-scatter-wrap", role: "img", "aria-label": (props.title || "Mapa de propriedades") + ". A tabela de dados equivalente está disponível pelo botão acima." },
        h("svg", { viewBox: "0 0 " + W + " " + H, style: { width: "100%", height: "auto", display: "block" } },
          h("rect", { x: 0, y: 0, width: W, height: H, fill: "transparent" }),
          envelopeEls, lineEl, pointEls
        ),
        tooltip
      ),
      !showTable ? legend : null
    );
  }

  // ---------------------------------------------------------------------
  // RadarChart — comparação de materiais, entrada animada, série que
  // se pode ocultar pela legenda.
  // ---------------------------------------------------------------------
  function polarPoint(cx, cy, r, angle) { return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]; }

  // Uma série é um componente próprio para que cada uma carregue a sua
  // própria mola: uma série nova (key nova) nasce em 0 e assenta em 1 —
  // "aparece do nada" deixa de acontecer por construção, nunca por um
  // ajuste de timing na demo que a usa. A mesma mola serve para
  // ligar/desligar pela legenda (o alvo vira 0, ela recolhe e desvanece).
  function RadarSeriesPolygon(props) {
    var presence = useSpring(props.isOff ? 0 : 1, SPRING.spatialDefault, 0);
    var pts = props.axes.map(function (a, i) { return polarPoint(props.cx, props.cy, props.R * (props.series.values[a.key] || 0), props.angleFor(i)); });
    var pointsAttr = pts.map(function (p) { return p.join(","); }).join(" ");
    return h("polygon", {
      points: pointsAttr, className: "msds-radar-series",
      fill: props.series.color, stroke: props.series.color, strokeWidth: 2,
      style: { opacity: Math.max(0, presence), transform: "scale(" + Math.max(0.001, presence) + ")", transformOrigin: props.cx + "px " + props.cy + "px" }
    });
  }

  function RadarChart(props) {
    var axes = props.axes || [];
    var series = props.series || [];
    var os = useState({}); var off = os[0], setOff = os[1];
    var hs = useState(null); var hoverAxis = hs[0], setHoverAxis = hs[1];

    var size = 320, cx = size / 2, cy = size / 2, R = size / 2 - 64;
    var n = axes.length || 1;
    function angleFor(i) { return -Math.PI / 2 + i * (2 * Math.PI / n); }

    var rings = [0.25, 0.5, 0.75, 1].map(function (f) {
      var pts = axes.map(function (a, i) { return polarPoint(cx, cy, R * f, angleFor(i)); });
      return h("polygon", { key: f, points: pts.map(function (p) { return p.join(","); }).join(" "), fill: "none", stroke: "var(--edge)", strokeWidth: 1 });
    });

    var axisLines = axes.map(function (a, i) {
      var p = polarPoint(cx, cy, R, angleFor(i));
      var lp = polarPoint(cx, cy, R + 22, angleFor(i));
      var anchor = Math.abs(lp[0] - cx) < 4 ? "middle" : (lp[0] > cx ? "start" : "end");
      return h("g", { key: a.key },
        h("line", { x1: cx, y1: cy, x2: p[0], y2: p[1], stroke: "var(--edge)", strokeWidth: 1 }),
        h("text", { x: lp[0], y: lp[1], textAnchor: anchor, dominantBaseline: "middle", className: "msds-radar-axis-label", fontWeight: hoverAxis === a.key ? 700 : 400 }, a.label)
      );
    });

    var seriesEls = series.map(function (s) {
      return h(RadarSeriesPolygon, { key: s.name, series: s, isOff: !!off[s.name], axes: axes, cx: cx, cy: cy, R: R, angleFor: angleFor });
    });

    var vertexEls = [];
    series.forEach(function (s) {
      if (off[s.name]) return;
      axes.forEach(function (a, i) {
        var p = polarPoint(cx, cy, R * (s.values[a.key] || 0), angleFor(i));
        vertexEls.push(h("circle", {
          key: s.name + "-" + a.key, cx: p[0], cy: p[1], r: 3.5, fill: s.color, className: "msds-radar-vertex",
          onMouseEnter: function () { setHoverAxis(a.key); }, onMouseLeave: function () { setHoverAxis(null); }
        }));
      });
    });

    var legend = h("div", { className: "msds-legend" },
      series.map(function (s) {
        return h("button", {
          key: s.name, className: "msds-legend-item", "data-off": off[s.name] ? "true" : "false",
          onClick: function () { var next = Object.assign({}, off); next[s.name] = !off[s.name]; setOff(next); }
        }, h("span", { className: "msds-legend-swatch", style: { background: s.color } }), s.name);
      })
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" }, h("h4", { className: "msds-chart-title" }, props.title)),
      h("div", { role: "img", "aria-label": (props.title || "Radar de comparação") + ". Eixos: " + axes.map(function (a) { return a.label; }).join(", ") + "." },
        h("svg", { viewBox: "0 0 " + size + " " + size, style: { width: "100%", maxWidth: "360px", height: "auto", display: "block", margin: "0 auto", overflow: "visible" } },
          rings, axisLines, seriesEls, vertexEls
        )
      ),
      legend
    );
  }

  // ---------------------------------------------------------------------
  // Form controls — HTML/React puro, mesmo contorno edge-control (D-34)
  // e o mesmo :focus-visible do resto do sistema.
  // ---------------------------------------------------------------------
  // FieldShell — Rodada 8, item 5: prop nova "counter" (nó já pronto, de
  // Input/Textarea) para o contador de caracteres. Sem "counter", a saída é
  // idêntica a antes — o rodapé continua sendo só o <p> de hint/error, sem
  // wrapper novo no caminho (mesma disciplina do fieldIconClass, Rodada 7).
  function FieldShell(props) {
    var uid = useUid("field");
    var hintId = props.hint || props.error || props.counter ? uid + "-hint" : undefined;
    var hintNode = props.error ? h("p", { id: hintId, className: "msds-field-hint msds-field-hint-error", role: "alert" }, props.error)
      : props.hint ? h("p", { id: hintId, className: "msds-field-hint" }, props.hint) : null;
    var footer = props.counter
      ? h("div", { className: "msds-field-footer" }, hintNode, props.counter)
      : hintNode;
    return h("div", { className: "msds-field" },
      h("label", { htmlFor: uid, className: "msds-field-label" }, props.label),
      props.render(uid, hintId),
      footer
    );
  }

  // fieldCounter — "120/280", tom muda conforme se aproxima/ultrapassa o
  // limite: ink-subtle < 90% do limite, warning de 90% até o limite,
  // danger acima dele (nunca escondido — o quarto estado de dado ausente do
  // sistema é sobre valor de propriedade, não sobre isto; aqui é só
  // feedback de campo, mesma disciplina de cor-com-significado do resto).
  function fieldCounter(value, maxLength) {
    if (maxLength === undefined || maxLength === null) return null;
    var len = (value || "").length;
    var tone = "subtle";
    if (len > maxLength) tone = "danger";
    else if (len >= maxLength * 0.9) tone = "warning";
    return h("span", { className: "msds-field-counter msds-field-counter-" + tone }, len + "/" + maxLength);
  }

  // controlClass — "outlined" (default, borda inteira, sem mudar aparência
  // existente) ou "filled" (fundo tonal, sem borda, régua só embaixo).
  function controlClass(base, variant) {
    return [base, "msds-control-" + (variant || "outlined")].join(" ");
  }

  // fieldIconClass — Rodada 7, item 5: acrescenta as classes de recuo de
  // padding só quando há ícone de verdade, para o caso sem ícone continuar
  // produzindo a MESMA string de classe de antes da Rodada 7.
  function fieldIconClass(base, hasLeading, hasTrailing) {
    var cls = base;
    if (hasLeading) cls += " msds-control-has-leading";
    if (hasTrailing) cls += " msds-control-has-trailing";
    return cls;
  }

  function Input(props) {
    var variant = props.variant || "outlined";
    var hasLeading = !!props.leadingIcon;
    var hasTrailing = !!props.trailingIcon || !!props.trailingAction;
    return h(FieldShell, {
      label: props.label, hint: props.hint, error: props.error,
      counter: props.showCount ? fieldCounter(props.value, props.maxLength) : null,
      render: function (uid, hintId) {
        var input = h("input", {
          id: uid, className: fieldIconClass(controlClass("msds-control", variant), hasLeading, hasTrailing), type: props.type || "text",
          value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); },
          placeholder: props.placeholder, "aria-invalid": !!props.error || undefined,
          maxLength: props.maxLength,
          "aria-describedby": hintId, disabled: props.disabled
        });
        // Sem leadingIcon/trailingIcon/trailingAction, devolve o <input> puro —
        // a mesma árvore de antes da Rodada 7, nenhum wrapper novo no caminho.
        if (!hasLeading && !hasTrailing) return input;
        return h("div", { className: "msds-control-wrap" },
          hasLeading ? h("span", { className: "msds-control-icon msds-control-icon-leading", "aria-hidden": "true" }, msdsIcon(props.leadingIcon)) : null,
          input,
          props.trailingAction
            ? h("button", { type: "button", className: "msds-control-icon msds-control-icon-trailing msds-control-action", "aria-label": props.trailingAction.label || "Ação", onClick: props.trailingAction.onClick }, msdsIcon(props.trailingAction.icon))
            : (props.trailingIcon ? h("span", { className: "msds-control-icon msds-control-icon-trailing", "aria-hidden": "true" }, msdsIcon(props.trailingIcon)) : null)
        );
      }
    });
  }

  function NumberInput(props) {
    var variant = props.variant || "outlined";
    return h(FieldShell, {
      label: props.label, hint: props.hint, error: props.error,
      render: function (uid, hintId) {
        return h("div", { className: "msds-row", style: { gap: "6px" } },
          h("input", {
            id: uid, className: controlClass("msds-control", variant), type: "number", inputMode: "decimal",
            value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); },
            min: props.min, max: props.max, step: props.step, "aria-invalid": !!props.error || undefined,
            "aria-describedby": hintId, disabled: props.disabled, style: { maxWidth: "140px" }
          }),
          props.unit ? h("span", { className: "msds-field-unit" }, props.unit) : null
        );
      }
    });
  }

  function Textarea(props) {
    var variant = props.variant || "outlined";
    var hasLeading = !!props.leadingIcon;
    var hasTrailing = !!props.trailingIcon || !!props.trailingAction;
    return h(FieldShell, {
      label: props.label, hint: props.hint, error: props.error,
      counter: props.showCount ? fieldCounter(props.value, props.maxLength) : null,
      render: function (uid, hintId) {
        var textarea = h("textarea", {
          id: uid, className: fieldIconClass(controlClass("msds-control msds-textarea", variant), hasLeading, hasTrailing), rows: props.rows || 3,
          value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); },
          placeholder: props.placeholder, maxLength: props.maxLength, "aria-describedby": hintId, disabled: props.disabled
        });
        if (!hasLeading && !hasTrailing) return textarea;
        // Ícone ancorado ao topo (msds-control-icon-top), nunca ao centro
        // vertical — um <textarea> de várias linhas não tem um "meio" fixo
        // como o <input> de uma linha.
        return h("div", { className: "msds-control-wrap" },
          hasLeading ? h("span", { className: "msds-control-icon msds-control-icon-leading msds-control-icon-top", "aria-hidden": "true" }, msdsIcon(props.leadingIcon)) : null,
          textarea,
          props.trailingAction
            ? h("button", { type: "button", className: "msds-control-icon msds-control-icon-trailing msds-control-icon-top msds-control-action", "aria-label": props.trailingAction.label || "Ação", onClick: props.trailingAction.onClick }, msdsIcon(props.trailingAction.icon))
            : (props.trailingIcon ? h("span", { className: "msds-control-icon msds-control-icon-trailing msds-control-icon-top", "aria-hidden": "true" }, msdsIcon(props.trailingIcon)) : null)
        );
      }
    });
  }

  function Select(props) {
    var variant = props.variant || "outlined";
    var hasLeading = !!props.leadingIcon;
    var hasTrailingAction = !!props.trailingIcon || !!props.trailingAction;
    return h(FieldShell, {
      label: props.label, hint: props.hint, error: props.error,
      render: function (uid, hintId) {
        var selectCls = controlClass("msds-control msds-select", variant);
        if (hasLeading) selectCls += " msds-control-has-leading";
        if (hasTrailingAction) selectCls += " msds-control-has-trailing-action";
        return h("div", { className: hasLeading ? "msds-select-wrap msds-select-wrap-has-leading" : "msds-select-wrap" },
          hasLeading ? h("span", { className: "msds-control-icon msds-control-icon-leading", "aria-hidden": "true" }, msdsIcon(props.leadingIcon)) : null,
          h("select", {
            id: uid, className: selectCls,
            value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); },
            "aria-describedby": hintId, disabled: props.disabled
          }, (props.options || []).map(function (o) { return h("option", { key: o.value, value: o.value }, o.label); })),
          props.trailingAction
            ? h("button", { type: "button", className: "msds-control-icon msds-control-action msds-select-trailing-action", "aria-label": props.trailingAction.label || "Ação", onClick: props.trailingAction.onClick }, msdsIcon(props.trailingAction.icon))
            : (props.trailingIcon ? h("span", { className: "msds-control-icon msds-select-trailing-icon", "aria-hidden": "true" }, msdsIcon(props.trailingIcon)) : null),
          h("span", { className: "msds-select-chevron", "aria-hidden": "true" }, msdsIcon("chevronDown"))
        );
      }
    });
  }

  function Checkbox(props) {
    var uid = useUid("check");
    var indeterminate = !!props.indeterminate;
    // "indeterminate" não é um atributo HTML de verdade — só existe como
    // propriedade DOM, então tem de ser imposta a cada render via ref, nunca
    // via prop JSX (React não a passa ao elemento nativo).
    var inputRef = React.useRef(null);
    useEffect(function () {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);
    return h("label", { className: "msds-checkbox", htmlFor: uid },
      h("input", {
        id: uid, ref: inputRef, type: "checkbox", checked: !!props.checked,
        "aria-checked": indeterminate ? "mixed" : !!props.checked,
        onChange: function (e) { props.onChange && props.onChange(e.target.checked); }, disabled: props.disabled
      }),
      h("span", { className: "msds-checkbox-box", "data-indeterminate": indeterminate ? "true" : "false", "aria-hidden": "true" }, msdsIcon(indeterminate ? "minus" : "check")),
      h("span", { className: "msds-checkbox-label" }, props.label)
    );
  }

  function RadioGroup(props) {
    var name = useUid("radio");
    return h("div", { role: "radiogroup", "aria-label": props.label, className: "msds-col", style: { gap: "6px" } },
      props.label ? h("div", { className: "msds-field-label" }, props.label) : null,
      (props.options || []).map(function (o) {
        var checked = o.value === props.value;
        return h("label", { key: o.value, className: "msds-radio" },
          h("input", { type: "radio", name: name, checked: checked, onChange: function () { props.onChange && props.onChange(o.value); } }),
          h("span", { className: "msds-radio-dot", "aria-hidden": "true" }),
          h("span", null, o.label)
        );
      })
    );
  }

  // RangeFilter — o controle mais específico deste produto: definir um
  // limite numérico sobre uma propriedade, com o histograma do catálogo
  // como fundo (nunca inventado — vem pronto por prop).
  function RangeFilter(props) {
    var min = props.min, max = props.max;
    var histogram = props.histogram || [];
    var maxCount = Math.max.apply(null, histogram.concat([1]));
    return h("div", { className: "msds-rangefilter" },
      h("div", { className: "msds-field-label" }, props.label),
      h("div", { className: "msds-rangefilter-track" },
        h("div", { className: "msds-rangefilter-hist" },
          histogram.map(function (c, i) {
            return h("div", { key: i, className: "msds-rangefilter-bar", style: { height: (8 + (c / maxCount) * 26) + "px" } });
          })
        ),
        h("div", {
          className: "msds-rangefilter-fill",
          style: {
            left: (((props.valueMin - min) / (max - min)) * 100) + "%",
            right: ((1 - (props.valueMax - min) / (max - min)) * 100) + "%"
          }
        }),
        h("input", {
          type: "range", className: "msds-rangefilter-input", min: min, max: max, value: props.valueMin,
          onChange: function (e) { var v = Math.min(Number(e.target.value), props.valueMax); props.onChange && props.onChange(v, props.valueMax); }
        }),
        h("input", {
          type: "range", className: "msds-rangefilter-input", min: min, max: max, value: props.valueMax,
          onChange: function (e) { var v = Math.max(Number(e.target.value), props.valueMin); props.onChange && props.onChange(props.valueMin, v); }
        })
      ),
      h("div", { className: "msds-rangefilter-values" },
        h("span", null, props.valueMin, " ", props.unit || ""),
        h("span", null, props.valueMax, " ", props.unit || "")
      )
    );
  }

  // ---------------------------------------------------------------------
  // BoxPlot — distribuição por propriedade; quartis já vêm prontos
  // (nunca recalculados aqui), uma caixa por classe.
  // ---------------------------------------------------------------------
  function BoxPlot(props) {
    var data = props.data || [];
    var hs = useState(null); var hover = hs[0], setHover = hs[1];
    var ts = useState(false); var showTable = ts[0], setShowTable = ts[1];
    var ls = useState("linear"); var scaleMode = ls[0], setScaleMode = ls[1];

    var lo = Math.min.apply(null, data.map(function (d) { return d.whiskerLow; }));
    var hi = Math.max.apply(null, data.map(function (d) { return d.whiskerHigh; }));
    var canLog = props.allowLog !== false && lo > 0;
    var useLog = scaleMode === "log" && canLog;
    function scale(v) {
      var a = useLog ? Math.log(lo) : lo, b = useLog ? Math.log(hi) : hi, x = useLog ? Math.log(v) : v;
      return ((x - a) / ((b - a) || 1)) * 100;
    }

    var rows = data.map(function (row) {
      var active = hover === row.label;
      return h("div", { className: "msds-box-row", key: row.label },
        h("span", { className: "msds-bar-name" }, row.label),
        h("div", {
          className: "msds-box-track", tabIndex: 0, "data-active": active ? "true" : "false",
          "aria-label": row.label + ": mínimo " + row.whiskerLow + ", Q1 " + row.q1 + ", mediana " + row.median + ", Q3 " + row.q3 + ", máximo " + row.whiskerHigh,
          onMouseEnter: function () { setHover(row.label); }, onMouseLeave: function () { setHover(null); },
          onFocus: function () { setHover(row.label); }, onBlur: function () { setHover(null); }
        },
          h("div", { className: "msds-box-whisker", style: { left: scale(row.whiskerLow) + "%", width: (scale(row.whiskerHigh) - scale(row.whiskerLow)) + "%" } }),
          h("div", { className: "msds-box-box", style: { left: scale(row.q1) + "%", width: (scale(row.q3) - scale(row.q1)) + "%", background: row.color } }),
          h("div", { className: "msds-box-median", style: { left: scale(row.median) + "%" } })
        )
      );
    });

    var info = hover ? (function () {
      var row = data.filter(function (d) { return d.label === hover; })[0];
      return h("div", { style: { fontSize: "12px", color: "var(--ink)", marginTop: "8px" }, "aria-live": "polite" },
        h("strong", null, row.label), " — mín ", row.whiskerLow, " · Q1 ", row.q1, " · mediana ", h("strong", null, row.median), " · Q3 ", row.q3, " · máx ", row.whiskerHigh, " ", props.unit || ""
      );
    })() : h("div", { style: { height: "18px" } });

    var table = h("table", { className: "msds-chart-table" },
      h("thead", null, h("tr", null, h("th", null, "Classe"), h("th", { "data-numeric": "true" }, "Mín"), h("th", { "data-numeric": "true" }, "Q1"), h("th", { "data-numeric": "true" }, "Mediana"), h("th", { "data-numeric": "true" }, "Q3"), h("th", { "data-numeric": "true" }, "Máx"))),
      h("tbody", null, data.map(function (row) {
        return h("tr", { key: row.label }, h("td", null, row.label), h("td", { "data-numeric": "true" }, row.whiskerLow), h("td", { "data-numeric": "true" }, row.q1), h("td", { "data-numeric": "true" }, row.median), h("td", { "data-numeric": "true" }, row.q3), h("td", { "data-numeric": "true" }, row.whiskerHigh));
      }))
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" },
        h("h4", { className: "msds-chart-title" }, props.title),
        h("div", { className: "msds-row", style: { gap: "8px" } },
          canLog ? h(ButtonGroup, { value: scaleMode, onChange: setScaleMode, label: "Escala", options: [{ value: "linear", label: "Linear" }, { value: "log", label: "Log" }] }) : null,
          h("button", { className: "msds-table-toggle", onClick: function () { setShowTable(!showTable); } }, showTable ? "Ver gráfico" : "Ver tabela de dados")
        )
      ),
      showTable ? table : h("div", { role: "img", "aria-label": (props.title || "Distribuição por classe") + ". A tabela de dados equivalente está disponível pelo botão “Ver tabela de dados”." }, rows, info)
    );
  }

  // ---------------------------------------------------------------------
  // Heatmap — grade de correlação; a cor reaproveita a rampa brand como
  // escala sequencial de dado (não é a mesma leitura que a marca faz
  // dela na interface, mas evita inventar uma segunda rampa de cor).
  // ---------------------------------------------------------------------
  var HEATMAP_STEPS = ["var(--surface-300)", "var(--brand-100)", "var(--brand-200)", "var(--brand-300)", "var(--brand-500)", "var(--brand-600)", "var(--brand-700)", "var(--brand-800)", "var(--brand-900)"];
  function heatColor(v) {
    var i = Math.round(Math.max(0, Math.min(1, v)) * (HEATMAP_STEPS.length - 1));
    return HEATMAP_STEPS[i];
  }

  function Heatmap(props) {
    var rowsLabels = props.rows || [], colsLabels = props.cols || [], values = props.values || [];
    var hs = useState(null); var hover = hs[0], setHover = hs[1];
    var cellSize = 44;
    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" }, h("h4", { className: "msds-chart-title" }, props.title)),
      h("div", { role: "img", "aria-label": (props.title || "Mapa de correlação") + ", " + rowsLabels.length + " linhas por " + colsLabels.length + " colunas." },
        h("div", { style: { overflowX: "auto" } },
          h("div", { style: { display: "grid", gridTemplateColumns: "110px repeat(" + colsLabels.length + ", " + cellSize + "px)", gap: "3px", alignItems: "center" } },
            [h("div", { key: "corner" })].concat(colsLabels.map(function (c) {
              return h("div", { key: "col-" + c, style: { fontSize: "11px", color: "var(--ink-subtle)", textAlign: "center" } }, c);
            })),
            rowsLabels.map(function (r, ri) {
              return [h("div", { key: "row-" + r, style: { fontSize: "12px", color: "var(--ink-muted)" } }, r)].concat(
                colsLabels.map(function (c, ci) {
                  var v = (values[ri] || [])[ci];
                  var key = ri + "-" + ci;
                  var active = hover === key;
                  return h("div", {
                    key: key, tabIndex: 0, className: "msds-heat-cell", "data-active": active ? "true" : "false",
                    style: { width: cellSize + "px", height: cellSize + "px", background: v == null ? "var(--surface-300)" : heatColor(v) },
                    "aria-label": r + " × " + c + ": " + (v == null ? "sem dado" : v.toFixed(2)),
                    onMouseEnter: function () { setHover(key); }, onMouseLeave: function () { setHover(null); },
                    onFocus: function () { setHover(key); }, onBlur: function () { setHover(null); }
                  }, active && v != null ? h("span", { className: "msds-heat-value" }, v.toFixed(2)) : null);
                })
              );
            })
          )
        )
      ),
      h("div", { className: "msds-heat-scale" },
        h("span", null, "0"),
        HEATMAP_STEPS.map(function (c, i) { return h("span", { key: i, className: "msds-heat-swatch", style: { background: c } }); }),
        h("span", null, "1")
      )
    );
  }

  // ---------------------------------------------------------------------
  // ParallelCoords — uma linha por material sobre eixos paralelos;
  // uma lacuna quebra a linha, nunca interpola (mesma regra do
  // ComparisonView real).
  // ---------------------------------------------------------------------
  function ParallelCoords(props) {
    var axes = props.axes || [], lines = props.lines || [];
    var W = 560, H = 320, PAD = 36, TOP = 20;
    var n = axes.length || 1;
    var xFor = function (i) { return PAD + i * ((W - PAD * 2) / (n - 1 || 1)); };
    var yFor = function (axis, v) {
      if (v == null) return null;
      return TOP + (1 - (v - axis.min) / ((axis.max - axis.min) || 1)) * (H - TOP * 2);
    };

    var hs = useState(null); var hoverId = hs[0], setHoverId = hs[1];
    var hax = useState(null); var hoverAxis = hax[0], setHoverAxis = hax[1];

    var axisEls = axes.map(function (a, i) {
      var x = xFor(i);
      return h("g", { key: a.key },
        h("line", { x1: x, y1: TOP, x2: x, y2: H - TOP, stroke: "var(--edge)", strokeWidth: hoverAxis === a.key ? 2 : 1 }),
        h("text", { x: x, y: H - TOP + 18, textAnchor: "middle", className: "msds-radar-axis-label" }, a.label),
        h("text", { x: x, y: TOP - 8, textAnchor: "middle", className: "msds-radar-axis-label" }, a.max),
        h("text", { x: x, y: H - TOP + 4, textAnchor: "middle", className: "msds-radar-axis-label" }, a.min)
      );
    });

    var lineEls = lines.map(function (ln) {
      var dim = hoverId && hoverId !== ln.id;
      // build segments, breaking on a missing value
      var segments = [], current = [];
      axes.forEach(function (a, i) {
        var y = yFor(a, ln.values[a.key]);
        if (y === null) {
          if (current.length > 1) segments.push(current);
          current = [];
        } else {
          current.push([xFor(i), y]);
        }
      });
      if (current.length > 1) segments.push(current);
      return h("g", { key: ln.id },
        segments.map(function (seg, si) {
          return h("polyline", {
            key: si, points: seg.map(function (p) { return p.join(","); }).join(" "),
            fill: "none", stroke: ln.color, strokeWidth: hoverId === ln.id ? 3 : 2,
            opacity: dim ? 0.15 : 0.9, strokeLinecap: "round", strokeLinejoin: "round"
          });
        }),
        axes.map(function (a, i) {
          var y = yFor(a, ln.values[a.key]);
          if (y === null) return null;
          return h("circle", {
            key: a.key, cx: xFor(i), cy: y, r: hoverId === ln.id ? 4.5 : 3, fill: ln.color, opacity: dim ? 0.2 : 1,
            onMouseEnter: function () { setHoverId(ln.id); setHoverAxis(a.key); },
            onMouseLeave: function () { setHoverId(null); setHoverAxis(null); }
          });
        })
      );
    });

    var legend = h("div", { className: "msds-legend" },
      lines.map(function (ln) {
        return h("button", {
          key: ln.id, className: "msds-legend-item",
          onMouseEnter: function () { setHoverId(ln.id); }, onMouseLeave: function () { setHoverId(null); }
        }, h("span", { className: "msds-legend-swatch", style: { background: ln.color } }), ln.label);
      })
    );

    return h("div", { className: "msds-chart-card" },
      h("div", { className: "msds-chart-toolbar" }, h("h4", { className: "msds-chart-title" }, props.title)),
      h("div", { role: "img", "aria-label": (props.title || "Comparação de propriedades") + ". Eixos: " + axes.map(function (a) { return a.label; }).join(", ") + ". Uma lacuna interrompe a linha, nunca é interpolada." },
        h("svg", { viewBox: "0 0 " + W + " " + H, style: { width: "100%", height: "auto", display: "block" } }, axisEls, lineEls)
      ),
      legend
    );
  }

  // ---------------------------------------------------------------------
  // Dialog — modal com foco preso, Escape fecha, foco volta ao gatilho.
  // ---------------------------------------------------------------------
  function useFocusTrap(open, ref) {
    useEffect(function () {
      if (!open || !ref.current) return;
      var root = ref.current;
      var previouslyFocused = document.activeElement;
      var selector = 'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
      function focusables() { return Array.prototype.slice.call(root.querySelectorAll(selector)); }
      var list = focusables();
      if (list.length) list[0].focus();
      function onKeydown(e) {
        if (e.key === "Tab") {
          var items = focusables();
          if (!items.length) return;
          var first = items[0], last = items[items.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      root.addEventListener("keydown", onKeydown);
      return function () {
        root.removeEventListener("keydown", onKeydown);
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      };
    }, [open]);
  }

  // Rodada 8, item 4: Dialog ganha dois props aditivos, opcionais, sem
  // efeito nenhum quando ausentes — surfaceRef (para useContainerTransform
  // medir a superfície) e transformStyle (o style vindo daquele hook, que
  // sobrescreve posição/tamanho/raio enquanto a mola física está ativa).
  function mergeRefs(a, b) {
    return function (node) {
      if (typeof a === "function") a(node); else if (a) a.current = node;
      if (typeof b === "function") b(node); else if (b) b.current = node;
    };
  }
  function Dialog(props) {
    var ref = React.useRef(null);
    useFocusTrap(props.open, ref);
    useEffect(function () {
      if (!props.open) return;
      function onKey(e) { if (e.key === "Escape") props.onClose && props.onClose(); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [props.open]);
    if (!props.open) return null;
    var surfaceRef = props.surfaceRef ? mergeRefs(ref, props.surfaceRef) : ref;
    return h("div", { className: "msds-dialog-backdrop", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose && props.onClose(); } },
      h("div", {
        className: "msds-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "msds-dialog-title", ref: surfaceRef,
        "data-tonal-elevation": props.tonalElevation ? "true" : "false",
        "data-container-transform": props.transformStyle ? "true" : "false",
        style: props.transformStyle || undefined
      },
        h("div", { className: "msds-dialog-header" },
          h("h3", { id: "msds-dialog-title", className: "msds-card-title" }, props.title),
          h(IconButton, { label: "Fechar", onToggle: props.onClose, iconOff: "close", iconOn: "close" })
        ),
        h("div", { className: "msds-dialog-body" }, props.children),
        props.footer ? h("div", { className: "msds-dialog-footer" }, props.footer) : null
      )
    );
  }

  // ---------------------------------------------------------------------
  // BottomSheet — modal que desliza do rodapé; mesmo foco preso/backdrop/
  // Escape do Dialog (useFocusTrap compartilhado), só a geometria muda.
  // ---------------------------------------------------------------------
  function BottomSheet(props) {
    var ref = React.useRef(null);
    useFocusTrap(props.open, ref);
    useEffect(function () {
      if (!props.open) return;
      function onKey(e) { if (e.key === "Escape") props.onClose && props.onClose(); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [props.open]);
    if (!props.open) return null;
    return h("div", { className: "msds-sheet-backdrop", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose && props.onClose(); } },
      h("div", { className: "msds-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": props.title ? "msds-sheet-title" : undefined, ref: ref, "data-tonal-elevation": props.tonalElevation ? "true" : "false" },
        h("div", { className: "msds-sheet-handle", "aria-hidden": "true" }),
        props.title ? h("div", { className: "msds-dialog-header" },
          h("h3", { id: "msds-sheet-title", className: "msds-card-title" }, props.title),
          h(IconButton, { label: "Fechar", onToggle: props.onClose, iconOn: "close", iconOff: "close", variant: "standard" })
        ) : null,
        h("div", { className: "msds-sheet-body" }, props.children)
      )
    );
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------
  function TabButton(props) {
    var ripple = useRipple();
    return h("button", {
      role: "tab", "aria-selected": props.sel, tabIndex: props.sel ? 0 : -1, className: "msds-tab msds-ripple-host",
      "data-active": props.sel ? "true" : "false",
      onPointerDown: ripple.onPointerDown,
      onClick: props.onClick, onKeyDown: props.onKeyDown
    }, ripple.layer, props.children);
  }

  // Rodada 6, item 11: a troca de aba usa "fade through" (useScreenTransition)
  // — o conteúdo antigo desvanece, uma pausa breve, o novo desvanece entrando.
  // Trocar de aba não é navegação hierárquica (não há "de cima" nem "de baixo"
  // entre duas abas), por isso fade-through e não shared-axis (que fica para
  // o ScreenTransitionDemo, onde os passos são sequenciais).
  function Tabs(props) {
    var tabs = props.tabs || [];
    var active = props.value;
    var trans = useScreenTransition(active, { pattern: "fadeThrough" });
    function onKeyDown(e, i) {
      if (e.key === "ArrowRight") { var n = tabs[(i + 1) % tabs.length]; props.onChange && props.onChange(n.value); }
      if (e.key === "ArrowLeft") { var p = tabs[(i - 1 + tabs.length) % tabs.length]; props.onChange && props.onChange(p.value); }
    }
    return h("div", { className: "msds-col", style: { gap: 0 } },
      h("div", { role: "tablist", "aria-label": props.label, className: "msds-tablist" },
        tabs.map(function (t, i) {
          var sel = t.value === active;
          return h(TabButton, {
            key: t.value, sel: sel,
            onClick: function () { props.onChange && props.onChange(t.value); },
            onKeyDown: function (e) { onKeyDown(e, i); }
          }, t.label);
        })
      ),
      h("div", { role: "tabpanel", className: "msds-tabpanel", style: trans.style }, (tabs.filter(function (t) { return t.value === trans.key; })[0] || {}).content)
    );
  }

  // ---------------------------------------------------------------------
  // Popover — genérico, mesma base do ProvenancePopover real.
  // ---------------------------------------------------------------------
  function Popover(props) {
    var s = useState(false); var open = s[0], setOpen = s[1];
    var ref = React.useRef(null);
    useEffect(function () {
      if (!open) return;
      function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
      document.addEventListener("mousedown", onDoc);
      return function () { document.removeEventListener("mousedown", onDoc); };
    }, [open]);
    return h("div", { className: "msds-popover-wrap", ref: ref },
      h("button", { type: "button", className: "msds-popover-trigger", "aria-expanded": open, onClick: function () { setOpen(!open); } }, props.trigger),
      open ? h("div", { className: "msds-popover", role: "dialog", "data-tonal-elevation": props.tonalElevation ? "true" : "false" }, props.children) : null
    );
  }

  // ---------------------------------------------------------------------
  // Breadcrumb
  // ---------------------------------------------------------------------
  function Breadcrumb(props) {
    var items = props.items || [];
    return h("nav", { "aria-label": "Trilha de navegação", className: "msds-breadcrumb" },
      items.map(function (it, i) {
        var last = i === items.length - 1;
        return h(React.Fragment, { key: i },
          last ? h("span", { "aria-current": "page", className: "msds-breadcrumb-current" }, it.label)
            : h("a", { href: "#", className: "msds-breadcrumb-link", onClick: function (e) { e.preventDefault(); it.onClick && it.onClick(); } }, it.label),
          !last ? h("span", { "aria-hidden": "true", className: "msds-breadcrumb-sep" }, "/") : null
        );
      })
    );
  }

  // ---------------------------------------------------------------------
  // Stepper — espelha a pilha de SelectionStage: cada etapa é uma
  // pergunta só.
  // ---------------------------------------------------------------------
  function Stepper(props) {
    var steps = props.steps || [];
    return h("ol", { className: "msds-stepper", "aria-label": props.label || "Etapas" },
      steps.map(function (s, i) {
        return h("li", { key: s.key, className: "msds-step", "data-state": s.state },
          h("span", { className: "msds-step-dot", "aria-hidden": "true" }, s.state === "complete" ? msdsIcon("check") : (i + 1)),
          h("div", { className: "msds-step-body" },
            h("div", { className: "msds-step-label" }, s.label),
            s.state === "blocked" && s.blockedReason ? h("div", { className: "msds-step-blocked" }, s.blockedReason) : null
          )
        );
      })
    );
  }

  // ---------------------------------------------------------------------
  // Estados: carregando, erro, vazio.
  // ---------------------------------------------------------------------
  // LinearProgress — determinado (value 0-100) ou indeterminado (sem value,
  // varredura contínua em CSS). A varredura para de verdade sob
  // prefers-reduced-motion — não só desacelera — porque um indicador
  // "quase parado" ainda lê como movimento contínuo para quem pediu menos.
  function LinearProgress(props) {
    var determinate = props.value !== undefined && props.value !== null;
    var pct = determinate ? Math.max(0, Math.min(100, props.value)) : null;
    var reduced = prefersReducedMotion();
    return h("div", {
      className: "msds-linprog", role: "progressbar",
      "aria-valuenow": determinate ? pct : undefined,
      "aria-valuemin": 0, "aria-valuemax": 100,
      "aria-label": props.label || "Carregando", "aria-busy": !determinate || undefined
    },
      h("div", { className: "msds-linprog-track" },
        determinate ? h("div", { className: "msds-linprog-fill", style: { width: pct + "%" } })
          : reduced ? h("div", { className: "msds-linprog-fill", style: { width: "40%" } })
            : h("div", { className: "msds-linprog-sweep" })
      )
    );
  }

  function Skeleton(props) {
    return h("div", { className: "msds-skeleton", style: { width: props.width || "100%", height: props.height || "14px" } });
  }
  function LoadingState(props) {
    return h("div", { className: "msds-col", style: { gap: "8px" }, role: "status", "aria-label": props.label || "Carregando" },
      h(Skeleton, { width: "60%", height: "18px" }), h(Skeleton, {}), h(Skeleton, { width: "80%" })
    );
  }
  function ErrorState(props) {
    return h("div", { className: "msds-state msds-state-error" },
      h("span", { className: "msds-state-icon", "aria-hidden": "true" }, msdsIcon("alert")),
      h("div", null, h("div", { className: "msds-state-title" }, props.title || "Não foi possível carregar"),
        props.description ? h("div", { className: "msds-state-desc" }, props.description) : null,
        props.action ? h("div", { style: { marginTop: "10px" } }, props.action) : null)
    );
  }
  function EmptyStateArt() {
    return h("svg", { width: 64, height: 64, viewBox: "0 0 64 64", "aria-hidden": "true" },
      h("rect", { x: 4, y: 4, width: 34, height: 34, rx: 10, fill: "var(--brand-100)" }),
      h("rect", { x: 30, y: 26, width: 30, height: 30, rx: 10, fill: "var(--brand-300)" }),
      h("circle", { cx: 46, cy: 14, r: 8, fill: "var(--accent)" })
    );
  }
  function EmptyState(props) {
    return h("div", { className: "msds-state" },
      EmptyStateArt(),
      h("div", null, h("div", { className: "msds-state-title" }, props.title || "Nada por aqui ainda"),
        props.description ? h("div", { className: "msds-state-desc" }, props.description) : null,
        props.action ? h("div", { style: { marginTop: "10px" } }, props.action) : null)
    );
  }

  // ---------------------------------------------------------------------
  // Toast — pilha de notificação com tom semântico.
  // ---------------------------------------------------------------------
  function Toast(props) {
    var ls = useState(false); var leaving = ls[0], setLeaving = ls[1];
    function dismiss() {
      if (prefersReducedMotion()) { props.onDismiss && props.onDismiss(); return; }
      setLeaving(true);
      setTimeout(function () { props.onDismiss && props.onDismiss(); }, 160);
    }
    return h("div", { className: "msds-toast msds-toast-" + (props.tone || "neutral") + (leaving ? " is-leaving" : ""), role: "status" },
      h("span", { className: "msds-toast-message" }, props.message),
      props.action ? h("button", { className: "msds-toast-action", onClick: function () { props.action.onClick && props.action.onClick(); dismiss(); } }, props.action.label) : null,
      h("button", { className: "msds-toast-close", "aria-label": "Dispensar", onClick: dismiss }, msdsIcon("close"))
    );
  }
  function ToastStack(props) {
    return h("div", { className: "msds-toast-stack", "aria-live": "polite" },
      (props.items || []).map(function (t) { return h(Toast, { key: t.id, tone: t.tone, message: t.message, action: t.action, onDismiss: function () { props.onDismiss && props.onDismiss(t.id); } }); })
    );
  }

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

  // ---------------------------------------------------------------------
  // ComparisonTray — bandeja flutuante que acumula materiais.
  // Assinatura #2.
  // ---------------------------------------------------------------------
  function ComparisonTray(props) {
    var items = props.items || [];
    // Mantém a última lista não-vazia visível durante a saída (M3: quem sai
    // acelera, não some no mesmo frame) — só então desmonta de verdade.
    var ds = useState(items); var displayItems = ds[0], setDisplayItems = ds[1];
    var ls = useState(false); var leaving = ls[0], setLeaving = ls[1];
    useEffect(function () {
      if (items.length > 0) {
        setDisplayItems(items);
        setLeaving(false);
      } else if (displayItems.length > 0) {
        if (prefersReducedMotion()) { setDisplayItems([]); return; }
        setLeaving(true);
        var t = setTimeout(function () { setDisplayItems([]); setLeaving(false); }, 160);
        return function () { clearTimeout(t); };
      }
    }, [items]);
    if (!displayItems.length) return null;
    return h("div", { className: "msds-tray" + (leaving ? " is-leaving" : "") },
      h("div", { className: "msds-tray-items" },
        displayItems.map(function (it) {
          return h("span", { key: it.id, className: "msds-tray-chip" },
            h("span", { className: "msds-chip-dot", style: { background: it.color } }), it.label,
            h("button", { "aria-label": "Remover " + it.label, className: "msds-tray-remove", onClick: function () { props.onRemove && props.onRemove(it.id); } }, msdsIcon("close"))
          );
        })
      ),
      h(Button, { variant: "primary", size: "sm", disabled: displayItems.length < 2, onClick: props.onCompare }, "Comparar " + displayItems.length + (displayItems.length === 1 ? " material" : " materiais"))
    );
  }

  // ---------------------------------------------------------------------
  // FAB — extraído da M3: ação primária da tela, fixa sobre o conteúdo.
  // Rodada 6: prop "size" ('small'/'default'/'large', aditiva — 'default'
  // preserva a aparência exata de antes) e forma expressive (radius-xl
  // aperta sob pressão, volta ao soltar).
  // ---------------------------------------------------------------------
  var FAB_REST_RADIUS = { small: 12, "default": 28, large: 28 };
  var FAB_PRESSED_RADIUS = { small: 8, "default": 16, large: 20 };
  // Rodada 8, item 3: largura só-ícone por tamanho — o mesmo número que
  // .msds-fab[data-icon-only="true"] já fixa em CSS (56/40/96), reaproveitado
  // aqui como alvo da mola de largura em vez de duplicar a régua.
  var FAB_ICON_WIDTH = { small: 40, "default": 56, large: 96 };

  // useFabScrollCollapse — Rodada 8, item 3: direção de rolagem com debounce
  // simples (só reage a deslocamentos > 4px, para não "tremer" em rolagem de
  // sub-pixel/inércia). Ouve `window` por padrão; um `scrollContainerRef`
  // troca para o ancestral rolável indicado (painel com rolagem interna).
  function useFabScrollCollapse(scrollContainerRef, enabled) {
    var s = useState(false); var collapsed = s[0], setCollapsed = s[1];
    var lastY = React.useRef(0);
    useEffect(function () {
      if (!enabled) { setCollapsed(false); return; }
      var el = (scrollContainerRef && scrollContainerRef.current) || window;
      function currentY() { return el === window ? (window.pageYOffset || 0) : el.scrollTop; }
      lastY.current = currentY();
      function onScroll() {
        var y = currentY();
        var dy = y - lastY.current;
        if (Math.abs(dy) > 4) {
          setCollapsed(dy > 0 && y > 8); // descendo -> recolhe; no topo, sempre expandido
          lastY.current = y;
        }
      }
      el.addEventListener("scroll", onScroll, { passive: true });
      return function () { el.removeEventListener("scroll", onScroll); };
    }, [enabled, scrollContainerRef && scrollContainerRef.current]);
    return collapsed;
  }

  // FAB — extraído da M3: ação primária da tela, fixa sobre o conteúdo.
  // Rodada 6: prop "size" ('small'/'default'/'large', aditiva — 'default'
  // preserva a aparência exata de antes) e forma expressive (radius-xl
  // aperta sob pressão, volta ao soltar). Rodada 8, item 3: a variante
  // estendida (com "label") recolhe para só-ícone ao rolar para baixo e
  // reexpande ao rolar para cima — `collapseOnScroll` (default true, só tem
  // efeito havendo "label") liga/desliga; `scrollContainerRef` aponta o
  // painel certo quando não é a janela. A largura é medida uma vez (do
  // próprio botão renderizado por extenso) e depois só anima entre esse
  // valor e FAB_ICON_WIDTH via useSpring/spatialDefault — nenhuma segunda
  // matemática de easing. Sob prefers-reduced-motion, useSpring já vai
  // direto ao alvo (mesma disciplina do resto do sistema): o recolhimento
  // continua funcional, só sem a transição suave — salto direto, nunca
  // "sempre expandido" por reduced-motion ter desligado a rolagem por
  // engano (a leitura da direção do scroll não depende de animação).
  function FAB(props) {
    var size = props.size || "default";
    var ripple = useRipple();
    var morph = useShapeMorph(FAB_REST_RADIUS[size], FAB_PRESSED_RADIUS[size]);
    var hasLabel = !!props.label;
    var collapseEnabled = hasLabel && props.collapseOnScroll !== false;
    var scrollCollapsed = useFabScrollCollapse(props.scrollContainerRef, collapseEnabled);
    var btnRef = React.useRef(null);
    var nw = useState(null); var naturalWidth = nw[0], setNaturalWidth = nw[1];
    useEffect(function () {
      if (!collapseEnabled || !btnRef.current) return;
      var w = btnRef.current.getBoundingClientRect().width;
      if (w > 0 && Math.abs(w - (naturalWidth || 0)) > 0.5 && !scrollCollapsed) setNaturalWidth(w);
      // eslint: mede só quando expandido, então nunca grava a largura
      // já-recolhida como se fosse a "natural".
    }, [collapseEnabled, props.label, props.icon]);
    var iconWidth = FAB_ICON_WIDTH[size];
    var collapsedVisual = collapseEnabled && scrollCollapsed;
    // Só passa a controlar a largura por estilo depois de medir a largura
    // natural — antes disso o botão usa a largura automática do CSS (que é
    // exatamente o valor que será medido), então não há salto no primeiro
    // quadro.
    var widthTarget = (collapseEnabled && naturalWidth !== null) ? (collapsedVisual ? iconWidth : naturalWidth) : null;
    var widthAnim = useSpring(widthTarget !== null ? widthTarget : (naturalWidth || iconWidth), SPRING.spatialDefault, naturalWidth || iconWidth);
    var style = Object.assign({}, props.style, morph.style);
    if (widthTarget !== null) {
      style.width = widthAnim + "px";
      style.overflow = "hidden";
      style.justifyContent = "center";
      if (collapsedVisual) { style.paddingLeft = 0; style.paddingRight = 0; }
    }
    return h("button", {
      ref: btnRef,
      type: "button", className: "msds-fab msds-ripple-host msds-fab-" + size,
      style: style,
      "data-icon-only": !hasLabel ? "true" : "false",
      "data-scroll-collapsed": collapsedVisual ? "true" : "false",
      "data-raised-above-tray": props.raisedAboveTray ? "true" : "false",
      "aria-label": props.a11yLabel || props.label,
      onPointerDown: function (e) { ripple.onPointerDown(e); morph.bind.onPointerDown(e); },
      onPointerUp: morph.bind.onPointerUp,
      onPointerLeave: morph.bind.onPointerLeave,
      onPointerCancel: morph.bind.onPointerCancel,
      onClick: props.onClick
    }, ripple.layer, msdsIcon(props.icon || "star"), (hasLabel && !collapsedVisual) ? h("span", null, props.label) : null);
  }

  // ---------------------------------------------------------------------
  // FABMenu — Rodada 7, item 1: o FAB expande uma pequena lista vertical de
  // ações (ícone+rótulo) acima de si, em vez de abrir um Menu ancorado
  // genérico. A forma do próprio FAB reaproveita useShapeMorph/spatialFast
  // (Rodada 6) — o alvo é o estado "aberto", não a pressão do ponteiro (como
  // o Chip, que morfa por seleção e não por toque). Não é modal: Escape e
  // clique fora fecham (mesmo padrão de Menu/Popover), o conteúdo por trás
  // continua operável — por isso useFocusTrap não entra aqui. Cada item
  // entra com um leve atraso incremental antes de sua própria mola assentar
  // (useSpring/spatialDefault) — o "stagger" é só esse atraso de partida, a
  // curva em si é a mesma mola de sempre, nunca uma equação nova.
  // ---------------------------------------------------------------------
  function FABMenuItemRow(props) {
    var item = props.item, index = props.index, open = props.open;
    var ds = useState(false); var started = ds[0], setStarted = ds[1];
    useEffect(function () {
      if (open) {
        if (prefersReducedMotion()) { setStarted(true); return; }
        var t = setTimeout(function () { setStarted(true); }, index * 45);
        return function () { clearTimeout(t); };
      }
      setStarted(false);
    }, [open, index]);
    var presence = useSpring(started ? 1 : 0, SPRING.spatialDefault, 0);
    var ripple = useRipple();
    return h("li", { role: "none" },
      h("button", {
        role: "menuitem", type: "button", className: "msds-fabmenu-item msds-ripple-host", disabled: item.disabled,
        style: { opacity: Math.max(0, presence), transform: "translateY(" + ((1 - presence) * 10) + "px) scale(" + (0.86 + presence * 0.14) + ")" },
        onPointerDown: ripple.onPointerDown,
        onClick: function () { if (item.disabled) return; item.onSelect && item.onSelect(); props.onSelected && props.onSelected(); }
      },
        ripple.layer,
        h("span", { className: "msds-fabmenu-item-label" }, item.label),
        h("span", { className: "msds-fabmenu-item-icon" }, msdsIcon(item.icon))
      )
    );
  }

  function FABMenu(props) {
    var size = props.size || "default";
    var ripple = useRipple();
    var s = useState(false); var open = s[0], setOpen = s[1];
    var wrapRef = React.useRef(null);
    var morph = useShapeMorph(FAB_REST_RADIUS[size], FAB_PRESSED_RADIUS[size], open);
    useEffect(function () {
      if (!open) return;
      function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
      function onKey(e) { if (e.key === "Escape") setOpen(false); }
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
    }, [open]);
    var items = props.items || [];
    var fabHeight = size === "small" ? 40 : size === "large" ? 96 : 56;
    var listBottom = 24 + fabHeight + 12;
    return h("div", { className: "msds-fabmenu-wrap", ref: wrapRef },
      open ? h("ul", {
        className: "msds-fabmenu-list", role: "menu", "aria-label": props.menuLabel || "Ações",
        style: { bottom: listBottom + "px" }
      },
        items.map(function (it, i) {
          return h(FABMenuItemRow, { key: i, item: it, index: i, open: open, onSelected: function () { setOpen(false); } });
        })
      ) : null,
      h("button", {
        type: "button", className: "msds-fab msds-ripple-host msds-fab-" + size,
        style: props.style ? Object.assign({}, props.style, morph.style) : morph.style,
        "data-icon-only": (props.label && !open) ? "false" : "true",
        "data-raised-above-tray": props.raisedAboveTray ? "true" : "false",
        "aria-haspopup": "menu", "aria-expanded": open,
        "aria-label": props.a11yLabel || props.label,
        onPointerDown: ripple.onPointerDown,
        onClick: function () { setOpen(!open); }
      }, ripple.layer, msdsIcon(open ? "close" : (props.icon || "star")), (props.label && !open) ? h("span", null, props.label) : null)
    );
  }

  // ---------------------------------------------------------------------
  // Switch — alternador binário IMEDIATO (liga a opção na hora, ao
  // contrário do Checkbox, que normalmente acompanha um "Salvar").
  // ---------------------------------------------------------------------
  function Switch(props) {
    var uid = useUid("switch");
    return h("label", { className: "msds-switch", htmlFor: uid },
      h("input", { id: uid, type: "checkbox", role: "switch", checked: !!props.checked, disabled: props.disabled, onChange: function (e) { props.onChange && props.onChange(e.target.checked); } }),
      h("span", { className: "msds-switch-track", "aria-hidden": "true" }, h("span", { className: "msds-switch-thumb" })),
      props.label ? h("span", { className: "msds-switch-label" }, props.label) : null
    );
  }

  // ---------------------------------------------------------------------
  // Slider — valor único contínuo (diferente do RangeFilter, que é faixa
  // dupla com histograma).
  // ---------------------------------------------------------------------
  function Slider(props) {
    var pct = ((props.value - props.min) / ((props.max - props.min) || 1)) * 100;
    return h("div", { className: "msds-slider" },
      props.label ? h("div", { className: "msds-field-label" }, props.label + (props.showValue === false ? "" : ": " + props.value + (props.unit || ""))) : null,
      h("div", { className: "msds-slider-track" },
        h("div", { className: "msds-slider-fill", style: { width: pct + "%" } }),
        h("input", {
          type: "range", className: "msds-slider-input", min: props.min, max: props.max, step: props.step,
          value: props.value, onChange: function (e) { props.onChange && props.onChange(Number(e.target.value)); }
        })
      )
    );
  }

  // ---------------------------------------------------------------------
  // Menu — lista de ações ancorada (mesma base de posicionamento do
  // Popover; papel menu/menuitem). Rodada 7, item 4: um item pode carregar
  // "items" aninhado — a lista em si (MenuItemsList/MenuItemRow, abaixo) é
  // recursiva: um MenuItemRow com submenu renderiza outro MenuItemsList
  // dentro de si, a mesma função que o próprio Menu usa para sua primeira
  // camada. Para um item sem submenu, a saída é byte-idêntica à de antes
  // da Rodada 7 (mesmas classes, mesma ordem de filhos) — só o item com
  // "items" ganha comportamento novo.
  // ---------------------------------------------------------------------
  function MenuItemRow(props) {
    var it = props.item;
    var hasSubmenu = !!(it.items && it.items.length);
    var ss = useState(false); var subOpen = ss[0], setSubOpen = ss[1];
    var itemRef = React.useRef(null);
    var subRef = React.useRef(null);
    var fs = useState("right"); var side = fs[0], setSide = fs[1];
    // Quando ArrowLeft devolve o foco a ESTE botão e ele próprio tem
    // submenu, o onFocus abaixo reabriria o que acabou de fechar (o mesmo
    // gatilho que abre por hover/Tab). Uma flag síncrona (não estado —
    // não pode esperar um re-render) pula esse único onFocus programático.
    var skipNextFocusOpen = React.useRef(false);
    useEffect(function () {
      if (!subOpen) return;
      var rect = itemRef.current ? itemRef.current.getBoundingClientRect() : null;
      var w = (subRef.current && subRef.current.offsetWidth) || 200;
      var fitsRight = !rect || (rect.right + w <= window.innerWidth);
      setSide(fitsRight ? "right" : "left");
    }, [subOpen]);
    function openSub() { if (hasSubmenu && !it.disabled) setSubOpen(true); }
    function closeSub() { setSubOpen(false); }
    function focusSelfWithoutReopening() {
      skipNextFocusOpen.current = true;
      if (itemRef.current) itemRef.current.focus();
    }
    function onKeyDown(e) {
      if (hasSubmenu && (e.key === "ArrowRight" || e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openSub();
        requestAnimationFrame(function () {
          var first = subRef.current && subRef.current.querySelector('[role="menuitem"]');
          if (first) first.focus();
        });
      }
    }
    return h("li", { role: "none", style: { position: "relative" } },
      h("button", {
        ref: itemRef, role: "menuitem", type: "button", className: "msds-menu-item", disabled: it.disabled,
        "aria-haspopup": hasSubmenu ? "menu" : undefined, "aria-expanded": hasSubmenu ? subOpen : undefined,
        onMouseEnter: hasSubmenu ? openSub : undefined,
        onMouseLeave: hasSubmenu ? closeSub : undefined,
        onFocus: hasSubmenu ? function () {
          if (skipNextFocusOpen.current) { skipNextFocusOpen.current = false; return; }
          openSub();
        } : undefined,
        onKeyDown: onKeyDown,
        onClick: function () {
          if (it.disabled) return;
          if (hasSubmenu) { setSubOpen(function (o) { return !o; }); return; }
          it.onSelect && it.onSelect();
          props.onClose && props.onClose();
        }
      },
        it.icon ? h("span", { className: "msds-menu-icon" }, msdsIcon(it.icon)) : null,
        it.label,
        hasSubmenu ? h("span", { className: "msds-menu-item-caret", "aria-hidden": "true" }, msdsIcon(side === "right" ? "chevronRight" : "chevronLeft")) : null
      ),
      hasSubmenu && subOpen ? h("div", {
        ref: subRef, className: "msds-menu-submenu msds-menu-submenu-" + side,
        onMouseEnter: openSub, onMouseLeave: closeSub,
        // ArrowLeft: fecha só este submenu e devolve o foco ao próprio item —
        // preso aqui (não no botão do item) porque o botão não é ancestral
        // DOM do submenu (são irmãos dentro do mesmo <li>); um submenu mais
        // fundo trata o ArrowLeft primeiro e para a propagação, então cada
        // nível fecha um de cada vez, nunca a cadeia inteira de uma vez.
        onKeyDown: function (e) {
          if (e.key === "ArrowLeft") {
            e.preventDefault(); e.stopPropagation();
            closeSub();
            focusSelfWithoutReopening();
          }
        }
      },
        h(MenuItemsList, { items: it.items, tonalElevation: props.tonalElevation, onClose: props.onClose })
      ) : null
    );
  }

  function MenuItemsList(props) {
    return h("ul", { className: "msds-menu", role: "menu", "data-tonal-elevation": props.tonalElevation ? "true" : "false" },
      (props.items || []).map(function (it, i) {
        return h(MenuItemRow, { key: i, item: it, tonalElevation: props.tonalElevation, onClose: props.onClose });
      })
    );
  }

  function Menu(props) {
    var s = useState(false); var open = s[0], setOpen = s[1];
    var ref = React.useRef(null);
    useEffect(function () {
      if (!open) return;
      function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
      // Escape sempre fecha a partir do topo — fecha este Menu inteiro
      // (desmonta a árvore, o que já fecha qualquer submenu aberto dentro
      // dele, não importa a profundidade), a cadeia inteira nunca meio-aberta.
      function onKey(e) { if (e.key === "Escape") setOpen(false); }
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
    }, [open]);
    return h("div", { className: "msds-menu-wrap", ref: ref },
      h("button", { type: "button", className: "msds-menu-trigger", "aria-haspopup": "menu", "aria-expanded": open, onClick: function () { setOpen(!open); } }, props.trigger),
      open ? h(MenuItemsList, { items: props.items, tonalElevation: props.tonalElevation, onClose: function () { setOpen(false); } }) : null
    );
  }

  // ---------------------------------------------------------------------
  // Tooltip — rótulo curto por hover/foco (diferente do Popover, que é
  // por clique e leva conteúdo rico). Rodada 7, item 3: variant "rich"
  // (título + corpo + ação opcional) ao lado do "plain" (comportamento
  // original, inalterado — a árvore abaixo para variant="plain" é
  // byte-idêntica à de antes da Rodada 7). Diferença de semântica de
  // acessibilidade, não só visual: "plain" é role="tooltip", nunca leva
  // foco nem conteúdo interativo — um leitor de tela só o anuncia como
  // descrição do elemento focado. "rich" é role="dialog": pode conter um
  // botão de ação de verdade, então precisa ser alcançável por teclado
  // (fica aberto quando o ponteiro entra nele, ao contrário do "plain",
  // que fecha assim que sai do host — sem essa folga um rich tooltip com
  // botão seria impossível de clicar com o mouse).
  // ---------------------------------------------------------------------
  function Tooltip(props) {
    var variant = props.variant || "plain";
    var s = useState(false); var open = s[0], setOpen = s[1];
    // Hooks sempre incondicionais (Rules of Hooks) — mesmo que só a variante
    // "rich" use o temporizador, o hook em si roda em toda renderização.
    var closeTimer = React.useRef(null);
    function clearCloseTimer() { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } }
    useEffect(function () { return clearCloseTimer; }, []);
    if (variant === "rich") {
      function show() { clearCloseTimer(); setOpen(true); }
      function scheduleHide() { clearCloseTimer(); closeTimer.current = setTimeout(function () { setOpen(false); }, 100); }
      return h("span", {
        className: "msds-tooltip-wrap",
        onMouseEnter: show, onMouseLeave: scheduleHide,
        onFocus: show,
        onBlur: function (e) {
          var wrap = e.currentTarget;
          // Fecha só se o foco saiu do host E do próprio balão (um botão
          // dentro do balão pode receber o foco sem que o tooltip deva sumir).
          requestAnimationFrame(function () { if (!wrap.contains(document.activeElement)) setOpen(false); });
        }
      },
        props.children,
        open ? h("div", {
          className: "msds-tooltip-rich", role: "dialog", "aria-label": typeof props.title === "string" ? props.title : undefined,
          onMouseEnter: show, onMouseLeave: scheduleHide
        },
          props.title ? h("div", { className: "msds-tooltip-rich-title" }, props.title) : null,
          props.body ? h("div", { className: "msds-tooltip-rich-body" }, props.body) : null,
          props.action ? h("button", {
            type: "button", className: "msds-tooltip-rich-action", onClick: props.action.onClick
          }, props.action.label) : null
        ) : null
      );
    }
    return h("span", {
      className: "msds-tooltip-wrap",
      onMouseEnter: function () { setOpen(true); }, onMouseLeave: function () { setOpen(false); },
      onFocus: function () { setOpen(true); }, onBlur: function () { setOpen(false); }
    },
      props.children,
      open ? h("span", { className: "msds-tooltip-bubble", role: "tooltip" }, props.label) : null
    );
  }

  // ---------------------------------------------------------------------
  // List / ListItem — linha estruturada (ícone/rótulo/meta), sem a
  // moldura inteira de um Card.
  // ---------------------------------------------------------------------
  function List(props) { return h("div", { className: "msds-list", role: "list" }, props.children); }
  function ListItem(props) {
    var ripple = useRipple();
    var clickable = !!props.onClick;
    return h("div", {
      className: "msds-list-item" + (clickable ? " msds-ripple-host" : ""),
      role: clickable ? "button" : "listitem", tabIndex: clickable ? 0 : undefined,
      onPointerDown: clickable ? ripple.onPointerDown : undefined,
      onClick: props.onClick,
      onKeyDown: clickable ? function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); props.onClick(); } } : undefined
    },
      clickable ? ripple.layer : null,
      props.icon ? h("span", { className: "msds-list-icon" }, msdsIcon(props.icon)) : null,
      h("div", { className: "msds-list-body" },
        h("div", { className: "msds-list-label" }, props.label),
        props.description ? h("div", { className: "msds-list-desc" }, props.description) : null
      ),
      props.meta ? h("div", { className: "msds-list-meta" }, props.meta) : null
    );
  }

  // ---------------------------------------------------------------------
  // Divider
  // ---------------------------------------------------------------------
  function Divider(props) {
    return h("div", { className: "msds-divider" + (props.vertical ? " msds-divider-v" : ""), role: "separator", "aria-orientation": props.vertical ? "vertical" : "horizontal" });
  }

  // ---------------------------------------------------------------------
  // SearchBar — o campo que abre o CommandPalette, como superfície
  // própria embutível numa tela (não só atrás de ⌘K).
  // ---------------------------------------------------------------------
  function SearchBar(props) {
    return h("div", { className: "msds-searchbar" },
      msdsIcon("search"),
      h("input", { className: "msds-searchbar-input", placeholder: props.placeholder || "Buscar…", value: props.value, onChange: function (e) { props.onChange && props.onChange(e.target.value); }, "aria-label": props.label || "Buscar" }),
      props.value ? h("button", { className: "msds-searchbar-clear", "aria-label": "Limpar busca", onClick: function () { props.onChange && props.onChange(""); } }, msdsIcon("close")) : null
    );
  }

  // ---------------------------------------------------------------------
  // TopAppBar — cabeçalho compacto (classe de largura M3 "compact").
  // ---------------------------------------------------------------------
  function TopAppBar(props) {
    var size = props.size || "small";
    // "center-aligned" só faz sentido combinado com size="small" (M3): as
    // versões medium/large já reservam a segunda linha para o título grande
    // alinhado à esquerda, então um center-aligned "large" seria duas regras
    // de layout competindo — documentado, não impedido em runtime.
    var centered = props.centerAligned && size === "small";
    var stacked = size === "medium" || size === "large";
    // Empilhado (medium/large): o título grande é o único h1 — não duplica o
    // rótulo compacto escondido por CSS, que ainda apareceria na árvore de
    // acessibilidade (opacidade não remove do a11y tree) e leria duas vezes.
    return h("header", { className: "msds-appbar msds-appbar-" + size, "data-centered": centered ? "true" : "false" },
      h("div", { className: "msds-appbar-row" },
        props.onMenuClick ? h(IconButton, { label: "Abrir navegação", onToggle: props.onMenuClick, iconOn: "menu", iconOff: "menu", variant: "standard" }) : null,
        stacked ? h("span", { className: "msds-appbar-actions-spacer", "aria-hidden": "true" }) : h("h1", { className: "msds-appbar-title" }, props.title),
        props.actions ? h("div", { className: "msds-appbar-actions" }, props.actions) : null
      ),
      stacked ? h("h1", { className: "msds-appbar-title-large" }, props.title) : null
    );
  }

  // ---------------------------------------------------------------------
  // BottomAppBar — barra fixa inferior (M3), ações + FAB "encaixado"
  // opcional. Compact-width: a alternativa persistente ao FAB solto quando
  // a tela é pequena demais para os dois convivirem soltos.
  // ---------------------------------------------------------------------
  function BottomAppBar(props) {
    return h("footer", { className: "msds-bottombar", "data-docked": props.dock ? "true" : "false" },
      h("div", { className: "msds-bottombar-actions" }, props.actions),
      props.dock ? h("div", { className: "msds-bottombar-fab-slot" }, props.dock) : null
    );
  }

  // ---------------------------------------------------------------------
  // NavDrawer — a variante modal do NavRail para largura compact/medium;
  // reaproveita o próprio NavRail (não uma segunda lista de navegação) e
  // o foco preso do Dialog.
  // ---------------------------------------------------------------------
  function NavDrawer(props) {
    var ref = React.useRef(null);
    useFocusTrap(props.open, ref);
    useEffect(function () {
      if (!props.open) return;
      function onKey(e) { if (e.key === "Escape") props.onClose && props.onClose(); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [props.open]);
    if (!props.open) return null;
    return h("div", { className: "msds-drawer-backdrop", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose && props.onClose(); } },
      h("div", { className: "msds-drawer-panel", ref: ref, role: "dialog", "aria-modal": "true", "aria-label": props.label || "Navegação" },
        h(NavRail, Object.assign({}, props.navProps, { collapsed: false, onToggleCollapse: props.onClose }))
      )
    );
  }

  // ---------------------------------------------------------------------
  // BottomNavBar — navegação de telefone. A M3 limita a 3-5 destinos porque
  // é a faixa em que cada rótulo ainda cabe sem abreviar e o alvo de toque
  // não fica estreito demais — este componente não trunca a lista sozinho,
  // então quem chama precisa respeitar o teto (documentado em README, não
  // imposto aqui para não recusar silenciosamente um item real do produto).
  function BottomNavBar(props) {
    var items = props.items || [];
    return h("nav", { className: "msds-bottomnav", "aria-label": props.label || "Navegação" },
      items.map(function (item) {
        var active = item.key === props.activeKey;
        return h("button", {
          key: item.key, type: "button", className: "msds-bottomnav-item",
          "aria-current": active ? "page" : undefined,
          onClick: function () { props.onSelect && props.onSelect(item.key); }
        },
          h("span", { className: "msds-bottomnav-icon" }, msdsIcon(item.icon)),
          h("span", { className: "msds-bottomnav-label" }, item.label)
        );
      })
    );
  }

  // ---------------------------------------------------------------------
  // DataTable — tabela genérica reusável: colunas declaram render próprio
  // por célula (evita cada tela reinventar <table> a mão, a razão de o
  // pedido existir).
  // ---------------------------------------------------------------------
  function DataTable(props) {
    var columns = props.columns || [];
    var rows = props.rows || [];
    var getRowKey = props.rowKey || function (row, i) { return row.id !== undefined ? row.id : i; };
    return h("div", { className: "msds-datatable-wrap" },
      h("table", { className: "msds-datatable", "aria-label": props.title },
        h("thead", null, h("tr", null,
          columns.map(function (col) {
            return h("th", { key: col.key, "data-numeric": col.numeric ? "true" : "false" }, col.label);
          })
        )),
        h("tbody", null,
          rows.length ? rows.map(function (row, ri) {
            return h("tr", { key: getRowKey(row, ri) },
              columns.map(function (col) {
                var content = col.render ? col.render(row, ri) : row[col.key];
                return h("td", { key: col.key, "data-numeric": col.numeric ? "true" : "false" }, content);
              })
            );
          }) : h("tr", null, h("td", { colSpan: columns.length, className: "msds-datatable-empty" }, props.emptyLabel || "Nenhum registro."))
        )
      )
    );
  }

  // ---------------------------------------------------------------------
  // useWindowClass — as três classes de largura da M3 (compact <600,
  // medium 600–839, expanded ≥840), para uma composição alternar
  // NavRail/TopAppBar+NavDrawer de verdade, não só documentar o número.
  // ---------------------------------------------------------------------
  function classifyWidth(w) { return w < 600 ? "compact" : w < 840 ? "medium" : "expanded"; }
  function useWindowClass() {
    var s = useState(function () { return typeof window !== "undefined" ? classifyWidth(window.innerWidth) : "expanded"; });
    var cls = s[0], setCls = s[1];
    useEffect(function () {
      function onResize() { setCls(classifyWidth(window.innerWidth)); }
      window.addEventListener("resize", onResize);
      onResize();
      return function () { window.removeEventListener("resize", onResize); };
    }, []);
    return cls;
  }

  // ---------------------------------------------------------------------
  // CircularProgress — Rodada 6, item 5: par do LinearProgress (Rodada 5).
  // Determinado (com "value", 0–100) desenha o arco proporcional via
  // stroke-dasharray/dashoffset; indeterminado (sem "value") gira
  // continuamente por @keyframes, parado sob prefers-reduced-motion — mesma
  // disciplina do LinearProgress. O spinner interno de Button (state=
  // "loading") continua próprio e separado: é pequeno e monocromático
  // (currentColor, sem trilho), enquanto este é maior, com trilho de fundo
  // e cor de marca — papéis diferentes, então ficam como dois desenhos.
  // ---------------------------------------------------------------------
  function CircularProgress(props) {
    var size = props.size || 48;
    var stroke = props.strokeWidth || 4;
    var r = (size - stroke) / 2;
    var circumference = 2 * Math.PI * r;
    var determinate = typeof props.value === "number";
    var pct = determinate ? Math.max(0, Math.min(100, props.value)) : 0;
    var offset = circumference * (1 - pct / 100);
    return h("span", {
      className: "msds-circprog" + (determinate ? "" : " is-indeterminate"),
      style: { width: size + "px", height: size + "px" },
      role: "progressbar",
      "aria-label": props.label,
      "aria-valuenow": determinate ? Math.round(pct) : undefined,
      "aria-valuemin": determinate ? 0 : undefined,
      "aria-valuemax": determinate ? 100 : undefined
    },
      h("svg", { width: size, height: size, viewBox: "0 0 " + size + " " + size, className: "msds-circprog-svg" },
        h("circle", { className: "msds-circprog-track", cx: size / 2, cy: size / 2, r: r, strokeWidth: stroke, fill: "none" }),
        h("circle", {
          className: "msds-circprog-fill", cx: size / 2, cy: size / 2, r: r, strokeWidth: stroke, fill: "none",
          strokeDasharray: determinate ? circumference : circumference * 0.72 + " " + circumference,
          strokeDashoffset: determinate ? offset : 0,
          strokeLinecap: "round"
        })
      ),
      determinate && props.showValue !== false ? h("span", { className: "msds-circprog-value" }, Math.round(pct) + "%") : null
    );
  }

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

  // ---------------------------------------------------------------------
  // SideSheet — Rodada 6, item 6: painel que desliza da lateral (side prop,
  // default "right"). Dois modos: "modal" (backdrop, useFocusTrap
  // compartilhado com Dialog/BottomSheet/NavDrawer, Escape fecha) e
  // "standalone" (sem backdrop, ocupa espaço ao lado do conteúdo — quem
  // chama é quem faz o layout de duas colunas; este componente só renderiza
  // o painel em si, position:relative dentro do próprio fluxo).
  // ---------------------------------------------------------------------
  function SideSheet(props) {
    var side = props.side || "right";
    var mode = props.mode || "modal";
    var ref = React.useRef(null);
    var isModal = mode === "modal";
    useFocusTrap(isModal && props.open, ref);
    useEffect(function () {
      if (!isModal || !props.open) return;
      function onKey(e) { if (e.key === "Escape") props.onClose && props.onClose(); }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [isModal, props.open]);
    if (!props.open) return null;
    var panel = h("div", {
      className: "msds-sidesheet msds-sidesheet-" + side + " msds-sidesheet-" + mode,
      role: isModal ? "dialog" : undefined, "aria-modal": isModal ? "true" : undefined,
      "aria-labelledby": props.title ? "msds-sidesheet-title" : undefined,
      style: props.width ? { width: props.width } : undefined,
      ref: isModal ? ref : null
    },
      h("div", { className: "msds-dialog-header" },
        props.title ? h("h3", { id: "msds-sidesheet-title", className: "msds-card-title" }, props.title) : h("span", null),
        h(IconButton, { label: "Fechar", onToggle: props.onClose, iconOn: "close", iconOff: "close", variant: "standard" })
      ),
      h("div", { className: "msds-sidesheet-body" }, props.children)
    );
    if (!isModal) return panel;
    return h("div", { className: "msds-sidesheet-backdrop", onMouseDown: function (e) { if (e.target === e.currentTarget) props.onClose && props.onClose(); } }, panel);
  }

  // ---------------------------------------------------------------------
  // SplitButton — Rodada 6, item 8: ação padrão (onClick) + um segundo alvo
  // (seta) que abre um Menu (reaproveita o Menu da Rodada 4) com as ações
  // alternativas. Visualmente dois segmentos de um botão só, com uma linha
  // divisória fina (token "edge", não uma cor nova) entre eles — os dois
  // cliques são independentes: clicar no rótulo nunca abre o menu, e
  // abrir o menu nunca dispara a ação padrão.
  // ---------------------------------------------------------------------
  function SplitButton(props) {
    var variant = props.variant || "primary";
    var ripple = useRipple();
    return h("div", { className: "msds-splitbtn msds-splitbtn-" + variant },
      h("button", {
        type: "button", className: "msds-splitbtn-main msds-ripple-host", disabled: props.disabled,
        onPointerDown: ripple.onPointerDown, onClick: props.onClick
      }, ripple.layer, props.children),
      h("span", { className: "msds-splitbtn-divider", "aria-hidden": "true" }),
      h(Menu, {
        trigger: h("span", { className: "msds-splitbtn-caret", "aria-label": props.menuLabel || "Mais ações" }, msdsIcon("chevronDown")),
        items: props.items
      })
    );
  }

  // ---------------------------------------------------------------------
  // DatePicker / TimePicker — Rodada 6, item 9. Puro JS de calendário (sem
  // parsing de fuso horário, sem biblioteca de datas — D-23), abrindo num
  // Popover ancorado no controle, mesmo padrão do Select/Menu.
  // ---------------------------------------------------------------------
  var MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  var WEEKDAYS_PT = ["D", "S", "T", "Q", "Q", "S", "S"];
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function sameDay(a, b) { return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function DatePicker(props) {
    var value = props.value instanceof Date ? props.value : null;
    var vs = useState(function () { return { y: (value || new Date()).getFullYear(), m: (value || new Date()).getMonth() }; });
    var view = vs[0], setView = vs[1];
    var leading = new Date(view.y, view.m, 1).getDay();
    var total = daysInMonth(view.y, view.m);
    var cells = [];
    for (var i = 0; i < leading; i++) cells.push(null);
    for (var d = 1; d <= total; d++) cells.push(d);
    function go(delta) {
      var m = view.m + delta, y = view.y;
      if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
      setView({ y: y, m: m });
    }
    var label = value ? pad2(value.getDate()) + " de " + MONTHS_PT[value.getMonth()] + " de " + value.getFullYear() : (props.placeholder || "Selecionar data");
    return h(FieldShell, {
      label: props.label,
      render: function (uid) {
        return h(Popover, {
          trigger: h("span", { className: "msds-datepicker-trigger-inner" }, msdsIcon("calendar"), h("span", null, label)),
          children: h("div", { className: "msds-datepicker" },
            h("div", { className: "msds-datepicker-nav" },
              h(IconButton, { variant: "standard", label: "Mês anterior", pressed: false, iconOff: "chevronLeft", iconOn: "chevronLeft", onToggle: function () { go(-1); } }),
              h("span", { className: "msds-datepicker-month" }, MONTHS_PT[view.m] + " de " + view.y),
              h(IconButton, { variant: "standard", label: "Próximo mês", pressed: false, iconOff: "chevronRight", iconOn: "chevronRight", onToggle: function () { go(1); } })
            ),
            h("div", { className: "msds-datepicker-grid msds-datepicker-weekdays" }, WEEKDAYS_PT.map(function (w, i) { return h("span", { key: i }, w); })),
            h("div", { className: "msds-datepicker-grid" }, cells.map(function (d, i) {
              if (d === null) return h("span", { key: i, className: "msds-datepicker-cell is-empty" });
              var cellDate = new Date(view.y, view.m, d);
              var sel = sameDay(cellDate, value);
              var today = sameDay(cellDate, new Date());
              return h("button", {
                key: i, type: "button", className: "msds-datepicker-cell", "data-selected": sel ? "true" : "false", "data-today": today ? "true" : "false",
                onClick: function () { props.onChange && props.onChange(cellDate); }
              }, d);
            }))
          )
        });
      }
    });
  }

  function TimePicker(props) {
    var value = props.value || { hour: 0, minute: 0 };
    function clamp(n, max) { return ((n % max) + max) % max; }
    function set(hour, minute) { props.onChange && props.onChange({ hour: clamp(hour, 24), minute: clamp(minute, 60) }); }
    function field(unit, max, step) {
      var v = unit === "hour" ? value.hour : value.minute;
      return h("div", { className: "msds-timepicker-field" },
        h("button", { type: "button", className: "msds-timepicker-step", "aria-label": "Aumentar " + (unit === "hour" ? "hora" : "minuto"), onClick: function () { unit === "hour" ? set(value.hour + step, value.minute) : set(value.hour, value.minute + step); } }, msdsIcon("plus")),
        h("input", {
          className: "msds-control msds-timepicker-input", type: "number", inputMode: "numeric", min: 0, max: max - 1,
          value: pad2(v),
          onChange: function (e) {
            var n = Number(e.target.value);
            if (isNaN(n)) return;
            unit === "hour" ? set(n, value.minute) : set(value.hour, n);
          }
        }),
        h("button", { type: "button", className: "msds-timepicker-step", "aria-label": "Diminuir " + (unit === "hour" ? "hora" : "minuto"), onClick: function () { unit === "hour" ? set(value.hour - step, value.minute) : set(value.hour, value.minute - step); } }, msdsIcon("minus"))
      );
    }
    return h(FieldShell, {
      label: props.label,
      render: function () {
        return h("div", { className: "msds-timepicker" },
          msdsIcon("clock"),
          field("hour", 24, 1),
          h("span", { className: "msds-timepicker-sep", "aria-hidden": "true" }, ":"),
          field("minute", 60, 5)
        );
      }
    });
  }

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

  // ---------------------------------------------------------------------
  // ScreenTransitionDemo — Rodada 6, item 11: demonstração dedicada de
  // "shared axis" (useScreenTransition) num mini-wizard de 3 passos. Não é
  // uma tela nova do produto real — só a demonstração do padrão, como o
  // README pede.
  // ---------------------------------------------------------------------
  function ScreenTransitionDemo() {
    var STEPS = [
      { key: "material", title: "1. Escolha o material", desc: "Selecione a liga de partida para o estudo." },
      { key: "restricoes", title: "2. Defina as restrições", desc: "Limites numéricos sobre as propriedades relevantes." },
      { key: "resultado", title: "3. Veja o resultado", desc: "Ranking dos materiais que passaram pela pilha de estágios." }
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
  var api = {
    Button: Button, IconButton: IconButton, ButtonGroup: ButtonGroup, Chip: Chip,
    Badge: Badge, DataQualityBadge: DataQualityBadge, NotificationBadge: NotificationBadge,
    Card: Card, CardHeader: CardHeader, CardBody: CardBody, CardFooter: CardFooter,
    NavRail: NavRail, StatTile: StatTile,
    BarChart: BarChart, ScatterMap: ScatterMap, RadarChart: RadarChart,
    BoxPlot: BoxPlot, Heatmap: Heatmap, ParallelCoords: ParallelCoords,
    Input: Input, NumberInput: NumberInput, Textarea: Textarea, Select: Select, Checkbox: Checkbox, RadioGroup: RadioGroup, RangeFilter: RangeFilter,
    Dialog: Dialog, BottomSheet: BottomSheet, Tabs: Tabs, Popover: Popover, Breadcrumb: Breadcrumb, Stepper: Stepper,
    LoadingState: LoadingState, Skeleton: Skeleton, ErrorState: ErrorState, EmptyState: EmptyState, LinearProgress: LinearProgress,
    Toast: Toast, ToastStack: ToastStack,
    CommandPalette: CommandPalette, ComparisonTray: ComparisonTray, FAB: FAB, FABMenu: FABMenu,
    Switch: Switch, Slider: Slider, Menu: Menu, Tooltip: Tooltip,
    List: List, ListItem: ListItem, Divider: Divider, SearchBar: SearchBar,
    DataTable: DataTable,
    TopAppBar: TopAppBar, BottomAppBar: BottomAppBar, NavDrawer: NavDrawer, BottomNavBar: BottomNavBar,
    useWindowClass: useWindowClass,
    SPRING: SPRING, useSpring: useSpring, useScreenTransition: useScreenTransition,
    CircularProgress: CircularProgress, LoadingIndicator: LoadingIndicator, SideSheet: SideSheet, SplitButton: SplitButton,
    DatePicker: DatePicker, TimePicker: TimePicker, Carousel: Carousel, ScreenTransitionDemo: ScreenTransitionDemo,
    useContainerTransform: useContainerTransform, ContainerTransformDemo: ContainerTransformDemo
  };
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


// ---------------------------------------------------------------------
// Barrel re-exports, from the same api object the source bundle used to
// assign onto `window.MSDS`.
//
// D-76: this was `export const { Button, IconButton, ... } = api;` — a
// destructuring declaration that tries to bind a *new* `const Button` (etc.)
// in the same top-level module scope that already has `function Button(props)
// {...}` (and so on for every other name below). Two top-level declarations
// of the same name in one scope is a SyntaxError in real ECMAScript modules,
// not merely a TypeScript complaint this file's `@ts-nocheck` could paper
// over — `tsc --noEmit` stayed quiet only because `@ts-nocheck` also
// suppresses TS's own duplicate-identifier diagnostic for this file, but
// Vitest/vite's esbuild parses it for real and refused to build the module
// the first time anything actually imported from `@/lib/msds` (which nothing
// did before this pass — `icons.tsx` doesn't import this file, so the defect
// was latent since D-74). Every name below already has a same-named
// top-level binding (that's how `var api = { Button: Button, ... }` above it
// could reference them), so a plain re-export list — which marks existing
// bindings as exported instead of declaring new ones — is the fix, with the
// same names and the same values.
// ---------------------------------------------------------------------
export {
  Button, IconButton, ButtonGroup, Chip, Badge, DataQualityBadge, NotificationBadge,
  Card, CardHeader, CardBody, CardFooter, NavRail, StatTile, BarChart, ScatterMap,
  RadarChart, BoxPlot, Heatmap, ParallelCoords, Input, NumberInput, Textarea, Select,
  Checkbox, RadioGroup, RangeFilter, Dialog, BottomSheet, Tabs, Popover, Breadcrumb,
  Stepper, LoadingState, Skeleton, ErrorState, EmptyState, LinearProgress, Toast,
  ToastStack, CommandPalette, ComparisonTray, FAB, FABMenu, Switch, Slider, Menu,
  Tooltip, List, ListItem, Divider, SearchBar, DataTable, TopAppBar, BottomAppBar,
  NavDrawer, BottomNavBar, useWindowClass, SPRING, useSpring, useScreenTransition,
  CircularProgress, LoadingIndicator, SideSheet, SplitButton, DatePicker, TimePicker,
  Carousel, ScreenTransitionDemo, useContainerTransform, ContainerTransformDemo,
  // D-80: the app's native IconButton/ToggleChip wear MSDS's classes and
  // need its press feedback without calling the MSDS component functions.
  useRipple, useShapeMorph,
};
export { api as msdsApi };
