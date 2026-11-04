// Injected into every page of the RECORDING browser only (addInitScript). It never
// ships with the app: it draws the visible cursor, the click highlight, and hides the
// four elements the editorial rules keep off screen (decision D1 in roteiro-mestre.md).
(() => {
  if (window.__vc) return;
  const CSS = `
    #vc-cursor{position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;
      pointer-events:none;transform:translate(-3px,-2px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}
    #vc-ring{position:fixed;z-index:2147483646;pointer-events:none;border-radius:10px;
      border:3px solid rgba(255,153,0,.95);box-shadow:0 0 0 0 rgba(255,153,0,.45);opacity:0;
      transition:opacity .18s ease}
    #vc-ring.on{opacity:1;animation:vc-pulse 1.1s ease-out infinite}
    @keyframes vc-pulse{0%{box-shadow:0 0 0 0 rgba(255,153,0,.45)}100%{box-shadow:0 0 0 14px rgba(255,153,0,0)}}
    .vc-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;
      margin:-7px 0 0 -7px;border-radius:50%;background:rgba(255,153,0,.55);animation:vc-rip .45s ease-out forwards}
    @keyframes vc-rip{to{transform:scale(4);opacity:0}}
  `;
  const SVG = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.6 20.3 L11.7 13.6 L18 13.6 Z"
    fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  let cursor, ring, pos = { x: 960, y: 540 };

  // D1: elements that would show the bike-beam example. Hidden, never rewritten,
  // except the field hint, where only the trailing example sentence is dropped.
  function sanitize(root) {
    try {
      for (const el of root.querySelectorAll("button, a")) {
        const t = (el.textContent || "").trim();
        if (t.startsWith("Carregar exemplo") || t === "Viga leve e rígida em flexão") {
          el.style.setProperty("display", "none", "important");
        }
      }
      for (const el of root.querySelectorAll("p, div, span")) {
        if (el.childElementCount === 0 && (el.textContent || "").trim().startsWith("Primeira vez? Veja um estudo completo")) {
          el.style.setProperty("display", "none", "important");
        }
      }
      for (const el of root.querySelectorAll("textarea, input")) {
        if (/viga/i.test(el.getAttribute("placeholder") || "")) el.setAttribute("placeholder", "");
      }
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        if (n.nodeValue && /Ex\.: [Vv]iga (de bicicleta|em flexão)\./.test(n.nodeValue)) {
          n.nodeValue = n.nodeValue.replace(/ ?Ex\.: [Vv]iga (de bicicleta|em flexão)\./, "");
        }
      }
    } catch (e) { /* never break the page */ }
  }

  function mount() {
    if (document.getElementById("vc-cursor")) return;
    const st = document.createElement("style");
    st.textContent = CSS;
    document.documentElement.appendChild(st);
    cursor = document.createElement("div");
    cursor.id = "vc-cursor";
    cursor.innerHTML = SVG;
    ring = document.createElement("div");
    ring.id = "vc-ring";
    document.body.appendChild(ring);
    document.body.appendChild(cursor);
    place(pos.x, pos.y);
    sanitize(document.body);
    new MutationObserver(() => sanitize(document.body)).observe(document.body, {
      childList: true, subtree: true, characterData: true,
    });
  }
  function place(x, y) {
    pos = { x, y };
    if (cursor) cursor.style.left = x + "px", cursor.style.top = y + "px";
  }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  window.__vc = {
    mount,
    setPos: (x, y) => { mount(); place(x, y); },
    hide: (h) => { mount(); cursor.style.display = h ? "none" : "block"; },
    // Curved path: quadratic Bézier with the control point pushed sideways.
    move: (x, y, ms) => new Promise((res) => {
      mount();
      const a = { ...pos }, dx = x - a.x, dy = y - a.y, d = Math.hypot(dx, dy) || 1;
      const c = { x: a.x + dx / 2 - (dy / d) * d * 0.18, y: a.y + dy / 2 + (dx / d) * d * 0.18 };
      const t0 = performance.now();
      function step(now) {
        const t = Math.min(1, (now - t0) / ms), e = ease(t), u = 1 - e;
        place(u * u * a.x + 2 * u * e * c.x + e * e * x, u * u * a.y + 2 * u * e * c.y + e * e * y);
        t < 1 ? requestAnimationFrame(step) : res();
      }
      requestAnimationFrame(step);
    }),
    ring: (r) => {
      mount();
      if (!r) { ring.classList.remove("on"); return; }
      const p = 6;
      Object.assign(ring.style, { left: r.x - p + "px", top: r.y - p + "px", width: r.width + 2 * p + "px", height: r.height + 2 * p + "px" });
      ring.classList.add("on");
    },
    ripple: () => {
      const r = document.createElement("div");
      r.className = "vc-ripple";
      r.style.left = pos.x + "px";
      r.style.top = pos.y + "px";
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 600);
    },
    nudge: () => { mount(); place(pos.x + 0.01, pos.y); },
    // Text actually visible inside a viewport rectangle (for the forbidden-string check).
    visibleText: (rect) => {
      const R = rect || { x: 0, y: 0, width: innerWidth, height: innerHeight };
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const el = n.parentElement;
        if (!el || !n.nodeValue.trim()) continue;
        if (el.closest("#vc-cursor,#vc-ring,script,style,option")) continue;
        if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        // Clip by every scrolling/clipping ancestor: text scrolled out of a panel is not on screen.
        let clip = { l: R.x, t: R.y, r: R.x + R.width, b: R.y + R.height };
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const st = getComputedStyle(a);
          if (/(auto|scroll|hidden|clip)/.test(st.overflowY + st.overflowX)) {
            const ab = a.getBoundingClientRect();
            clip = { l: Math.max(clip.l, ab.left), t: Math.max(clip.t, ab.top), r: Math.min(clip.r, ab.right), b: Math.min(clip.b, ab.bottom) };
          }
        }
        for (const b of range.getClientRects()) {
          if (b.width > 0 && b.right > clip.l && b.left < clip.r && b.bottom > clip.t && b.top < clip.b) {
            out.push(n.nodeValue.trim());
            break;
          }
        }
      }
      for (const el of document.querySelectorAll("input,textarea,select")) {
        const b = el.getBoundingClientRect();
        if (b.width && b.bottom > R.y && b.top < R.y + R.height) {
          out.push(el.value || "", el.getAttribute("placeholder") || "");
          if (el.tagName === "SELECT" && el.selectedOptions[0]) out.push(el.selectedOptions[0].textContent);
        }
      }
      return out.join("\n");
    },
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
