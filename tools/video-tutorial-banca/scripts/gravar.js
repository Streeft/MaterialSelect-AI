// Screen recorder for the defense video. Drives the LOCAL app with Playwright and
// captures frames through CDP Page.startScreencast (no recordVideo: it stalls the
// Selection screen). A virtual clock only runs while the screen is in a stable state:
// waits on the server are paused and never reach the video (dry cut).
//
// Usage: node gravar.js --saida DIR --narracao DIR [--cenas 2.2,2.3] [--seco]
//   --cenas  record only these scenes; the others run fast, unrecorded, to build state
//   --seco   no frames; one screenshot per checkpoint, for debugging selectors
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = "http://127.0.0.1:3011";
const TOKEN = process.env.E2E_SESSION_TOKEN || "video-banca-local-session-0001";
const HERE = path.resolve(__dirname, "..");
const NARR_OFFSET = 0.5; // s of picture before the first word
const TAIL = 0.5; // s of picture after the last word
const FORBIDDEN = [
  /bicicleta/i,
  /Viga leve limitada por rigidez/,
  /Carregar exemplo/,
  /Viga leve e rígida em flexão/,
  /100\s?000\s?N\/m/,
];
// The bike example's winner: allowed in a long list, never focused. Logged, not fatal.
const WATCH = [/CFRP UD Alto Módulo \/ Epóxi/];

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = path.resolve(arg("--saida", path.join(HERE, "tmp/gravacao")));
const NARR = path.resolve(arg("--narracao", path.join(HERE, "tmp/narracao")));
const ONLY = arg("--cenas", "") ? arg("--cenas").split(",") : null;
const DRY = argv.includes("--seco");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

class Rec {
  constructor(page, cdp) {
    this.page = page;
    this.cdp = cdp;
    this.fast = true;
    this.recording = false;
    this.paused = false;
    this.vt = 0; // virtual ms accumulated while recording and not paused
    this.since = null;
    this.frameNo = 0;
    this.issues = [];
    cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
      cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      if (!this.recording || this.paused || DRY) return;
      const f = `f${String(++this.frameNo).padStart(6, "0")}.jpg`;
      fs.writeFileSync(path.join(this.dir, f), Buffer.from(data, "base64"));
      this.frames.push({ f, t: this.now() });
    });
  }
  now() { return (this.vt + (this.since !== null ? Date.now() - this.since : 0)) / 1000; }
  pause() { if (this.since !== null) { this.vt += Date.now() - this.since; this.since = null; } this.paused = true; }
  async resume() {
    this.paused = false;
    this.since = Date.now();
    await this.page.evaluate(() => window.__vc && window.__vc.nudge()).catch(() => {});
    await sleep(60);
  }

  async begin(cena, narr) {
    this.cena = cena;
    this.narr = narr;
    this.fast = DRY || (ONLY ? !ONLY.includes(cena.id) : false);
    if (this.fast) return;
    this.dir = path.join(OUT, cena.id);
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.frames = [];
    this.events = { clicks: [], confirms: [], zooms: [], labels: [] };
    this.vt = 0;
    this.recording = true;
    await this.stable();
    this.since = Date.now();
    this.paused = false;
    await this.page.evaluate(() => window.__vc.nudge());
    await this.scan("início");
  }
  async end() {
    if (this.fast) return;
    if (this.narr) await this.until(NARR_OFFSET + this.narr.duracao + TAIL);
    await this.until(this.now() + 0.3);
    await this.scan("fim");
    const dur = this.now();
    this.pause();
    this.recording = false;
    fs.writeFileSync(path.join(this.dir, "cena.json"), JSON.stringify({
      id: this.cena.id, duracao: dur, narr_offset: NARR_OFFSET, frames: this.frames,
      ...this.events, issues: this.issues.filter((i) => i.cena === this.cena.id),
    }, null, 1));
    console.log(`cena ${this.cena.id}: ${dur.toFixed(1)} s, ${this.frames.length} quadros`);
  }
  async until(t) { if (this.fast) return; while (this.now() < t) await sleep(20); }
  // Wait for sentence k of the scene's narration to start (+ a small lead).
  async at(k, lead = 0.1) {
    if (this.fast || !this.narr) return;
    const f = this.narr.frases[Math.min(k, this.narr.frases.length - 1)];
    await this.until(NARR_OFFSET + f.inicio + lead);
  }
  async hold(ms) { if (!this.fast) await sleep(ms); }

  // Stable = heading visible, no loading texts, no busy markers. Time spent here is cut.
  async stable(maxMs = 15000) {
    const wasRec = this.recording && !this.paused;
    if (wasRec) this.pause();
    const t0 = Date.now();
    await this.page.locator("h1").first().waitFor({ timeout: maxMs }).catch(() => {});
    for (;;) {
      const busy = await this.page.evaluate(() => {
        const t = document.body.innerText;
        return /Verificando sessão|Recalculando|Conferindo a soma dos pesos|Carregando|Calculando…/.test(t)
          || !!document.querySelector('[aria-busy="true"]');
      }).catch(() => true);
      if (!busy) break;
      if (Date.now() - t0 > maxMs) {
        this.issue("tela não estabilizou em " + maxMs / 1000 + " s");
        break;
      }
      await sleep(150);
    }
    await sleep(350);
    if (wasRec) await this.resume();
  }
  issue(msg) {
    const id = this.cena ? this.cena.id : "?";
    this.issues.push({ cena: id, msg });
    console.log(`  ! [${id}] ${msg}`);
  }
  async scan(where) {
    const zoom = this.curZoom;
    const text = await this.page.evaluate((r) => window.__vc.visibleText(r), zoom || null);
    for (const re of FORBIDDEN) if (re.test(text)) this.issue(`PROIBIDO na tela (${where}): ${re}`);
    for (const re of WATCH) if (re.test(text)) this.issue(`atenção (${where}): vencedor do exemplo da viga visível em lista: ${re}`);
    return text;
  }
  async shot(name) {
    if (!DRY) return;
    fs.mkdirSync(path.join(OUT, "_seco"), { recursive: true });
    await this.page.screenshot({ path: path.join(OUT, "_seco", `${this.cena.id}_${name}.png`) });
  }

  async goto(url) {
    if (this.recording && !this.paused) this.pause();
    await this.page.goto(BASE + url, { waitUntil: "domcontentloaded" });
    await this.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await this.stable();
    if (this.recording && !this.fast) await this.resume();
  }
  async box(loc) {
    await loc.waitFor({ state: "visible", timeout: 15000 });
    await loc.scrollIntoViewIfNeeded();
    return loc.boundingBox();
  }
  async scrollTo(loc, block = "center") {
    await loc.waitFor({ state: "visible", timeout: 15000 });
    if (this.fast) { await loc.scrollIntoViewIfNeeded(); return; }
    await loc.evaluate((el, b) => el.scrollIntoView({ behavior: "smooth", block: b }), block);
    await sleep(750);
  }
  async scrollBy(dy) {
    if (this.fast) { await this.page.mouse.wheel(0, dy); return; }
    await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
    await sleep(800);
  }
  async moveTo(loc, opts = {}) {
    const b = await this.box(loc);
    const x = b.x + Math.min(b.width / 2, opts.dx ?? b.width / 2);
    const y = b.y + b.height / 2;
    if (this.fast) { await this.page.evaluate(([a, c]) => window.__vc.setPos(a, c), [x, y]); return { x, y, b }; }
    const cur = await this.page.evaluate(() => {
      const c = document.getElementById("vc-cursor");
      return { x: parseFloat(c.style.left) || 960, y: parseFloat(c.style.top) || 540 };
    });
    const d = Math.hypot(x - cur.x, y - cur.y);
    const ms = Math.max(380, Math.min(950, 260 + d * 0.55));
    await this.page.evaluate(([a, c, m]) => window.__vc.move(a, c, m), [x, y, ms]);
    await this.page.mouse.move(x, y);
    return { x, y, b };
  }
  async point(loc, ms = 900) {
    if (this.fast) return;
    const { b } = await this.moveTo(loc);
    await this.page.evaluate((r) => window.__vc.ring(r), b);
    await sleep(ms);
    await this.page.evaluate(() => window.__vc.ring(null));
  }
  // Highlight, curved move, 300 ms wait, click.
  async click(loc, opts = {}) {
    if (this.fast) { await loc.click(opts); return; }
    const { b } = await this.moveTo(loc, opts);
    await this.page.evaluate((r) => window.__vc.ring(r), b);
    await sleep(500);
    await sleep(300);
    this.events.clicks.push(this.now());
    await this.page.evaluate(() => window.__vc.ripple());
    await loc.click(opts);
    await this.page.evaluate(() => window.__vc.ring(null));
    await sleep(200);
  }
  async type(loc, text) {
    await this.click(loc);
    if (this.fast) { await loc.fill(text); return; }
    for (const ch of text) {
      await this.page.keyboard.type(ch);
      await sleep(rand(40, 70));
    }
  }
  async select(loc, label) {
    if (!this.fast) await this.click(loc);
    await loc.selectOption({ label });
    if (!this.fast) await sleep(250);
  }
  // Box of the nearest ancestor at least minH tall (the card around a control).
  async cardBox(loc, minH = 110) {
    await loc.first().waitFor({ state: "visible", timeout: 15000 });
    return loc.first().evaluate((el, h) => {
      let e = el;
      while (e.parentElement && e.getBoundingClientRect().height < h) e = e.parentElement;
      const b = e.getBoundingClientRect();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    }, minH);
  }
  // Scroll so the given card's bottom sits at viewport y = target.
  async scrollToBottomY(loc, card, target) {
    const dy = card.y + card.height - target;
    if (this.fast) { await this.page.evaluate((d) => window.scrollBy(0, d), dy); return; }
    await this.page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
    await sleep(800);
  }
  async waitEnabled(loc, ms) {
    const wasRec = this.recording && !this.paused;
    if (wasRec) this.pause();
    const t0 = Date.now();
    while (await loc.isDisabled()) {
      if (Date.now() - t0 > ms) throw new Error(`botão desabilitado após ${ms / 1000} s: pare e avise o autor`);
      await sleep(150);
    }
    await this.stable();
    if (wasRec) await this.resume();
  }
  zoom(rect, scale = 1.25) {
    if (this.fast) return;
    const w = 1920 / scale, h = 1080 / scale;
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    const r = {
      x: Math.max(0, Math.min(1920 - w, cx - w / 2)),
      y: Math.max(0, Math.min(1080 - h, cy - h / 2)),
      width: w, height: h,
    };
    this.curZoom = r;
    this.events.zooms.push({ t: this.now(), ...r });
  }
  crop(r) {
    if (this.fast) return;
    this.curZoom = r;
    this.events.zooms.push({ t: this.now(), ...r });
  }
  async zoomOn(loc, scale = 1.25) { const b = await this.box(loc); this.zoom(b, scale); await this.hold(450); }
  async unzoom() { if (this.fast || !this.curZoom) return; this.curZoom = null; this.events.zooms.push({ t: this.now(), x: 0, y: 0, width: 1920, height: 1080 }); await this.hold(450); }
  confirm() { if (!this.fast) this.events.confirms.push(this.now()); }
  label(text) { if (!this.fast) this.events.labels.push({ t: this.now(), text }); }
  // Read a value from the screen and stop if it differs from what the narration says.
  async expect(loc, re, what) {
    const t = (await loc.innerText()).replace(/\s+/g, " ");
    if (!re.test(t)) {
      this.issue(`NÚMERO DIVERGENTE (${what}): tela="${t.slice(0, 160)}" esperado ${re}`);
      if (!this.fast) throw new Error("divergência de número: " + what);
    }
  }
}

// ---------------------------------------------------------------- scenes
const SCENES = require("./cenas_acoes.js");

(async () => {
  const spec = JSON.parse(fs.readFileSync(path.join(HERE, "cenas.json"), "utf8"));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: "pt-BR" });
  await ctx.addCookies([{ name: "msai_session", value: TOKEN, domain: "127.0.0.1", path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
  await ctx.addInitScript({ path: path.join(__dirname, "overlay.js") });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message.slice(0, 160)));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const r = new Rec(page, cdp);
  // Fresh state: the selection draft lives in localStorage (D-139).
  await page.goto(BASE + "/app");
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  // Local recording DB only: drop what earlier takes created, so names never collide.
  const API = "http://127.0.0.1:8811/api";
  for (const s of await (await page.request.get(API + "/selection/studies")).json()) {
    if (s.name === "Tirante leve e rígido a 200 °C") await page.request.delete(`${API}/selection/studies/${s.id}`);
  }
  for (const m of (await (await page.request.get(API + "/my-records")).json()).own_records || []) {
    await page.request.delete(`${API}/materials/${m.id}`);
  }
  for (const m of await (await page.request.get(API + "/materials?limit=2000")).json()) {
    if (/\(vídeo\)$/.test(m.name)) await page.request.delete(`${API}/materials/${m.id}`);
  }

  let failed = false;
  for (const cena of spec.cenas) {
    const act = SCENES[cena.id];
    if (!act) continue;
    const nf = path.join(NARR, `${cena.id}.json`);
    const narr = fs.existsSync(nf) ? JSON.parse(fs.readFileSync(nf, "utf8")) : null;
    try {
      await r.begin(cena, narr);
      await act(r, page);
      await r.end();
    } catch (e) {
      failed = true;
      console.log(`ERRO na cena ${cena.id}: ${e.message.split("\n")[0]}\n${(e.stack || "").split("\n").filter((l) => l.includes("scripts/")).join("\n")}`);
      await page.screenshot({ path: path.join(OUT, `erro_${cena.id}.png`) }).catch(() => {});
      r.recording = false;
      break;
    }
    if (ONLY && ONLY.every((id) => fs.existsSync(path.join(OUT, id, "cena.json")) || id === cena.id) && cena.id === ONLY[ONLY.length - 1]) break;
  }
  fs.writeFileSync(path.join(OUT, "problemas.json"), JSON.stringify(r.issues, null, 1));
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
