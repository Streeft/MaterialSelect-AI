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

const BASE_URL = `http://127.0.0.1:${process.env.WEB_PORT ?? 3011}`;
const API = `http://127.0.0.1:${process.env.API_PORT ?? 8811}/api`;
const mainArea = (p) => p.locator("main");

// The tie study shown in Block 2 (the same fields preparar_dados.py saves).
const TIE = {
  nome: "Tirante leve e rígido",
  funcao: "Tirante em tração",
  objetivo: "Mínima massa para rigidez dada",
  variaveis: "área da seção",
};

// Scroll the window (and any scrolling panel) so loc sits with its top at targetY.
async function placeTop(p, loc, targetY) {
  await loc.waitFor({ state: "attached", timeout: 60000 });
  await loc.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "auto" }));
  const b = await loc.evaluate((el) => el.getBoundingClientRect().top);
  await p.evaluate((d) => window.scrollBy(0, d), b - targetY);
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

// The funnel count arrives from the server (first run can take ~10 s): wait off camera.
async function waitFunnel(r, p) {
  const wasRec = r.recording && !r.fast;
  if (wasRec) r.pause();
  await p.getByText(/\d+\s*de\s*\d+\s*continuam/).first().waitFor({ timeout: 300000 });
  await r.stable(15000, { resume: false });
  if (wasRec) await r.resume();
}

module.exports = {
  // ------------------------------------------------------------ Abertura
  A1: async (r, p) => {
    await r.goto("/app");
    await r.page.evaluate(() => window.__vc.setPos(1640, 860));
    await r.hold(400);
    // Slow approach on the home title for the whole scene (camera drift in the motion layer).
    await r.zoomOn(p.getByRole("heading", { level: 1 }), 1.15);
    await r.shot("titulo");
    await r.at(3);
    await r.shot("selo");
  },

  // ------------------------------------------------------------ 1. O método
  M1: async (r, p) => {
    await r.goto("/app/selecao");
    await waitFunnel(r, p);
    const s = steps(p);
    await r.zoomOn(s, 1.25);
    await r.at(1);
    await r.point(s.getByRole("button", { name: /Função/ }), 1400);
    await r.at(2);
    await r.point(s.getByRole("button", { name: /Objetivo/ }), 1400);
    await r.at(3);
    await r.point(s.getByRole("button", { name: /Limites/ }), 1400);
    await r.at(4);
    await r.point(s.locator("li, button, div").filter({ hasText: /^4\s*Resultados/ }).first(), 1400);
    await r.shot("etapas");
  },

  M2: async (r, p) => {
    await r.goto("/app/dimensionar");
    const deriv = p.getByText("Como o índice sai daí").filter({ visible: true }).first();
    await r.scrollTo(deriv);
    await r.click(deriv);
    await r.hold(400);
    const first = p.getByText("Objetivo: m = A · L · ρ.");
    const box = p.locator("details, section, div").filter({ has: first }).last();
    await r.scrollTo(first);
    await r.mark("derivacao", box);
    await r.zoomOn(box, 1.2);
    await r.shot("derivacao");
    await r.at(1);
    await r.point(first, 900);
    await r.at(2);
    await r.point(p.getByText("Isolando a variável livre: A = S · L / E."), 900);
    await r.at(3);
    await r.point(p.getByText(/Minimizar a massa é portanto maximizar E\/ρ/), 1200);
    await r.at(4);
  },

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
    await r.zoomOn(p.getByText("(determinístico, sem IA)", { exact: false }).filter({ visible: true }).first(), 1.3);
    await r.shot("deterministico");
    await r.at(3);
    await r.unzoom();
    const ia = p.getByText("Preencher a partir de um texto (IA)").filter({ visible: true }).first();
    await r.point(ia, 1800);
    await r.shot("ia");
    await r.at(4);
  },

  // ------------------------------------------------------------ 2. Seleção
  S1: async (r, p) => {
    // Function, objective and free variables arrive filled; only the name is typed.
    await r.off(async () => {
      await p.goto(BASE_URL + "/app/selecao", { waitUntil: "domcontentloaded" });
      await p.getByLabel("Nome do estudo").waitFor({ timeout: 600000 });
      await p.getByLabel("Nome do estudo").fill("");
      await p.getByLabel("Função do componente").fill(TIE.funcao);
      await p.getByLabel("Objetivo", { exact: true }).fill(TIE.objetivo);
      await p.getByLabel(/Variáveis livres/).fill(TIE.variaveis);
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.evaluate(() => window.__vc.setPos(1100, 640));
      await p.getByText(/\d+\s*de\s*\d+\s*continuam/).first().waitFor({ timeout: 300000 });
    });
    const form = p.getByLabel("Nome do estudo");
    r.zoom(await r.cardBox(form, 380), 1.2);
    await r.hold(450);
    await r.type(form, TIE.nome);
    await r.at(1);
    await r.unzoom();
    const fun = p.getByRole("heading", { name: "Funil de candidatos" });
    r.zoom(await r.cardBox(fun, 200), 1.25);
    await r.hold(450);
    await r.expect(mainArea(p), /678\s*de 678 continuam/, "funil inicial 678");
    await r.point(p.getByText(/^678$/).filter({ visible: true }).first(), 1500);
    await r.shot("funcao");
  },

  S2: async (r, p) => {
    await r.unzoom();
    await r.click(bar(p).getByRole("button", { name: "Próximo: Objetivo" }), { pauseAfter: true });
    const radio = p.getByRole("radio", { name: "Rigidez específica" });
    await radio.waitFor({ state: "attached", timeout: 600000 });
    await r.stable(15000, { resume: false });
    // Dry cut: the chosen card sits right above the action bar and the crop shows only
    // its row, so the beam cards further down never enter the frame.
    r.pause();
    const card = await r.cardBox(radio);
    await p.evaluate((d) => window.scrollBy(0, d), card.y + card.height - 960);
    await r.stable(15000, { resume: false });
    const c2 = await r.cardBox(radio);
    const h = 560, w = (h * 16) / 9;
    r.crop({ x: Math.max(0, Math.min(1920 - w, c2.x + c2.width / 2 - w / 2)), y: Math.min(1080 - h, c2.y + c2.height + 8 - h), width: w, height: h }, { instant: true });
    await r.mark("cartao", c2);
    await r.resume();
    await r.hold(500);
    await r.click(p.getByText("Rigidez específica", { exact: true }).filter({ visible: true }).first());
    r.confirm();
    await r.shot("indice");
    await r.at(1);
    const cond = p.getByRole("radio", { name: "Rigidez específica" }).locator("xpath=ancestor::label[1]").getByText("Função:").first();
    if (await cond.count()) await r.point(cond, 1600);
    else await r.point(p.getByText("Rigidez específica", { exact: true }).filter({ visible: true }).first(), 1600);
    await r.shot("condicoes");
  },

  S3: async (r, p) => {
    // Off camera: the custom expression opens the calculator below the index cards.
    await r.off(async () => {
      await r.unzoom({ instant: true });
      await p.getByText("Expressão personalizada", { exact: true }).click();
      await p.getByTestId("expression-builder").first().waitFor({ timeout: 600000 });
      await p.getByTestId("expression-palette").getByRole("button").first().waitFor({ timeout: 600000 });
    });
    const calc = p.getByTestId("expression-builder").first();
    const display = calc.getByTestId("expression-display");
    const keypad = calc.getByTestId("expression-keypad");
    // Frame: from the display down to the keypad; the cards above and the classic
    // examples below (beam indices among them) stay outside the crop.
    r.pause();
    await placeTop(p, display, 150);
    await r.stable(15000, { resume: false });
    const d = await display.boundingBox();
    const k = await keypad.boundingBox();
    const top = d.y - 16, bottom = Math.max(k.y + k.height, d.y + d.height) + 16;
    const h = Math.min(1080, bottom - top), w = (h * 16) / 9;
    const cx = (Math.min(d.x, k.x) + Math.max(d.x + d.width, k.x + k.width)) / 2 - 140;
    r.crop({ x: Math.max(0, Math.min(1920 - w, cx - w / 2)), y: Math.max(0, top), width: w, height: h }, { instant: true });
    await r.resume();
    await r.hold(400);
    const search = calc.getByLabel("Buscar propriedade ou função");
    await r.type(search, "Young");
    await r.click(calc.getByRole("button", { name: "Inserir Módulo de Young na expressão" }).first());
    // "E ÷" alone is an incomplete expression and the page says so: the division and
    // the density go in inside a dry cut; the video resumes on the valid expression.
    await r.click(keypad.getByText("÷", { exact: true }).first(), { pauseBefore: true });
    await r.off(async () => {
      await search.fill("Densid");
      await calc.getByRole("button", { name: "Inserir Densidade na expressão" }).first().click();
      await display.getByText("Expressão válida").waitFor({ timeout: 600000 });
    });
    r.confirm();
    await r.at(1);
    await r.point(display.getByText(/Unidade do resultado/).first(), 1800);
    await r.mark("visor", display);
    await r.shot("calc");
    // Off camera: back to the specific-stiffness card, then on to criteria and weights.
    await r.off(async () => {
      await r.unzoom({ instant: true });
      await p.getByText("Rigidez específica", { exact: true }).filter({ visible: true }).first().click();
      await p.getByRole("button", { name: "Continuar: critérios e pesos" }).click();
    });
  },

  S4: async (r, p) => {
    // The ranking preview under the weights lists the tasks example's winner: the
    // frame always stops above "Prévia da classificação".
    const prev = () => p.getByText("Prévia da classificação", { exact: false }).filter({ visible: true }).first();
    const sec = p.getByText("2. Critérios e pesos", { exact: false }).filter({ visible: true }).first();
    // Keep "Prévia da classificação" under the fixed action bar (its top just below the window, y=1082): the
    // ranking preview never enters the picture. Re-placed in a dry cut after each change.
    const frame = async () => {
      await r.off(async () => {
        for (let i = 0; i < 12; i++) {
          if (!(await prev().count())) return;
          const y = (await prev().boundingBox()).y;
          if (Math.abs(y - 1082) < 3) return;
          await p.evaluate((d) => window.scrollBy(0, d), y - 1082);
          await new Promise((res) => setTimeout(res, 120));
        }
      });
    };
    const add = p.getByRole("button", { name: "Adicionar critério" });
    await r.off(async () => {
      await placeTop(p, sec, 150);
    });
    await frame();
    await r.click(add);
    await r.stable();
    const pesos = p.getByLabel("Peso");
    await r.type(pesos.nth(0), "0,7");
    await frame();
    await r.click(add);
    await frame();
    const crit = p.getByLabel("Critério").nth(1);
    await r.type(crit, "Custo por");
    await r.hold(300);
    await r.click(p.getByRole("option", { name: /Custo por massa/ }).first());
    await r.select(p.getByLabel("Direção").nth(1), "Menor é melhor");
    await r.type(pesos.nth(1), "0,3");
    await frame();
    await r.at(1);
    const total = p.getByText(/Total 1 de 1/).filter({ visible: true }).first();
    await r.expect(mainArea(p), /Total 1 de 1 — fechado/, "pesos fecham 1");
    await r.point(total, 1500);
    r.confirm();
    await r.shot("pesos");
  },

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
    await r.at(1);
    const le = p.getByText(/Lê-se:/).filter({ visible: true }).first();
    r.zoom(await r.cardBox(le, 160), 1.3);
    await r.hold(450);
    await r.expect(le.locator(".."), /Resistência à tração ≥ 100 MPa/, "frase Lê-se");
    await r.point(le, 1200);
    // Dry cut: the other two limits arrive ready.
    await r.at(2);
    await r.off(async () => {
      await r.unzoom({ instant: true });
      await p.getByRole("button", { name: "Adicionar limite" }).click();
      await prop.nth(1).fill("tenacidade à");
      await p.getByRole("option", { name: /^Tenacidade à fratura/ }).first().click();
      await p.getByLabel("Operador").nth(1).selectOption({ label: "≥ maior ou igual" });
      await p.getByLabel("Valor").nth(1).fill("15");
      await p.getByRole("button", { name: "Adicionar limite" }).click();
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
    await r.at(3);
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
      await r.atWord(3, n);
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

  S6: async (r, p) => {
    await r.unzoom();
    const run = bar(p).getByRole("button", { name: "Executar seleção" });
    await r.waitEnabled(run, 10000);
    await r.click(run);
    r.pause();
    await p.getByRole("heading", { name: /^Vencedor: / }).waitFor({ timeout: 600000 });
    await r.stable();
    await r.resume();
    r.confirm();
    const win = p.getByRole("heading", { name: /^Vencedor: / });
    await r.expect(win, /CFRP \(Fibras de Carbono Contínuas\)/, "vencedor do tirante");
    await r.expect(mainArea(p), /0,999/, "nota 0,999");
    await r.scrollTo(win, "center");
    r.zoom(await r.cardBox(win, 200), 1.25);
    await r.hold(450);
    const nota = p.getByText(/0,999/).filter({ visible: true }).first();
    if (await nota.count()) await r.point(nota, 1400);
    await r.shot("vencedor");
    await r.at(1);
    await r.unzoom();
    await r.click(p.getByRole("tab", { name: /Classificação/ }));
    await r.stable();
    const tbl = p.getByRole("table").first();
    await r.scrollTo(tbl, "start");
    await r.shot("classificacao");
  },

  S7: async (r, p) => {
    await r.click(p.getByRole("tab", { name: /Eliminados/ }));
    await r.stable();
    await r.shot("eliminados");
    await r.at(1);
    const miss = p.getByText("Excluídos por dados ausentes").filter({ visible: true }).first();
    if (await miss.count()) {
      await r.scrollTo(miss, "center");
      r.zoom(await r.cardBox(miss, 200), 1.25);
      await r.hold(450);
      await r.point(miss, 1500);
    } else r.issue("aba Eliminados: não achei a linha do material sem dado");
    await r.shot("eliminados2");
  },

  S8: async (r, p) => {
    await r.unzoom();
    await r.click(p.getByRole("tab", { name: /Sensibilidade/ }));
    await r.stable();
    const t = p.getByRole("table").first();
    await r.scrollTo(t, "center");
    r.zoom(await r.cardBox(t, 200), 1.2);
    await r.hold(450);
    await r.expect(t, /CFRP \(Fibras de Carbono Contínuas\)/, "sensibilidade estável");
    await r.shot("sensibilidade");
    await r.at(1);
    await r.unzoom();
    await r.click(p.getByRole("tab", { name: /Origem dos dados/ }));
    await r.stable();
    const h = p.getByText("Proveniência do resultado").filter({ visible: true }).first();
    await r.scrollTo(h, "start");
    r.zoom(await r.cardBox(h, 300), 1.2);
    await r.hold(450);
    await r.shot("origem");
  },

  // ------------------------------------------------------------ 3. Mapas
  P1: async (r, p) => {
    await r.unzoom();
    await r.goto("/app/mapas");
    // The map draws long after the page settles: wait with the clock stopped.
    await r.off(async () => {
      await p.locator(".js-plotly-plot .main-svg").first().waitFor({ timeout: 600000 });
      await p.waitForFunction(() => { const g = document.querySelector(".js-plotly-plot"); return g && g.data && g.data.length > 3; }, null, { timeout: 600000 });
    });
    const plot = p.locator(".js-plotly-plot").first();
    await r.mark("plot", plot);
    const bg = p.locator(".js-plotly-plot .bglayer rect, .js-plotly-plot .nsewdrag").first();
    if (await bg.count()) await r.mark("plotarea", bg);
    await r.shot("mapa");
    await r.at(1);
    r.zoom(await plot.boundingBox(), 1.15);
    await r.hold(450);
    await r.at(2);
    const plotted = p.getByText(/materiais plotados/).filter({ visible: true }).first();
    await r.expect(plotted, /673 de 678 materiais plotados/, "materiais plotados");
    r.zoom(await r.cardBox(plotted, 60), 1.3);
    await r.hold(450);
    await r.at(3);
    await r.unzoom();
    const fora = p.getByRole("heading", { name: "Materiais fora do mapa" });
    await r.scrollTo(fora, "center");
    r.zoom(await r.cardBox(fora, 260), 1.25);
    await r.hold(450);
    await r.expect(r.page.locator("main"), /Materiais fora do mapa/, "lista fora do mapa");
    await r.shot("fora");
  },

  P2: async (r, p) => {
    await r.unzoom({ instant: true });
    await r.jumpTop();
    const pers = p.getByText("Personalizar o mapa").filter({ visible: true }).first();
    await r.scrollTo(pers, "center");
    await r.click(pers);
    await r.stable();
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

  // ------------------------------------------------------------ 4. Dados confiáveis
  D1: async (r, p) => {
    await r.unzoom({ instant: true });
    await r.goto("/app/catalogo");
    const n = p.getByText(/678 materiais/).filter({ visible: true }).first();
    await r.expect(n, /678 materiais/, "catálogo 678");
    await r.zoomOn(n, 1.25);
    await r.point(n, 1500);
    await r.shot("catalogo");
  },

  D2: async (r, p) => {
    await r.unzoom();
    await r.paste(p.getByLabel("Buscar materiais"), "Infiltração de Fundido");
    await r.stable();
    await r.click(p.getByRole("link", { name: /Infiltração de Fundido/ }).filter({ visible: true }).first());
    await r.stable();
    await r.shot("ficha");
    const val = p.getByRole("button", { name: "Ver a proveniência deste valor" }).filter({ visible: true }).first();
    await r.scrollTo(val, "center");
    await r.click(val);
    await r.stable();
    const pop = p.getByRole("dialog").filter({ visible: true }).first();
    if (await pop.count()) { r.zoom(await r.cardBox(pop, 200), 1.3); await r.hold(450); }
    else r.issue("D2: popover de proveniência não encontrado");
    await r.shot("proveniencia");
    await r.at(1);
    await r.unzoom();
    await p.keyboard.press("Escape");
    await r.point(p.getByText("Estimado", { exact: true }).filter({ visible: true }).first(), 1400);
    await r.at(2);
    const aus = p.getByText("Ausente", { exact: true }).filter({ visible: true }).first();
    if (await aus.count()) {
      await r.scrollTo(aus, "center");
      r.zoom(await r.cardBox(aus, 50), 1.25);
      await r.hold(450);
      await r.point(aus, 1800);
    } else r.issue("D2: nenhuma propriedade 'Ausente' na ficha");
    await r.shot("ausente");
  },

  D3: async (r, p) => {
    await r.unzoom();
    await r.goto("/app/importar");
    const drop = p.getByText("Arraste o arquivo para cá ou clique para escolher").filter({ visible: true }).first();
    await r.point(drop, 900);
    await r.at(1);
    const file = require("path").resolve(__dirname, "../dados/materiais-ficticios-video.csv");
    if (r.fast) await p.getByLabel("Selecione um arquivo CSV ou XLSX (até 5 MB).").setInputFiles(file);
    else {
      const [fc] = await Promise.all([p.waitForEvent("filechooser"), r.click(drop)]);
      await fc.setFiles(file);
    }
    r.pause();
    await p.getByRole("heading", { name: "Mapeie as colunas" }).waitFor({ timeout: 600000 });
    await r.stable();
    await r.at(2);
    const map = p.getByRole("heading", { name: "Mapeie as colunas" });
    await r.scrollTo(map, "start");
    const unit = p.getByLabel("Unidade da coluna densidade [g/cm3]");
    r.zoom(await r.cardBox(unit, 300), 1.2);
    await r.hold(450);
    await r.point(unit, 1200);
    await r.select(p.getByLabel("Classe padrão (quando a coluna estiver vazia)"), "Compósitos");
    await r.shot("mapa_colunas");
    await r.at(3);
    await r.unzoom();
    await r.click(p.getByRole("button", { name: "Validar", exact: true }));
    r.pause();
    await p.getByRole("heading", { name: "Relatório de validação" }).waitFor({ timeout: 600000 });
    await r.stable();
    const rep = p.getByRole("heading", { name: "Relatório de validação" });
    await r.scrollTo(rep, "start");
    r.zoom(await r.cardBox(rep, 260), 1.2);
    await r.hold(450);
    await r.expect(mainArea(p), /Importar linhas válidas\s*\(\s*3\s*\)|\b3\s*Total/, "três linhas no relatório");
    await r.shot("relatorio");
    await r.unzoom();
    await r.click(p.getByRole("button", { name: /Importar linhas válidas/ }));
    r.pause();
    await p.getByText("Importação concluída").filter({ visible: true }).first().waitFor({ timeout: 600000 });
    await r.stable();
    r.confirm();
    await r.at(4);
    // Dry cut from "Importação concluída" straight to material B's sheet.
    await r.off(async () => {
      await p.goto(BASE_URL + "/app/catalogo", { waitUntil: "domcontentloaded" });
      await p.getByLabel("Buscar materiais").waitFor({ timeout: 600000 });
      await p.getByLabel("Buscar materiais").fill("Material Fictício B");
      await p.getByRole("link", { name: /Material Fictício B/ }).filter({ visible: true }).first().click();
      await p.getByText(/^Resistência à tração/).filter({ visible: true }).first().waitFor({ timeout: 600000 });
    });
    const row = p.getByText(/^Resistência à tração/).filter({ visible: true }).first();
    await r.scrollTo(row, "center");
    r.zoom(await r.cardBox(row, 60), 1.3);
    await r.hold(450);
    await r.expect(row.locator("xpath=ancestor::*[self::tr or self::div][1]"), /Ausente/, "B sem resistência à tração");
    await r.point(row, 1600);
    await r.shot("ausente");
  },

  // ------------------------------------------------------------ 5. Dimensionar
  Z1: async (r, p) => {
    await r.unzoom({ instant: true });
    await r.goto("/app/dimensionar");
    const L = p.getByLabel("Comprimento (m)");
    const S = p.getByLabel("Rigidez exigida (N/m)");
    await r.scrollTo(L, "center");
    r.zoom(await r.cardBox(L, 260), 1.25);
    await r.hold(450);
    await r.at(1);
    await r.type(L, "0.5");
    await r.type(S, "20000000");
    await r.mark("rigidez", S);
    await r.click(p.getByRole("button", { name: "Dimensionar", exact: true }));
    r.pause();
    await p.getByRole("table").filter({ visible: true }).first().waitFor({ timeout: 600000 });
    await r.stable();
    await r.resume();
    r.confirm();
    await r.at(2);
    await r.unzoom({ instant: true });
    // Dry cut: rows 1-4 at the bottom of the window; the 5th row (the tasks example's
    // winner) stays below the edge.
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
    await r.at(3);
    await r.shot("tirante");
  },

  Z2: async (r, p) => {
    await r.unzoom({ instant: true });
    await r.off(async () => { await p.evaluate(() => window.scrollTo(0, 0)); });
    await r.select(p.getByLabel("Caso"), "Placa em flexão, rigidez especificada");
    await r.stable();
    const L = p.getByLabel("Comprimento (m)");
    r.zoom(await r.cardBox(L, 260), 1.2);
    await r.hold(450);
    await r.type(L, "0.4");
    await r.type(p.getByLabel("Largura da placa (m)"), "0.3");
    await r.off(async () => {
      await p.getByLabel("Rigidez exigida (N/m)").fill("5000");
      const sup = p.locator("select", { has: p.locator("option", { hasText: "Biapoiada, carga no meio do vão" }) });
      if (await sup.count()) await sup.first().selectOption({ label: "Biapoiada, carga no meio do vão" });
      else await p.getByLabel(/Constante de apoio/).fill("48");
    });
    await r.click(p.getByRole("button", { name: "Dimensionar", exact: true }));
    r.pause();
    await p.getByRole("table").filter({ visible: true }).first().waitFor({ timeout: 600000 });
    await r.stable();
    await r.resume();
    r.confirm();
    await r.at(1);
    await r.unzoom({ instant: true });
    const t = p.getByRole("table").filter({ visible: true }).first();
    await r.off(async () => { await placeTop(p, t, 260); });
    const r3 = await t.locator("tbody tr").nth(2).boundingBox();
    const tb = await t.boundingBox();
    const top = tb.y - 20, h = Math.max(420, r3.y + r3.height + 20 - top), w = (h * 16) / 9;
    if (!r.fast) r.crop({ x: Math.max(0, Math.min(1920 - w, tb.x + tb.width / 2 - w / 2)), y: Math.max(0, top), width: w, height: Math.min(1080, h) });
    await r.hold(450);
    await r.point(t.locator("tbody tr").nth(0), 1500);
    await r.shot("placa");
  },

  // ------------------------------------------------------------ 6. Demais recursos
  R1: async (r, p) => {
    await r.unzoom({ instant: true });
    // The own record is created only now, so the earlier scenes count 678.
    const own = await p.request.post(API + "/materials", { data: {
      name: "Liga Exemplo do Participante (fictícia)", class_id: 1, is_own_record: true,
      description: "Registro próprio fictício, criado só para a demonstração em vídeo.",
      values: [
        { property_slug: "densidade", kind: "scalar", value: 2.75, unit: "g/cm**3" },
        { property_slug: "modulo_young", kind: "scalar", value: 71, unit: "GPa" },
      ] } });
    if (own.status() !== 201) r.issue(`R1: registro próprio não criado (${own.status()})`);
    await r.hold(300);
    await r.at(1, 0);
    await r.goto("/app/comparar");
    r.label("Comparar");
    await r.off(async () => {
      const add = p.getByRole("combobox", { name: "Buscar e adicionar material" }).filter({ visible: true }).first();
      for (const [q, full] of [
        ["Fibras de Carbono Cont", "CFRP (Fibras de Carbono Contínuas)"],
        ["Infiltração de Fundido", "CMC SiC/SiC por Infiltração de Fundido (MI)"],
        ["SiC/SiC por Infiltração Qu", "CMC SiC/SiC por Infiltração Química em Vapor (CVI)"],
      ]) {
        await add.fill(q);
        await p.getByRole("option", { name: full }).first().click();
        await r.stable(15000, { resume: false });
      }
      const radar = p.getByRole("button", { name: "Radar", exact: true }).or(p.getByRole("tab", { name: "Radar", exact: true })).first();
      if (await radar.count()) await radar.click();
    });
    await cropAbove(r, p);
    await r.shot("Comparar");
    const tour = [
      [2, null, "/app/processos", "Processos"],
      [3, null, "/app/painel", "Painel"],
      [4, null, "/app/cadernos", "Cadernos"],
      [5, null, "/app/custo", "Custo"],
      [5, "Eco", "/app/eco", "Eco"],
      [5, "Baterias", "/app/baterias", "Baterias"],
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
        const first = p.getByRole("link", { name: /^Calandragem/ }).first();
        if (await first.count()) await r.off(async () => { await first.click(); });
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
