// Screen actions per scene. Each function receives the recorder (r) and the page.
// r.at(k) waits for sentence k of that scene's narration, so what is shown follows
// what is said. Values the narration quotes are read back with r.expect().
"use strict";

const bar = (p) => p.getByRole("group", { name: "Ações da etapa" });
const steps = (p) => p.getByRole("navigation", { name: "Etapas" });
const funnel = (p) => p.locator("aside, section, div").filter({ has: p.getByRole("heading", { name: "Funil de candidatos" }) }).last();

// D2 in Comparar: the "Propriedades computadas" block lists every catalog index,
// beam ones included. Keep its top edge just below the bottom of the viewport.
async function hideBelow(r, p) {
  const wasRec = r.recording && !r.fast;
  if (wasRec) r.pause();
  await r.stable();
  // Re-place until the layout stops moving (charts resize after they draw).
  let calm = 0;
  for (let i = 0; i < 40 && calm < 6; i++) {
    await new Promise((res) => setTimeout(res, 250));
    const h = p.getByText("Propriedades computadas", { exact: true }).filter({ visible: true }).first();
    if (!(await h.count())) break;
    const b = await h.boundingBox();
    if (Math.abs(b.y - 1090) > 3) { await p.evaluate((d) => window.scrollBy(0, d), b.y - 1090); calm = 0; } else calm++;
  }
  if (wasRec) await r.resume();
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

// Dry cut: page to the top and the map side panel (its own scroller) to a target.
async function panelCut(r, p, loc, block = "start") {
  const wasRec = r.recording && !r.fast;
  if (wasRec) r.pause();
  await p.evaluate(() => window.scrollTo(0, 0));
  await loc.evaluate((el, b) => {
    let c = el;
    while (c.parentElement && c.getBoundingClientRect().height < 300) c = c.parentElement;
    const aside = el.closest("aside");
    if (aside) aside.scrollTop += c.getBoundingClientRect().top - aside.getBoundingClientRect().top - (b === "start" ? 0 : 0);
  }, block);
  await new Promise((res) => setTimeout(res, 250));
  await r.stable();
  if (wasRec) await r.resume();
}
async function panelTop(r, p) {
  const wasRec = r.recording && !r.fast;
  if (wasRec) r.pause();
  await p.evaluate(() => {
    window.scrollTo(0, 0);
    const a = [...document.querySelectorAll("aside")].find((x) => x.textContent.includes("Controles do mapa"));
    if (a) { a.style.scrollBehavior = "auto"; a.scrollTop = 0; }
  });
  await new Promise((res) => setTimeout(res, 250));
  await r.stable();
  if (wasRec) await r.resume();
}

// Crop (instant, inside a dry cut) that starts right above the plate's index card, so
// the beam card above it never enters the frame. 16:9, anchored at the bottom right.
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

module.exports = {
  // ------------------------------------------------------------ Abertura
  "0.2": async (r, p) => {
    await r.goto("/app");
    await r.page.evaluate(() => window.__vc.setPos(1500, 760));
    await r.hold(600);
    await r.zoomOn(p.getByRole("heading", { level: 1 }), 1.18);
    await r.shot("titulo");
    await r.at(3);
    await r.unzoom();
  },

  // ------------------------------------------------------------ Parte 1
  "1.1": async (r, p) => {
    await r.goto("/app/selecao");
    await r.zoomOn(p.getByText("Função → Objetivo → Limites → Resultados", { exact: false }).filter({ visible: true }).first(), 1.2);
    await r.at(1);
    await r.unzoom();
    const s = steps(p);
    await r.point(s.getByRole("button", { name: /Função/ }));
    await r.at(2);
    await r.point(s.getByRole("button", { name: /Objetivo/ }));
    await r.at(3);
    await r.point(s.getByRole("button", { name: /Limites/ }));
    await r.at(4);
    await r.point(s.locator("li, button, div").filter({ hasText: /^4\s*Resultados/ }).first());
    await r.shot("etapas");
  },

  "1.2": async (r, p) => {
    await r.goto("/app/dimensionar");
    const deriv = p.getByText("Como o índice sai daí").filter({ visible: true }).first();
    await r.scrollTo(deriv);
    await r.click(deriv);
    await r.hold(500);
    const box = p.locator("details, section, div").filter({ has: p.getByText("Objetivo: m = A · L · ρ.") }).last();
    await r.scrollTo(p.getByText("Objetivo: m = A · L · ρ."));
    await r.zoomOn(box, 1.25);
    await r.shot("derivacao");
    await r.at(1);
    await r.point(p.getByText("Objetivo: m = A · L · ρ."), 600);
    await r.at(2);
    await r.point(p.getByText("Isolando a variável livre: A = S · L / E."), 600);
    await r.at(3);
    await r.point(p.getByText(/Minimizar a massa é portanto maximizar E\/ρ/), 900);
  },

  "1.3": async (r, p) => {
    await r.goto("/app/mapas");
    await p.locator(".js-plotly-plot .main-svg").first().waitFor({ timeout: 20000 });
    await r.stable();
    const plot = p.locator(".js-plotly-plot").first();
    await r.scrollTo(plot, "center");
    await r.shot("mapa");
    await r.at(1);
    await r.zoomOn(plot, 1.15);
    await r.at(2);
    await r.unzoom();
    await r.goto("/app/selecao");
    await r.zoomOn(p.getByRole("heading", { name: "Funil de candidatos" }).locator("xpath=ancestor::*[self::section or self::aside or self::div][1]"), 1.3);
    await r.shot("funil");
  },

  "1.4": async (r, p) => {
    await r.unzoom();
    await r.zoomOn(p.getByText("(determinístico, sem IA)", { exact: false }).filter({ visible: true }).first(), 1.3);
    await r.at(2);
    await r.unzoom();
    const adv = p.getByText("Opções avançadas").filter({ visible: true }).first();
    await r.scrollTo(adv);
    await r.click(adv);
    const ia = p.getByText("Preencher a partir de um texto (IA)").filter({ visible: true }).first();
    await r.scrollTo(ia);
    await r.point(ia, 1400);
    await r.shot("ia");
    await r.at(4);
    await r.click(adv);
    await r.scrollBy(-2000);
  },

  // ------------------------------------------------------------ Parte 2
  "2.1": async (r, p) => {
    await r.goto("/app");
    const box = p.getByRole("textbox").first();
    await r.type(box, "Tirante leve e rígido em tração");
    await r.at(1);
    await r.point(p.getByRole("button", { name: "Montar a seleção" }), 1000);
    await r.at(3);
    const retomar = p.getByRole("heading", { name: "Retomar um estudo" });
    await r.scrollTo(retomar, "start");
    await r.point(p.getByText("Tirante leve e rígido", { exact: true }).filter({ visible: true }).first(), 1200);
    await r.shot("retomar");
    await r.scrollBy(-2000);
  },

  "2.2": async (r, p) => {
    await r.click(p.getByRole("button", { name: "Montar a seleção" }));
    await p.waitForURL(/selecao/, { timeout: 20000 });
    r.pause();
    await r.stable();
    await r.resume();
    await r.type(p.getByLabel("Nome do estudo"), "Tirante leve e rígido a 200 °C");
    await r.at(1);
    await r.type(p.getByLabel("Objetivo", { exact: true }), "Mínima massa para rigidez axial dada");
    const f = p.getByRole("heading", { name: "Funil de candidatos" });
    await r.zoomOn(f.locator("xpath=ancestor::*[self::section or self::aside or self::div][1]"), 1.3);
    await r.expect(p.locator("main"), /678\s*de 678 continuam/, "funil inicial 678");
    await r.shot("funcao");
  },

  "2.3": async (r, p) => {
    await r.unzoom();
    await r.click(bar(p).getByRole("button", { name: "Próximo: Objetivo" }), { pauseAfter: true });
    await r.stable(15000, { resume: false });
    // D2: park the "Rigidez específica" card just above the action bar, so the row
    // below it (where the beam indices start) stays off screen.
    const radio = p.getByRole("radio", { name: "Rigidez específica" });
    // Dry cut: scroll the card to just above the action bar and crop at once, so the
    // row below (where the beam indices start) never shows.
    r.pause();
    const card = await r.cardBox(radio);
    await p.evaluate((d) => window.scrollBy(0, d), card.y + card.height - 985);
    await r.stable(15000, { resume: false });
    const c2 = await r.cardBox(radio);
    r.crop({ x: Math.max(0, c2.x + c2.width - 1477), y: 995 - 831, width: 1477, height: 831 }, { instant: true });
    await r.resume();
    await r.hold(450);
    await r.shot("indice");
    await r.at(1);
    await r.click(p.getByText("Rigidez específica", { exact: true }).filter({ visible: true }).first());
    await r.hold(500);
    await r.at(2);
    // Dry cut: "Continuar" sits right under the index grid, beam cards included.
    r.pause();
    await r.unzoom({ instant: true });
    await p.getByRole("button", { name: "Continuar: critérios e pesos" }).click();
    await r.stable();
    await p.evaluate(() => window.scrollTo(0, 0));
    await r.stable();
    await r.resume();
    const cond = p.getByText("Condições de validade").filter({ visible: true }).first();
    await r.scrollTo(cond, "center");
    const cb = await r.cardBox(cond, 220);
    r.zoom(cb, 1.25);
    await r.hold(450);
    await r.point(cond, 1500);
    await r.shot("condicoes");
  },

  "2.5": async (r, p) => {
    await r.unzoom();
    const add = p.getByRole("button", { name: "Adicionar critério" });
    await r.scrollTo(add, "center");
    await r.click(add);
    await r.stable();
    const pesos = p.getByLabel("Peso");
    await r.at(1);
    await r.type(pesos.nth(0), "0,7");
    await r.click(add);
    await r.stable();
    const crit = p.getByLabel("Critério").nth(1);
    await r.type(crit, "Custo por");
    await r.hold(400);
    await r.click(p.getByRole("option", { name: /Custo por massa/ }).first());
    await r.select(p.getByLabel("Direção").nth(1), "Menor é melhor");
    await r.type(pesos.nth(1), "0,3");
    await r.stable();
    await r.at(2);
    const total = p.getByText(/Total 1 de 1/).filter({ visible: true }).first();
    await r.scrollTo(total, "center");
    r.zoom(await r.cardBox(total, 260), 1.25);
    await r.hold(450);
    await r.expect(p.locator("main"), /Total 1 de 1 — fechado/, "pesos fecham 1");
    await r.shot("pesos");
  },

  "2.6": async (r, p) => {
    await r.unzoom();
    await r.click(bar(p).getByRole("button", { name: "Próximo: Limites" }));
    await r.stable();
    const prop = p.getByRole("combobox", { name: "Propriedade" });
    await r.type(prop.nth(0), "tração");
    await r.hold(300);
    await r.click(p.getByRole("option", { name: /Resistência à tração/ }).first());
    await r.select(p.getByLabel("Operador").nth(0), "≥ maior ou igual");
    await r.at(1);
    await r.type(p.getByLabel("Valor").nth(0), "100");
    await r.select(p.getByLabel("Unidade").nth(0), "MPa");
    await r.stable();
    const le = p.getByText(/Lê-se:/).filter({ visible: true }).first();
    r.zoom(await r.cardBox(le, 160), 1.3);
    await r.hold(450);
    await r.expect(le.locator(".."), /Resistência à tração ≥ 100 MPa/, "frase Lê-se");
    await r.point(le, 900);
    await r.unzoom();

    await r.at(2);
    await r.click(p.getByRole("button", { name: "Adicionar limite" }));
    await r.type(prop.nth(1), "tenacidade à");
    await r.hold(300);
    await r.click(p.getByRole("option", { name: /^Tenacidade à fratura/ }).first());
    await r.select(p.getByLabel("Operador").nth(1), "≥ maior ou igual");
    await r.type(p.getByLabel("Valor").nth(1), "15");
    await r.stable();

    await r.at(3);
    await r.click(p.getByRole("button", { name: "Adicionar limite" }));
    await r.type(prop.nth(2), "temperatura máxima");
    await r.hold(300);
    await r.click(p.getByRole("option", { name: /^Temperatura máxima de serviço/ }).first());
    await r.select(p.getByLabel("Operador").nth(2), "≥ maior ou igual");
    await r.type(p.getByLabel("Valor").nth(2), "200");
    await r.at(4);
    await r.stable();
    await r.shot("limites");

    const fun = p.getByRole("heading", { name: "Funil de candidatos" });
    await r.scrollTo(fun, "center");
    r.zoom(await r.cardBox(fun, 300), 1.25);
    await r.hold(450);
    const txt = (await r.scan("funil")).replace(/\s+/g, " ");
    for (const n of ["678", "364", "268", "194"]) {
      if (!txt.includes(n) && !r.fast) { r.issue(`NÚMERO DIVERGENTE no funil: ${n} ausente`); throw new Error("funil diverge"); }
    }
    await r.shot("funil");
  },

  "2.7": async (r, p) => {
    await r.unzoom();
    const run = bar(p).getByRole("button", { name: "Executar seleção" });
    await r.waitEnabled(run, 10000);
    await r.click(run);
    r.pause();
    await p.getByRole("heading", { name: /^Vencedor: / }).waitFor({ timeout: 30000 });
    await r.stable();
    await r.resume();
    const win = p.getByRole("heading", { name: /^Vencedor: / });
    await r.expect(win, /CFRP \(Fibras de Carbono Contínuas\)/, "vencedor do tirante");
    await r.scrollTo(win, "center");
    r.zoom(await r.cardBox(win, 200), 1.25);
    await r.hold(450);
    await r.shot("vencedor");
    await r.at(1);
    await r.unzoom();
    await r.click(p.getByRole("tab", { name: /Classificação/ }));
    await r.stable();
    const tbl = p.getByRole("table").first();
    await r.scrollTo(tbl, "start");
    await r.shot("classificacao");
  },

  "2.8": async (r, p) => {
    await r.click(p.getByRole("tab", { name: /Eliminados/ }));
    await r.stable();
    await r.shot("eliminados");
    await r.at(1);
    const miss = p.getByText("Excluídos por dados ausentes").filter({ visible: true }).first();
    if (await miss.count()) { await r.scrollTo(miss, "center"); r.zoom(await r.cardBox(miss, 200), 1.25); await r.hold(450); await r.point(miss, 1200); }
    else r.issue("aba Eliminados: não achei a linha do material sem dado");
    await r.shot("eliminados2");
  },

  "2.9": async (r, p) => {
    await r.unzoom();
    await r.click(p.getByRole("tab", { name: /Sensibilidade/ }));
    await r.stable();
    const t = p.getByRole("table").first();
    await r.scrollTo(t, "center");
    r.zoom(await r.cardBox(t, 200), 1.25);
    await r.hold(450);
    await r.expect(t, /CFRP \(Fibras de Carbono Contínuas\)/, "sensibilidade estável");
    await r.shot("sensibilidade");
  },

  "2.10": async (r, p) => {
    await r.unzoom();
    await r.click(p.getByRole("tab", { name: /Origem dos dados/ }));
    await r.stable();
    const h = p.getByText("Proveniência do resultado").filter({ visible: true }).first();
    await r.scrollTo(h, "start");
    await r.shot("origem");
    await r.at(1);
    await r.scrollBy(300);
    await r.at(2);
    await r.click(bar(p).getByRole("button", { name: "Salvar estudo" }));
    await p.getByText("Estudo salvo.", { exact: true }).waitFor({ timeout: 15000 });
    r.confirm();
    await r.zoomOn(p.getByText("Estudo salvo.", { exact: true }), 1.3);
    await r.shot("salvo");
  },

  "2.11": async (r, p) => {
    await r.unzoom();
    await r.goto("/app/mapas");
    await p.locator(".js-plotly-plot .main-svg").first().waitFor({ timeout: 20000 });
    await r.stable();
    const lv = p.getByRole("button", { name: "Nível 1", exact: true });
    await r.point(lv, 600);
    await r.point(p.getByRole("button", { name: "Nível 3", exact: true }), 600);
    await r.point(p.getByLabel("Eixo X"), 700);
    await r.point(p.getByLabel("Eixo Y"), 700);
    await r.at(1);
    const plotted = p.getByText(/materiais plotados/).filter({ visible: true }).first();
    await r.expect(plotted, /673 de 678 materiais plotados/, "materiais plotados");
    r.zoom(await r.cardBox(plotted, 60), 1.3);
    await r.hold(450);
    await r.at(2);
    await r.unzoom();
    const fora = p.getByRole("heading", { name: "Materiais fora do mapa" });
    await r.scrollTo(fora, "center");
    r.zoom(await r.cardBox(fora, 260), 1.25);
    await r.hold(450);
    await r.shot("fora");
  },

  "2.12": async (r, p) => {
    await r.unzoom();
    await r.jumpTop();
    const pers = p.getByText("Personalizar o mapa").filter({ visible: true }).first();
    await r.scrollTo(pers, "center");
    await r.click(pers);
    await r.stable();
    const radio = p.getByRole("radio", { name: "Placa leve limitada por rigidez" });
    // D2: the plate card sits on the bottom edge of the viewport; the beam cards,
    // further down the list, stay below it.
    // Align the plate card with the bottom of the side panel (its own scroller) and of
    // the window, inside a dry cut, so the row below it never shows.
    r.pause();
    await radio.evaluate((el) => {
      let c = el;
      while (c.parentElement && c.getBoundingClientRect().height < 110) c = c.parentElement;
      const aside = el.closest("aside");
      if (aside) { aside.style.scrollBehavior = "auto"; aside.scrollTop += c.getBoundingClientRect().bottom - Math.min(aside.getBoundingClientRect().bottom, innerHeight) + 4; }
    });
    await r.stable(15000, { resume: false });
    await r.resume();
    await r.at(1);
    await r.click(p.getByText("Placa leve limitada por rigidez", { exact: true }).filter({ visible: true }).first(), { pauseAfter: true });
    // Cut to the plate's index card, cropped so the beam card above it stays out.
    const info = p.getByText(/Índice E\^\(1\/3\)\/ρ para placas leves/).filter({ visible: true }).first();
    await r.jump(info, 100, { stayPaused: true });
    await cropInfo(r, p, info);
    await r.resume();
    const line = p.getByLabel("Linha passando por");
    await r.select(line, "Alumínio 1100-H14");
    await r.stable();
    await r.hold(1200);
    await r.shot("placa_controles");
    // Cut back to the map at page top (side panel at its top: controls only).
    await r.at(2);
    r.pause();
    await r.unzoom({ instant: true });
    await panelTop(r, p);
    await p.waitForFunction(() => {
      const g = document.querySelector(".js-plotly-plot");
      return g && g.data && g.data.some((d) => /Alumínio 1100-H14/.test(d.name || ""));
    }, null, { timeout: 15000 });
    await r.hold(600);
    const plot = p.locator(".js-plotly-plot").first();
    r.zoom(await r.cardBox(plot, 300), 1.2);
    await r.hold(450);
    await r.shot("placa_mapa");
    // Cut to the slope the server derived, same safe crop.
    await r.at(3);
    r.pause();
    await r.unzoom({ instant: true });
    await r.jump(info, 100, { stayPaused: true });
    await cropInfo(r, p, info);
    await r.resume();
    const incl = p.getByText("Inclinação (log-log)").filter({ visible: true }).first();
    await r.expect(incl.locator(".."), /3,000/, "inclinação 3");
    await r.point(incl, 1200);
    await r.shot("inclinacao");
    // Back to the map for the reading rule.
    await r.at(4);
    r.pause();
    await r.unzoom({ instant: true });
    await panelTop(r, p);
    await r.hold(300);
    await r.shot("placa_fim");
  },

  "2.4": async (r, p) => {
    await r.unzoom();
    await panelTop(r, p);
    const idxBtn = p.getByRole("button", { name: "Índice", exact: true }).nth(1);
    await r.scrollTo(idxBtn, "center");
    await r.click(idxBtn);
    await r.stable();
    const sel = p.locator("select", { has: p.locator('option[value="custom"]') }).first();
    if (!r.fast) await r.click(sel);
    await sel.selectOption("custom");
    await r.stable();
    const search = p.getByLabel("Buscar propriedade ou função").first();
    await r.scrollTo(search, "center");
    await r.at(1);
    await r.type(search, "Young");
    await r.click(p.getByRole("button", { name: "Inserir Módulo de Young na expressão" }));
    await r.stable();
    // "E ÷" alone is an invalid expression and the page says so; the rest of the
    // build happens inside a dry cut, and the video resumes on the valid expression.
    await r.click(p.getByTestId("expression-keypad").getByText("÷", { exact: true }), { pauseBefore: true });
    await search.fill("Densid");
    await p.getByRole("button", { name: "Inserir Densidade na expressão" }).click();
    await p.getByText("Expressão válida").filter({ visible: true }).first().waitFor({ timeout: 15000 });
    await r.stable();
    await r.at(2);
    const ok = p.getByText("Expressão válida").filter({ visible: true }).first();
    await r.scrollTo(ok, "center");
    r.zoom(await r.cardBox(ok, 300), 1.3);
    await r.hold(450);
    await r.point(p.getByText(/Unidade do resultado/).filter({ visible: true }).first(), 1200);
    await r.shot("calc");
  },

  "2.13": async (r, p) => {
    await r.unzoom();
    await r.goto("/app/comparar");
    const add = p.getByRole("combobox", { name: "Buscar e adicionar material" }).filter({ visible: true }).first();
    const mats = [
      ["Fibras de Carbono Cont", "CFRP (Fibras de Carbono Contínuas)"],
      ["Infiltração de Fundido", "CMC SiC/SiC por Infiltração de Fundido (MI)"],
      ["SiC/SiC por Infiltração Qu", "CMC SiC/SiC por Infiltração Química em Vapor (CVI)"],
    ];
    await r.type(add, mats[0][0]);
    await r.hold(300);
    await r.click(p.getByRole("option", { name: mats[0][1] }).first());
    await r.stable();
    // Dry cut: the other two candidates and the property choice, then back on camera.
    r.pause();
    for (const [q, full] of mats.slice(1)) {
      await add.fill(q);
      await p.getByRole("option", { name: full }).first().click();
      await r.stable(15000, { resume: false });
    }
    for (const off of ["Absorção de água (24 h, em massa)", "Alongamento na ruptura", "Coeficiente de perda (amortecimento)"]) {
      const b = p.getByRole("button", { name: off, exact: true });
      if (await b.count()) await b.first().click();
    }
    for (const on of ["Módulo de Young", "Resistência à tração", "Custo por massa"]) {
      await p.getByRole("button", { name: on, exact: true }).first().click();
    }
    await r.resume();
    await r.stable();
    await hideBelow(r, p);
    await r.at(1);
    await r.point(p.getByText("Estimado", { exact: true }).filter({ visible: true }).first(), 900);
    await r.shot("tabela");
    await r.at(2);
    for (const v of ["Barras", "Radar", "Coordenadas paralelas", "Heatmap"]) {
      const b = p.getByRole("button", { name: v, exact: true }).or(p.getByRole("tab", { name: v, exact: true })).first();
      await r.click(b, { pauseBefore: true });
      await b.evaluate((el) => new Promise((res) => {
        const t0 = Date.now();
        const tick = () => (el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-pressed") === "true"
          || Date.now() - t0 > 5000) ? setTimeout(res, 700) : setTimeout(tick, 100);
        tick();
      }));
      await cropAbove(r, p);
      await r.hold(700);
      await r.shot("v_" + v);
    }
  },

  "2.14": async (r, p) => {
    await r.goto("/app/catalogo");
    await r.paste(p.getByLabel("Buscar materiais"), "Infiltração de Fundido");
    await r.stable();
    await r.click(p.getByRole("link", { name: /Infiltração de Fundido/ }).filter({ visible: true }).first());
    await r.stable();
    await r.shot("preview");
    await r.at(1);
    const val = p.getByRole("button", { name: "Ver a proveniência deste valor" }).filter({ hasText: "2,75" }).filter({ visible: true }).first();
    await r.scrollTo(val, "center");
    await r.click(val);
    await r.stable();
    const pop = p.getByRole("dialog").filter({ visible: true }).first();
    if (await pop.count()) { r.zoom(await r.cardBox(pop, 200), 1.25); await r.hold(450); }
    else r.issue("2.14: popover de proveniência não encontrado");
    await r.shot("proveniencia");
    await r.at(2);
    await r.unzoom();
    await p.keyboard.press("Escape");
    await r.point(p.getByText("Estimado", { exact: true }).filter({ visible: true }).first(), 1000);
    await r.at(3);
    await r.point(p.getByText(/Valores estimados, só para demonstração/).filter({ visible: true }).first(), 1400);
  },

  "2.15": async (r, p) => {
    await r.unzoom();
    await r.goto("/app/dimensionar");
    await r.type(p.getByLabel("Comprimento (m)"), "0.5");
    await r.type(p.getByLabel("Rigidez exigida (N/m)"), "20000000");
    await r.at(1);
    await r.click(p.getByRole("button", { name: "Dimensionar", exact: true }));
    r.pause();
    await p.getByRole("table").filter({ visible: true }).first().waitFor({ timeout: 20000 });
    await r.stable();
    await r.resume();
    const res = p.getByRole("heading", { name: "3. O resultado" });
    await r.scrollTo(res, "start");
    await r.shot("tirante");
    await r.at(2);
    const t = p.getByRole("table").filter({ visible: true }).first();
    r.zoom(await r.cardBox(t.locator("tr").nth(2), 40), 1.25);
    await r.hold(450);
  },

  "2.16": async (r, p) => {
    await r.unzoom();
    await r.scrollBy(-3000);
    await r.select(p.getByLabel("Caso"), "Placa em flexão, rigidez especificada");
    await r.stable();
    await r.type(p.getByLabel("Comprimento (m)"), "0.4");
    // Dry cut for the remaining fields (width, stiffness, support).
    r.pause();
    await p.getByLabel("Largura da placa (m)").fill("0.3");
    await p.getByLabel("Rigidez exigida (N/m)").fill("5000");
    const sup = p.locator("select", { has: p.locator("option", { hasText: "Biapoiada, carga no meio do vão" }) });
    if (await sup.count()) await sup.first().selectOption({ label: "Biapoiada, carga no meio do vão" });
    else await p.getByLabel(/Constante de apoio/).fill("48");
    await r.stable(15000, { resume: false });
    await r.resume();
    await r.shot("placa_form");
    await r.click(p.getByRole("button", { name: "Dimensionar", exact: true }));
    r.pause();
    await p.getByRole("table").filter({ visible: true }).first().waitFor({ timeout: 20000 });
    await r.stable();
    await r.resume();
    const res = p.getByRole("heading", { name: "3. O resultado" });
    await r.scrollTo(res, "start");
    await r.at(1);
    await r.shot("placa");
  },

  "2.17": async (r, p) => {
    await r.unzoom();
    await r.goto("/app/importar");
    const drop = p.getByText("Arraste o arquivo para cá ou clique para escolher").filter({ visible: true }).first();
    const file = require("path").resolve(__dirname, "../dados/materiais-ficticios-video.csv");
    if (r.fast) await p.getByLabel("Selecione um arquivo CSV ou XLSX (até 5 MB).").setInputFiles(file);
    else {
      const [fc] = await Promise.all([p.waitForEvent("filechooser"), r.click(drop)]);
      await fc.setFiles(file);
    }
    await p.getByRole("heading", { name: "Mapeie as colunas" }).waitFor({ timeout: 20000 });
    await r.stable();
    await r.at(2);
    const map = p.getByRole("heading", { name: "Mapeie as colunas" });
    await r.scrollTo(map, "start");
    await r.point(p.getByLabel("Unidade da coluna densidade [g/cm3]"), 900);
    await r.select(p.getByLabel("Classe padrão (quando a coluna estiver vazia)"), "Compósitos");
    await r.shot("mapa_colunas");
    await r.at(3);
    await r.click(p.getByRole("button", { name: "Validar", exact: true }));
    await p.getByRole("heading", { name: "Relatório de validação" }).waitFor({ timeout: 20000 });
    await r.stable();
    const rep = p.getByRole("heading", { name: "Relatório de validação" });
    await r.scrollTo(rep, "start");
    await r.shot("relatorio");
    await r.click(p.getByRole("button", { name: /Importar linhas válidas/ }));
    await p.getByText("Importação concluída").filter({ visible: true }).first().waitFor({ timeout: 20000 });
    r.confirm();
    await r.stable();
    await r.shot("concluida");
    // Dry cut from "Importação concluída" straight to material B's sheet in the catalog.
    await r.click(p.getByRole("link", { name: "Ver no catálogo" }), { pauseBefore: true });
    await p.waitForURL(/catalogo/, { timeout: 20000 });
    await p.evaluate(() => window.scrollTo(0, 0));
    await r.stable(15000, { resume: false });
    await p.getByLabel("Buscar materiais").fill("Material Fictício B");
    await r.stable(15000, { resume: false });
    await p.getByRole("link", { name: /Material Fictício B/ }).filter({ visible: true }).first().click();
    await r.stable(15000, { resume: false });
    await r.resume();
    const row = p.getByText(/^Resistência à tração/).filter({ visible: true }).first();
    await r.scrollTo(row, "center");
    await r.at(4);
    r.zoom(await r.cardBox(row, 60), 1.3);
    await r.hold(450);
    await r.expect(row.locator("xpath=ancestor::*[self::tr or self::div][1]"), /Ausente/, "B sem resistência à tração");
    await r.point(row, 1200);
    await r.shot("ausente");
  },

  "2.18": async (r, p) => {
    await r.unzoom();
    await r.goto("/app/processos");
    await r.click(p.getByRole("link", { name: /^Calandragem/ }).first());
    await r.stable();
    await r.shot("processo");
    await r.at(1);
    await r.point(p.getByText("Estimado", { exact: true }).filter({ visible: true }).first(), 800);
    const serve = p.getByText(/^Serve \d+ materiais do catálogo/).filter({ visible: true }).first();
    r.zoom(await r.cardBox(serve, 80), 1.3);
    await r.hold(450);
    await r.point(serve, 1400);
    await r.shot("compat");
  },

  "2.19": async (r, p) => {
    await r.unzoom();
    await r.goto("/app/painel");
    await r.shot("painel");
    const q = p.getByRole("tab", { name: "Qualidade" });
    if (await q.count()) { await r.click(q); await r.stable(); }
    await r.shot("qualidade");
  },

  "3.1": async (r, p) => {
    // The own record is created only now, so the selection scenes count 678.
    const own = await p.request.post("http://127.0.0.1:8811/api/materials", { data: {
      name: "Liga Exemplo do Participante (fictícia)", class_id: 1, is_own_record: true,
      description: "Registro próprio fictício, criado só para a demonstração em vídeo.",
      values: [
        { property_slug: "densidade", kind: "scalar", value: 2.75, unit: "g/cm**3" },
        { property_slug: "modulo_young", kind: "scalar", value: 71, unit: "GPa" },
      ] } });
    if (own.status() !== 201) r.issue(`3.1: registro próprio não criado (${own.status()})`);
    const tour = [
      [1, "/app/cadernos", "Cadernos"], [2, "/app/custo", "Custo"], [3, "/app/eco", "Eco"],
      [4, "/app/baterias", "Baterias"], [5, "/app/sintetizar", "Sintetizar"],
      [6, "/app/glossario", "Glossário"], [7, "/app/meus-registros", "Meus registros"],
      [8, "/app/admin/classes", "Classes"],
    ];
    for (const [k, url, name] of tour) {
      await r.at(k, 0);
      await r.goto(url);
      r.label(name);
      if (url === "/app/cadernos") {
        const nb = p.getByText("Seleção de materiais: anotações").filter({ visible: true }).first();
        await nb.waitFor({ timeout: 15000 });
        await r.click(nb, { pauseAfter: true });
        await p.getByText("Resumo do método (texto de demonstração)").filter({ visible: true }).first().waitFor({ timeout: 20000 });
        await r.stable();
      }
      await r.shot(name);
    }
    await r.hold(2500);
    await r.goto("/app/admin/propriedades");
    r.label("Propriedades");
    await r.shot("Propriedades");
  },
};
