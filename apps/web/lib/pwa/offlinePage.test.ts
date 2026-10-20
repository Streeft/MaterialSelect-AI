import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { OFFLINE_SHEETS_KEY, OFFLINE_SHEETS_VERSION, type OfflineSheet } from "@/lib/offlineSheets";

/**
 * The page `public/offline.html` shows without a connection (D-152): its inline
 * script is run here against the document and localStorage, as the browser would.
 */
const html = readFileSync(resolve(__dirname, "../../public/offline.html"), "utf8");
const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
const body = /<body>([\s\S]*?)<script>/.exec(html)![1]!;

function sheet(over: Partial<OfflineSheet> = {}): OfflineSheet {
  return {
    id: 7,
    name: "Aço Demo B",
    className: "Metais",
    subclass: "Aço estrutural",
    readAt: "2026-10-20T14:30:00.000Z",
    rows: [
      { group: "Propriedades físicas", name: "Densidade", symbol: "ρ", value: "7,85 g/cm³", quality: "Medido", source: "Ficha do fornecedor", condition: null, notes: null },
      { group: "Propriedades físicas", name: "Dureza", symbol: null, value: null, quality: "Ausente", source: null, condition: null, notes: null },
    ],
    ...over,
  };
}

function open(sheets: unknown) {
  window.localStorage.clear();
  if (sheets !== undefined) window.localStorage.setItem(OFFLINE_SHEETS_KEY, typeof sheets === "string" ? sheets : JSON.stringify({ v: OFFLINE_SHEETS_VERSION, sheets }));
  document.body.innerHTML = body;
  new Function(script)();
}
const text = () => document.body.textContent ?? "";
const click = (label: RegExp) => {
  const button = [...document.querySelectorAll("button")].find((b) => label.test(b.textContent ?? ""));
  expect(button, String(label)).toBeTruthy();
  button!.click();
};

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("offline page with sheets (D-152)", () => {
  it("says there is nothing to show when no sheet was ever read", () => {
    open(undefined);
    expect(text()).toContain("Nenhuma ficha de material foi aberta neste aparelho");
    expect(document.querySelectorAll("li")).toHaveLength(0);
  });

  it("treats corrupt or foreign data as nothing", () => {
    open("{not json");
    expect(document.querySelectorAll("li")).toHaveLength(0);
    open(JSON.stringify({ v: 99, sheets: [sheet()] }));
    expect(document.querySelectorAll("li")).toHaveLength(0);
  });

  it("lists the sheets read, each with the day it was read, under a notice that they may be out of date", () => {
    open([sheet(), sheet({ id: 8, name: "Ti-6Al-4V" })]);
    const items = [...document.querySelectorAll("li button")].map((b) => b.textContent);
    expect(items[0]).toContain("Aço Demo B");
    expect(items[0]).toContain("lida em");
    expect(items[1]).toContain("Ti-6Al-4V");
    expect(document.getElementById("notice-text")!.textContent).toContain("pode estar desatualizado");
  });

  it("opens a sheet with a fixed notice dated like the read, and the date beside every value", () => {
    open([sheet()]);
    click(/Aço Demo B/);
    const day = new Date("2026-10-20T14:30:00.000Z").toLocaleDateString("pt-BR");
    expect(document.getElementById("notice")!.textContent).toContain(`Dados lidos em ${day}`);
    expect(document.getElementById("notice")!.textContent).toContain("desatualizados");
    const cells = [...document.querySelectorAll("tbody tr")].map((tr) => tr.textContent ?? "");
    expect(cells[0]).toContain("Densidade (ρ)");
    expect(cells[0]).toContain("7,85 g/cm³");
    expect(cells[0]).toContain("Medido");
    expect(cells[0]).toContain("fonte: Ficha do fornecedor");
    expect(cells[0]).toContain(`lido em ${day}`);
  });

  it("writes absence out: 'Ausente', never a 0 or a dash, and no date for a value that is not there", () => {
    open([sheet()]);
    click(/Aço Demo B/);
    const missing = [...document.querySelectorAll("tbody tr")][1]!;
    expect(missing.textContent).toContain("Ausente");
    expect(missing.textContent).not.toMatch(/\b0\b|—|lido em/);
  });

  it("says when a value has no source rather than leaving it out", () => {
    const noSource = sheet();
    noSource.rows[0]!.source = null;
    open([noSource]);
    click(/Aço Demo B/);
    expect(text()).toContain("fonte não informada");
  });

  it("goes back to the list", () => {
    open([sheet()]);
    click(/Aço Demo B/);
    click(/Voltar à lista/);
    expect(document.querySelectorAll("li")).toHaveLength(1);
  });

  it("prints stored text as text: markup in a name is never parsed", () => {
    open([sheet({ name: '<img src=x onerror="window.__pwned=1">' })]);
    expect(document.querySelector("img")).toBeNull();
    expect(text()).toContain("<img src=x");
    click(/<img/);
    expect(document.querySelector("img")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
});
