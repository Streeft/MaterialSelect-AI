import { describe, expect, it } from "vitest";
import { tableToCsv } from "./figureCsv";

function table(html: string): HTMLTableElement {
  const host = document.createElement("div");
  host.innerHTML = `<table>${html}</table>`;
  return host.querySelector("table")!;
}

describe("tableToCsv", () => {
  it("writes the visible text, with ';' and the decimal comma untouched", () => {
    const csv = tableToCsv(
      table("<tr><th>Classe</th><th>Mediana</th></tr><tr><th>Metais</th><td>2,7</td></tr>"),
    );
    expect(csv).toBe("Classe;Mediana\r\nMetais;2,7");
  });

  it("keeps a written absence as text, never as 0", () => {
    const csv = tableToCsv(table("<tr><th>A</th><td>Ausente</td></tr>"));
    expect(csv).toBe("A;Ausente");
  });

  it("quotes cells with separators and quotes, and defuses formulas", () => {
    const csv = tableToCsv(table('<tr><td>a;b</td><td>"x"</td><td>=1+1</td></tr>'));
    expect(csv).toBe(`"a;b";"""x""";'=1+1`);
  });
});
