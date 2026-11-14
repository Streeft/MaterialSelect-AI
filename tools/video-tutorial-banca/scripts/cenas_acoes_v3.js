// Screen actions for the v3 full cut (roteiro-v3.md, cenas-v3.json).
// Scenes whose screen and sentence order did not change reuse cenas_acoes.js; the rest
// are written here. r.at(k) waits for sentence k of the scene (v3 numbering).
"use strict";

const V2 = require("./cenas_acoes.js");

const BASE_URL = `http://127.0.0.1:${process.env.WEB_PORT ?? 3011}`;
const API = `http://127.0.0.1:${process.env.API_PORT ?? 8811}/api`;
const mainArea = (p) => p.locator("main");
const steps = (p) => p.getByRole("navigation", { name: "Etapas" });
const bar = (p) => p.getByRole("group", { name: "Ações da etapa" });
const TIE = { nome: "Tirante leve", funcao: "Tirante em tração", objetivo: "Mínima massa para rigidez dada", variaveis: "área da seção" };

async function waitFunnel(r, p) {
  const wasRec = r.recording && !r.fast;
  if (wasRec) r.pause();
  await p.getByText(/\d+\s*de\s*\d+\s*continuam/).first().waitFor({ timeout: 300000 });
  await r.stable(15000, { resume: false });
  if (wasRec) await r.resume();
}

// Keep everything from `loc` downwards below the bottom edge of the window.
async function hideFrom(p, loc, margin = 4) {
  for (let i = 0; i < 20; i++) {
    const b = await loc.boundingBox();
    if (!b) return;
    const d = b.y - (1080 + margin);
    if (Math.abs(d) < 2) return;
    await p.evaluate((x) => window.scrollBy(0, x), d);
    await new Promise((res) => setTimeout(res, 150));
  }
}

// Run a v2 scene with its sentence numbers shifted by `by` (one opening sentence added).
const shifted = (fn, by) => async (r, p) => {
  const at = r.at.bind(r), atWord = r.atWord.bind(r);
  r.at = (k, lead) => at(k + by, lead);
  r.atWord = (k, w, lead) => atWord(k + by, w, lead);
  try { await fn(r, p); } finally { r.at = at; r.atWord = atWord; }
};


async function panelTop(r, p) {
  const wasRec = r.recording && !r.fast;
  if (wasRec) r.pause();
  await p.evaluate(() => {
    window.scrollTo(0, 0);
    const a = [...document.querySelectorAll("aside")].find((x) => /Inspetor do mapa|Controles do mapa/.test(x.textContent));
    if (a) { a.style.scrollBehavior = "auto"; a.scrollTop = 0; }
  });
  await new Promise((res) => setTimeout(res, 250));
  await r.stable();
  if (wasRec) await r.resume();
}

// Crop (instant, inside a dry cut) that starts right above the plate's index card, so
// the cards around it never enter the frame. 16:9, anchored at the bottom right.
async function cropInfo(r, p, info) {
  const top = await info.evaluate((el) => {
    let c = el;
    while (c.parentElement && c.getBoundingClientRect().height < 300) c = c.parentElement;
    return c.getBoundingClientRect().top;
  });
  const h = Math.min(1080, 1080 - (top - 8));
  const w = (h * 16) / 9;
  r.crop({ x: 1920 - w, y: 1080 - h, width: w, height: h }, { instant: true });
}

// D2 in Comparar, by framing: an instant 16:9 crop whose bottom edge stops above the
// "Propriedades computadas" block (it lists every catalog index, beam ones included).
async function cropAbove(r, p) {
  if (r.fast) return;
  await r.stable(15000, { resume: false });
  let top = 1e9;
  for (let i = 0; i < 12; i++) {  // wait for the chart to settle
    await new Promise((res) => setTimeout(res, 250));
    const h = p.getByText("Propriedades computadas", { exact: true }).filter({ visible: true }).first();
    const t = (await h.count()) ? (await h.boundingBox()).y : 1e9;
    if (Math.abs(t - top) < 2) break;
    top = t;
  }
  const bottom = Math.min(1080, top - 12);
  if (bottom >= 1078) { await r.unzoom({ instant: true }); await r.resume(); return; }
  const hgt = bottom, wid = (hgt * 16) / 9;
  const card = await p.getByText("Comparação de materiais").filter({ visible: true }).first().boundingBox().catch(() => null);
  const cx = card ? card.x + 730 : 1088;
  const x = Math.max(0, Math.min(1920 - wid, cx - wid / 2));
  r.crop({ x, y: 0, width: wid, height: hgt }, { instant: true });
  await r.resume();
}

module.exports = {
  // ------------------------------------------------------------ Abertura
  A1: async (r, p) => {
    await r.goto("/app");
    await r.page.evaluate(() => window.__vc.setPos(1640, 860));
    await r.hold(400);
    await r.zoomOn(p.getByRole("heading", { level: 1 }), 1.15);
    await r.shot("titulo");
    await r.at(6);
    await r.shot("aviso");
  },

  I1: async (r, p) => {
    await r.unzoom();
    const h1 = p.getByRole("heading", { level: 1 });
    await r.point(h1, 1200);
    await r.at(1);
    const guide = p.getByRole("heading", { name: "Primeiros passos" });
    await r.scrollTo(guide, "start");
    await r.mark("guia", await r.cardBox(guide, 260));
    await r.point(p.getByRole("checkbox", { name: "Descreva a função da peça" }), 700);
    await r.point(p.getByRole("checkbox", { name: "Olhe os candidatos no mapa" }), 700);
    await r.point(p.getByRole("checkbox", { name: "Confira a origem de um valor" }), 700);
    await r.shot("guia");
    await r.at(2);
    const resume = p.getByRole("heading", { name: "Retomar um estudo" });
    await r.scrollTo(resume, "center");
    await r.mark("retomar", await r.cardBox(resume, 200));
    await r.point(p.getByRole("link", { name: "Retomar" }).first(), 1200);
    await r.shot("retomar");
    await r.at(3);
    await r.click(p.getByRole("navigation").getByRole("link", { name: "Seleção", exact: true }).first(), { pauseAfter: true });
    await r.stable();
  },

  // ------------------------------------------------------------ 1. O método
  M1: async (r, p) => {
    await r.goto("/app/selecao");
    await waitFunnel(r, p);
    const s = steps(p);
    await r.zoomOn(s, 1.25);
    await r.at(2);
    await r.point(s.getByRole("button", { name: /^Função/ }), 1400);
    await r.at(3);
    await r.point(s.getByRole("button", { name: /^Objetivo/ }), 1400);
    await r.at(4);
    await r.point(s.getByRole("button", { name: /^Limites/ }), 1400);
    await r.at(5);
    await r.point(s.getByRole("button", { name: /^Resultados/ }), 1400);
    await r.shot("etapas");
  },

  M2: V2.M2,

  M3: async (r, p) => {
    await r.goto("/app/selecao");
    await waitFunnel(r, p);
    const fun = p.getByRole("heading", { name: "Funil de candidatos" });
    r.zoom(await r.cardBox(fun, 300), 1.2);
    await r.hold(450);
    await r.mark("funil", await r.cardBox(fun, 300));
    await r.at(1);
    await r.point(fun, 900);
    await r.at(2);
    const srv = p.getByText("Calculado no servidor a cada mudança nos limites.").filter({ visible: true }).first();
    await r.zoomOn(srv, 1.3);
    await r.point(srv, 1200);
    await r.shot("servidor");
    await r.at(3);
    await r.unzoom();
    const ia = p.getByRole("button", { name: "Preencher a partir de um texto (IA)" }).filter({ visible: true }).first();
    await r.scrollTo(ia, "center");
    await r.point(ia, 1800);
    await r.shot("ia");
    await r.at(5);
  },

  // ------------------------------------------------------------ 2. Seleção
  S1: async (r, p) => {
    await r.off(async () => {
      await p.goto(BASE_URL + "/app/selecao", { waitUntil: "domcontentloaded" });
      await p.getByLabel("Nome do estudo").waitFor({ timeout: 600000 });
      await p.getByLabel("Nome do estudo").fill("");
      await p.getByLabel("Função do componente").fill(TIE.funcao);
      await p.getByLabel("Objetivo", { exact: true }).fill(TIE.objetivo);
      await p.getByLabel(/Variáveis livres/).fill(TIE.variaveis);
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.evaluate(() => window.__vc.setPos(900, 300));
      await p.getByText(/\d+\s*de\s*\d+\s*continuam/).first().waitFor({ timeout: 300000 });
    });
    const title = p.getByLabel("Nome do estudo");
    r.zoom(await r.cardBox(title, 120), 1.35);
    await r.hold(450);
    await r.mark("titulo", title);
    await r.at(1);
    await r.type(title, TIE.nome);
    await r.at(2);
    await r.unzoom();
    for (const name of [TIE.funcao, TIE.objetivo, "Nenhum limite ainda", TIE.variaveis]) {
      const b = p.getByRole("button", { name, exact: true }).first();
      if (await b.count()) { await r.mark("prop_" + name, b); await r.point(b, 650); }
    }
    await r.shot("propriedades");
    await r.at(3);
    const fn = p.getByLabel("Função do componente");
    await r.scrollTo(fn, "center");
    await r.point(fn, 1200);
    await r.at(4);
    const fun = p.getByRole("heading", { name: "Funil de candidatos" });
    r.zoom(await r.cardBox(fun, 200), 1.25);
    await r.hold(450);
    await r.expect(mainArea(p), /678\s*de 678 continuam/, "funil inicial 678");
    await r.point(p.getByText(/^678$/).filter({ visible: true }).first(), 1500);
    await r.shot("funil");
  },

  S2: V2.S2,

  S3: async (r, p) => {
    // v2 S3 says the "server checks" line on sentence 1; in v3 it is sentence 2.
    const at = r.at.bind(r);
    r.at = (k, lead) => at(k === 1 ? 2 : k, lead);
    try { await V2.S3(r, p); } finally { r.at = at; }
  },

  S4: V2.S4,
  S5: async (r, p) => {
    // Dry cut straight into the Limits step (the S4 screen has the ranking preview).
    await r.off(async () => {
      await bar(p).getByRole("button", { name: "Próximo: Limites" }).click();
      await p.getByRole("combobox", { name: "Propriedade" }).first().waitFor({ timeout: 600000 });
      await p.evaluate(() => window.scrollTo(0, 0));
    });
    const prop = p.getByRole("combobox", { name: "Propriedade" });
    await r.type(prop.nth(0), "tração");
    await r.hold(300);
    await r.click(p.getByRole("option", { name: /Resistência à tração/ }).first());
    await r.select(p.getByLabel("Operador").nth(0), "≥ maior ou igual");
    await r.type(p.getByLabel("Valor").nth(0), "100");
    await r.select(p.getByLabel("Unidade").nth(0), "MPa");
    await r.stable();
    await r.at(2);
    const le = p.getByText(/Lê-se:/).filter({ visible: true }).first();
    r.zoom(await r.cardBox(le, 160), 1.3);
    await r.hold(450);
    await r.expect(le.locator(".."), /Resistência à tração ≥ 100 MPa/, "frase Lê-se");
    await r.point(le, 1200);
    // Dry cut: the other two limits arrive ready.
    await r.at(3);
    await r.off(async () => {
      await r.unzoom({ instant: true });
      await p.getByRole("button", { name: "Adicionar limite" }).click();
      await prop.nth(1).evaluate((el) => el.scrollIntoView({ block: "center" }));
      await prop.nth(1).fill("tenacidade à");
      await p.getByRole("option", { name: /^Tenacidade à fratura/ }).first().click();
      await p.getByLabel("Operador").nth(1).selectOption({ label: "≥ maior ou igual" });
      await p.getByLabel("Valor").nth(1).fill("15");
      await p.getByRole("button", { name: "Adicionar limite" }).click();
      await prop.nth(2).evaluate((el) => el.scrollIntoView({ block: "center" }));
      await prop.nth(2).fill("temperatura máxima");
      await p.getByRole("option", { name: /^Temperatura máxima de serviço/ }).first().click();
      await p.getByLabel("Operador").nth(2).selectOption({ label: "≥ maior ou igual" });
      await p.getByLabel("Valor").nth(2).fill("200");
      await p.waitForFunction(() => /194/.test(document.body.innerText), null, { timeout: 300000 });
      await p.evaluate(() => window.scrollTo(0, 0));
    });
    const v1 = p.getByLabel("Valor").nth(1);
    await r.point(v1, 1100);
    await r.point(p.getByLabel("Valor").nth(2), 1100);
    await r.shot("limites");
    await r.at(4);
    const fun = p.getByRole("heading", { name: "Funil de candidatos" });
    await r.scrollTo(fun, "center");
    const fb = await r.cardBox(fun, 300);
    r.zoom(fb, 1.2);
    await r.hold(450);
    const txt = (await r.scan("funil")).replace(/\s+/g, " ");
    for (const n of ["678", "364", "268", "194"]) {
      if (!txt.includes(n) && !r.fast) { r.issue(`NÚMERO DIVERGENTE no funil: ${n} ausente`); throw new Error("funil diverge"); }
    }
    await r.mark("funil", fb);
    for (const n of ["678", "364", "268", "194"]) {
      await r.atWord(4, n);
      const el = p.getByText(new RegExp(`^${n}$`)).filter({ visible: true }).first();
      if (await el.count()) {
        const row = await r.cardBox(el, 28);
        await r.mark("funil_" + n, row);
        if (!r.fast) { await r.page.evaluate((b) => window.__vc.ring(b), row); }
      }
    }
    await r.hold(900);
    if (!r.fast) await r.page.evaluate(() => window.__vc.ring(null));
    await r.shot("funil");
  },

  S6: V2.S6,
  S7: V2.S7,
  S8: async (r, p) => {
    const at = r.at.bind(r);
    r.at = (k, lead) => at(k === 1 ? 2 : k, lead);
    try { await V2.S8(r, p); } finally { r.at = at; }
  },

  S9: async (r, p) => {
    await r.unzoom();
    await r.off(async () => { await p.evaluate(() => window.scrollTo(0, 0)); });
    const save = p.getByRole("button", { name: /^Salvar estudo|^Salvar$/ }).filter({ visible: true }).first();
    if (await save.count()) {
      await r.click(save, { pauseAfter: true });
      await r.stable();
      r.confirm();
    } else r.issue("S9: botão de salvar o estudo não encontrado");
    await r.at(1);
    const mine = p.getByRole("button", { name: /^Meus estudos/ }).first();
    await r.mark("meus", mine);
    await r.click(mine, { pauseAfter: true });
    const dlg = p.getByRole("dialog", { name: "Estudos salvos" });
    await dlg.waitFor({ timeout: 60000 });
    await r.stable();
    r.zoom(await dlg.boundingBox(), 1.15);
    await r.hold(450);
    await r.at(2);
    for (const re of [/^Exportar relatório/, /^Gerar laudo/, /^Explicar resultado/, /^Executar$/]) {
      const b = dlg.getByRole("button", { name: re }).first();
      if (await b.count()) await r.point(b, 700);
    }
    await r.shot("meus_estudos");
    await r.at(3);
  },

  // ------------------------------------------------------------ 3. Mapas e comparação
  P1: async (r, p) => {
    await r.unzoom();
    await r.page.keyboard.press("Escape");
    await shifted(V2.P1, 1)(r, p);
  },
  P2: async (r, p) => {
    await r.unzoom({ instant: true });
    await r.jumpTop();
    // The index line lives in the map inspector (an <aside>, D-221), open by default.
    const radio = p.getByRole("radio", { name: "Placa leve limitada por rigidez" });
    // Plate card on the bottom edge of the side panel and of the window, inside a dry
    // cut: the beam cards further down never show.
    r.pause();
    await radio.evaluate((el) => {
      let c = el;
      while (c.parentElement && c.getBoundingClientRect().height < 110) c = c.parentElement;
      const aside = el.closest("aside");
      if (aside) { aside.style.scrollBehavior = "auto"; aside.scrollTop += c.getBoundingClientRect().bottom - Math.min(aside.getBoundingClientRect().bottom, innerHeight) + 4; }
    });
    await r.stable(15000, { resume: false });
    await r.resume();
    await r.click(p.getByText("Placa leve limitada por rigidez", { exact: true }).filter({ visible: true }).first(), { pauseAfter: true });
    await r.stable(15000, { resume: false });
    // Cut back to the map: the plate's line is on it.
    await panelTop(r, p);
    await r.at(1);
    const plot = p.locator(".js-plotly-plot").first();
    r.zoom(await r.cardBox(plot, 300), 1.15);
    await r.hold(450);
    await r.mark("plot", plot);
    await r.shot("placa_mapa");
    // Cut to the slope the server derived, cropped so the beam card above stays out.
    await r.at(2);
    r.pause();
    await r.unzoom({ instant: true });
    const info = p.getByText(/Índice E\^\(1\/3\)\/ρ para placas leves/).filter({ visible: true }).first();
    await r.jump(info, 100, { stayPaused: true });
    await cropInfo(r, p, info);
    await r.resume();
    const incl = p.getByText("Inclinação (log-log)").filter({ visible: true }).first();
    await r.expect(incl.locator(".."), /3,000|:\s*3\b/, "inclinação 3");
    await r.point(incl, 1600);
    await r.mark("inclinacao", incl);
    await r.shot("inclinacao");
  },

  P3: async (r, p) => {
    const info = p.getByText(/Índice E\^\(1\/3\)\/ρ para placas leves/).filter({ visible: true }).first();
    const line = p.getByLabel("Linha passando por");
    await r.select(line, "Alumínio 1100-H14");
    await r.stable();
    await r.hold(500);
    // Cut to the map: the line now passes through that material.
    r.pause();
    await r.unzoom({ instant: true });
    await panelTop(r, p);
    await p.waitForFunction(() => {
      const g = document.querySelector(".js-plotly-plot");
      return g && g.data && g.data.some((d) => /Alumínio 1100-H14/.test(d.name || ""));
    }, null, { timeout: 15000 }).catch(() => r.issue("P3: reta não passou pelo material"));
    await r.resume();
    const plot = p.locator(".js-plotly-plot").first();
    r.zoom(await r.cardBox(plot, 300), 1.15);
    await r.hold(450);
    await r.mark("plot", plot);
    // Line geometry (data coordinates) for the shaded region in the motion layer.
    const geo = await p.evaluate(() => {
      const g = document.querySelector(".js-plotly-plot");
      const tr = g && g.data && g.data.find((d) => d.mode && /lines/.test(d.mode) && /Alumínio|índice|Placa/i.test(d.name || ""));
      const xa = g._fullLayout.xaxis, ya = g._fullLayout.yaxis;
      return tr ? { x: tr.x, y: tr.y, xr: xa.range, yr: ya.range, xo: xa._offset, yo: ya._offset, xl: xa._length, yl: ya._length, xt: xa.type } : null;
    }).catch(() => null);
    if (geo && !r.fast) r.events.linha = geo;
    await r.shot("nivel");
    await r.at(1);
    await r.hold(200);
    // Switch to the tie's line (slope 1), same dry-cut framing as the plate.
    await r.at(2);
    r.pause();
    await r.unzoom({ instant: true });
    const radio = p.getByRole("radio", { name: "Rigidez específica" });
    await r.off(async () => {
      await radio.evaluate((el) => {
        let c = el;
        while (c.parentElement && c.getBoundingClientRect().height < 110) c = c.parentElement;
        const aside = el.closest("aside");
        if (aside) { aside.style.scrollBehavior = "auto"; aside.scrollTop += c.getBoundingClientRect().bottom - Math.min(aside.getBoundingClientRect().bottom, innerHeight) + 4; }
      });
      await radio.check({ force: true });
      await p.waitForFunction(() => /Inclinação \(log-log\)\s*:?\s*1[,.]000/.test(document.body.innerText), null, { timeout: 30000 })
        .catch(() => r.issue("P3: a reta não trocou para E/ρ"));
    });
    const info1 = p.getByText(/Inclinação \(log-log\)/).filter({ visible: true }).first();
    r.pause();
    await r.jump(info1, 300, { stayPaused: true });
    const top = await info1.evaluate((el) => {
      let c = el;
      while (c.parentElement && c.getBoundingClientRect().height < 300) c = c.parentElement;
      return c.getBoundingClientRect().top;
    });
    const h = Math.min(1080, 1080 - (top - 8)), w = (h * 16) / 9;
    if (!r.fast) r.crop({ x: 1920 - w, y: 1080 - h, width: w, height: h }, { instant: true });
    await r.resume();
    await r.expect(info1.locator(".."), /1,000|:\s*1\b/, "inclinação 1");
    await r.point(info1, 1600);
    await r.shot("inclinacao1");
  },


  P4: async (r, p) => {
    await r.unzoom({ instant: true });
    await r.jumpTop();
    const sec = p.getByRole("button", { name: "Aparência" }).first();
    await r.mark("inspetor", await r.cardBox(sec, 400));
    await r.click(sec);
    await r.hold(500);
    await r.click(sec);
    await r.at(1);
    const classic = p.getByRole("button", { name: "Limite de escoamento × Densidade" }).first();
    await r.scrollTo(classic, "center");
    await r.click(classic, { pauseAfter: true });
    await r.off(async () => {
      await p.waitForFunction(() => /Limite de escoamento/.test(document.querySelector(".js-plotly-plot")?.innerText || document.body.innerText), null, { timeout: 60000 }).catch(() => {});
      await p.evaluate(() => window.scrollTo(0, 0));
    });
    const plot = p.locator(".js-plotly-plot").first();
    await r.mark("plot", plot);
    await r.hold(900);
    await r.shot("classico");
  },

  K1: async (r, p) => {
    await r.unzoom({ instant: true });
    await r.goto("/app/comparar");
    const pairs = p.getByRole("heading", { name: "Pares clássicos" });
    r.zoom(await r.cardBox(pairs, 160), 1.2);
    await r.hold(450);
    await r.at(1);
    const pair = p.getByRole("button", { name: /^Comparar Cobre .* com Alumínio/ }).first();
    await r.mark("par", pair);
    await r.point(pair, 900);
    await r.at(2);
    await r.unzoom();
    await r.click(pair, { pauseAfter: true });
    await r.off(async () => {
      await p.getByRole("table").filter({ visible: true }).first().waitFor({ timeout: 120000 });
    });
    // The "Propriedades computadas" block below the table lists every catalog index,
    // beam ones included: the frame always stops above it.
    await cropAbove(r, p);
    await r.hold(900);
    await r.shot("tabela");
    // End on the top of the page, so the next scene's first frame is clean.
    await r.unzoom({ instant: true });
    await r.jumpTop();
  },

  // ------------------------------------------------------------ 4. Dados confiáveis
  D1: async (r, p) => {
    await V2.D1(r, p);
    await r.at(1);
    await r.unzoom();
    const fam = p.getByRole("heading", { name: "Famílias" });
    await r.scrollTo(fam, "start");
    r.zoom(await r.cardBox(fam, 160), 1.2);
    await r.hold(450);
    await r.mark("familias", await r.cardBox(fam, 160));
    await r.shot("familias");
  },
  D2: V2.D2,
  D3: V2.D3,

  // ------------------------------------------------------------ 5. Dimensionar e custo
  Z1: async (r, p) => {
    await r.unzoom({ instant: true });
    await r.goto("/app/dimensionar");
    const L = p.getByLabel(/^Comprimento/).first();
    const S = p.getByLabel(/^Rigidez exigida/).first();
    await r.scrollTo(L, "center");
    r.zoom(await r.cardBox(L, 260), 1.25);
    await r.hold(450);
    await r.at(1);
    await r.mark("comprimento", L);
    await r.at(2);
    await r.type(L, "0.5");
    await r.type(S, "20000000");
    await r.mark("rigidez", S);
    r.pause();
    await p.getByRole("table").filter({ visible: true }).first().waitFor({ timeout: 600000 });
    await r.stable();
    await r.resume();
    r.confirm();
    await r.at(3);
    await r.unzoom({ instant: true });
    // Rows 1-4 at the bottom of the window; the 5th row (the beam example's winner)
    // stays below the edge.
    const t = p.getByRole("table").filter({ visible: true }).first();
    await r.off(async () => {
      await t.locator("tbody tr").nth(4).scrollIntoViewIfNeeded();
      await hideFrom(p, t.locator("tbody tr").nth(4));
    });
    const tb = await t.boundingBox();
    const r4 = await t.locator("tbody tr").nth(3).boundingBox();
    const top = Math.max(0, r4.y + r4.height - 640);
    const h = r4.y + r4.height + 2 - top, w = (h * 16) / 9;
    if (!r.fast) r.crop({ x: Math.max(0, Math.min(1920 - w, tb.x + tb.width / 2 - w / 2)), y: top, width: w, height: h });
    await r.hold(450);
    await r.point(t.locator("tbody tr").nth(0), 1500);
    await r.at(4);
    await r.shot("tirante");
  },

  Z2: async (r, p) => {
    await r.unzoom({ instant: true });
    await r.off(async () => { await p.evaluate(() => window.scrollTo(0, 0)); });
    await r.select(p.getByLabel("Caso"), "Placa em flexão, rigidez especificada");
    await r.stable();
    const L = p.getByLabel(/^Comprimento/).first();
    await r.scrollTo(L, "center");
    r.zoom(await r.cardBox(L, 260), 1.2);
    await r.hold(450);
    await r.type(L, "0.4");
    await r.type(p.getByLabel(/^Largura/).first(), "0.3");
    await r.off(async () => {
      await p.getByLabel(/^Rigidez exigida/).first().fill("5000");
      const sup = p.locator("select", { has: p.locator("option", { hasText: "Biapoiada, carga no meio do vão" }) });
      if (await sup.count()) await sup.first().selectOption({ label: "Biapoiada, carga no meio do vão" });
      else await p.getByLabel(/Constante de apoio/).fill("48");
      await p.waitForFunction(() => /Balsa/.test(document.querySelector("table")?.innerText || ""), null, { timeout: 120000 });
    });
    r.confirm();
    await r.at(1);
    await r.unzoom({ instant: true });
    const t = p.getByRole("table").filter({ visible: true }).first();
    await r.off(async () => { await t.evaluate((el) => el.scrollIntoView({ block: "start" })); await p.evaluate(() => window.scrollBy(0, -260)); });
    const r3 = await t.locator("tbody tr").nth(2).boundingBox();
    const tb = await t.boundingBox();
    const top = tb.y - 20, h = Math.max(420, r3.y + r3.height + 20 - top), w = (h * 16) / 9;
    if (!r.fast) r.crop({ x: Math.max(0, Math.min(1920 - w, tb.x + tb.width / 2 - w / 2)), y: Math.max(0, top), width: w, height: Math.min(1080, h) });
    await r.hold(450);
    await r.point(t.locator("tbody tr").nth(0), 1500);
    await r.at(2);
    await r.point(t.locator("tbody tr").nth(1), 1200);
    await r.shot("placa");
  },

  Z3: async (r, p) => {
    await r.unzoom({ instant: true });
    const t = p.getByRole("table").filter({ visible: true }).first();
    const est = t.locator("tbody tr").nth(0).getByRole("link", { name: /Estimar custo/ }).first();
    await r.scrollTo(est, "center");
    await r.at(1);
    await r.click(est, { pauseAfter: true });
    await r.off(async () => {
      await p.getByText("Massa calculada no Dimensionar", { exact: false }).first().waitFor({ timeout: 120000 });
    });
    const note = p.getByText("Massa calculada no Dimensionar", { exact: false }).filter({ visible: true }).first();
    r.zoom(await r.cardBox(note, 220), 1.25);
    await r.hold(450);
    await r.mark("massa", note);
    await r.point(note, 1400);
    await r.at(2);
    await r.unzoom();
    const cmp = p.getByLabel(/Comparar com outros materiais/).first();
    if (await cmp.count()) await r.point(cmp, 1400);
    await r.shot("custo");
  },

  // ------------------------------------------------------------ 6. Demais recursos
  R1: async (r, p) => {
    await r.unzoom({ instant: true });
    const own = await p.request.post(API + "/materials", { data: {
      name: "Liga Exemplo do Participante (fictícia)", class_id: 1, is_own_record: true,
      description: "Registro próprio fictício, criado só para a demonstração em vídeo.",
      values: [
        { property_slug: "densidade", kind: "scalar", value: 2.75, unit: "g/cm**3" },
        { property_slug: "modulo_young", kind: "scalar", value: 71, unit: "GPa" },
      ] } });
    if (own.status() !== 201) r.issue(`R1: registro próprio não criado (${own.status()})`);
    await r.hold(300);
    const tour = [
      [1, null, "/app/processos", "Processos"],
      [2, null, "/app/painel", "Painel"],
      [3, null, "/app/cadernos", "Cadernos"],
      [4, null, "/app/eco", "Eco"],
      [5, null, "/app/baterias", "Baterias"],
      [6, null, "/app/sintetizar", "Sintetizar"],
      [7, null, "/app/glossario", "Glossário"],
      [8, null, "/app/meus-registros", "Meus registros"],
      [9, null, "/app/admin/classes", "Classes"],
      [9, "Propriedades", "/app/admin/propriedades", "Propriedades"],
    ];
    for (const [k, word, url, name] of tour) {
      if (word) await r.atWord(k, word, 0.25); else await r.at(k, 0);
      await r.unzoom({ instant: true });
      await r.goto(url);
      r.label(name);
      if (url === "/app/processos") {
        const mx = p.getByRole("button", { name: "Matriz com materiais" }).or(p.getByRole("tab", { name: "Matriz com materiais" })).first();
        if (await mx.count()) await r.off(async () => { await mx.click(); await p.waitForTimeout(1500); });
        else r.issue("R1: aba Matriz com materiais não encontrada");
      }
      if (url === "/app/cadernos") {
        const nb = p.getByText("Seleção de materiais: anotações").filter({ visible: true }).first();
        if (await nb.count()) {
          await r.off(async () => {
            await nb.click();
            await p.getByText("Resumo do método (texto de demonstração)").filter({ visible: true }).first().waitFor({ timeout: 600000 });
          });
        } else r.issue("R1: caderno de demonstração ausente (rode preparar_dados.py)");
      }
      await r.shot(name);
    }
  },
};
