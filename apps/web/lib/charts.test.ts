import { describe, expect, it } from "vitest";
import {
  axisLabels,
  chartFileName,
  escapeHover,
  toClosedRing,
  toXY,
  withAlpha,
} from "./charts";
import { classVisual } from "./design/palette";

describe("classVisual", () => {
  it("gives a class the same seat every time it is asked", () => {
    // A figure printed today and reprinted next week must not swap colours.
    expect(classVisual("metais")).toEqual(classVisual("metais"));
  });

  it("separates classes by shape and dash, not only by colour", () => {
    const metals = classVisual("metais");
    const polymers = classVisual("polimeros");
    expect(metals.color).not.toBe(polymers.color);
    expect(metals.symbol).not.toBe(polymers.symbol);
    expect(metals.dash).not.toBe(polymers.dash);
  });

  it("seats a class the catalogue invented later, without repainting the others", () => {
    const before = classVisual("metais");
    const novel = classVisual("liga-de-titanio-do-usuario");
    expect(novel.color).toBeTruthy();
    expect(novel.symbol).toBeTruthy();
    expect(classVisual("metais")).toEqual(before);
  });
});

describe("withAlpha", () => {
  it("converts a hex colour into rgba", () => {
    expect(withAlpha("#2563eb", 0.25)).toBe("rgba(37, 99, 235, 0.25)");
  });
});

describe("toXY", () => {
  it("splits coordinate pairs into parallel arrays", () => {
    expect(toXY([[1, 2], [3, 4]])).toEqual({ xs: [1, 3], ys: [2, 4] });
  });

  it("skips malformed pairs instead of emitting NaN", () => {
    expect(toXY([[1, 2], [3], []])).toEqual({ xs: [1], ys: [2] });
  });

  it("handles an empty polygon", () => {
    expect(toXY([])).toEqual({ xs: [], ys: [] });
  });
});

describe("toClosedRing", () => {
  it("repeats the first vertex so a polygon closes", () => {
    expect(toClosedRing([[0, 0], [1, 0], [1, 1]])).toEqual({
      xs: [0, 1, 1, 0],
      ys: [0, 0, 1, 0],
    });
  });

  it("leaves a degenerate envelope (point or segment) open", () => {
    expect(toClosedRing([[0, 0], [1, 1]])).toEqual({ xs: [0, 1], ys: [0, 1] });
    expect(toClosedRing([[2, 3]])).toEqual({ xs: [2], ys: [3] });
  });
});

describe("escapeHover", () => {
  it("neutralises markup coming from imported material names", () => {
    // Only the tag delimiters matter: without them Plotly's rich-text pass has
    // no element to interpret, so the text renders literally.
    expect(escapeHover('<b onclick="x">Aço</b>')).toBe(
      '&lt;b onclick="x"&gt;Aço&lt;/b&gt;',
    );
  });

  it("escapes ampersands before angle brackets, so entities are not doubled", () => {
    expect(escapeHover("A&B <C>")).toBe("A&amp;B &lt;C&gt;");
  });

  it("leaves ordinary names untouched", () => {
    expect(escapeHover("Liga Alumínio Demo A")).toBe("Liga Alumínio Demo A");
  });
});

describe("axisLabels", () => {
  it("uses the symbol when it is unambiguous", () => {
    expect(
      axisLabels([
        { symbol: "ρ", property_name: "Densidade" },
        { symbol: "E", property_name: "Módulo de Young" },
      ]),
    ).toEqual(["ρ", "E"]);
  });

  it("falls back to the full name when two properties share a symbol", () => {
    // Two identical categorical labels would merge into one Plotly column.
    expect(
      axisLabels([
        { symbol: "σ", property_name: "Limite de escoamento" },
        { symbol: "σ", property_name: "Resistência à tração" },
        { symbol: "ρ", property_name: "Densidade" },
      ]),
    ).toEqual(["Limite de escoamento", "Resistência à tração", "ρ"]);
  });

  it("uses the name when there is no symbol", () => {
    expect(axisLabels([{ symbol: null, property_name: "Custo por massa" }])).toEqual([
      "Custo por massa",
    ]);
  });

  it("always returns labels distinct enough to index a categorical axis", () => {
    const labels = axisLabels([
      { symbol: "σ", property_name: "Limite de escoamento" },
      { symbol: "σ", property_name: "Resistência à tração" },
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("chartFileName", () => {
  it("folds accents and collapses separators", () => {
    expect(chartFileName("mapa", "Módulo de Young", "Densidade")).toBe(
      "mapa-modulo-de-young-densidade",
    );
  });

  it("drops empty parts", () => {
    expect(chartFileName("mapa", null, undefined, "  ", "log")).toBe("mapa-log");
  });

  it("falls back to a generic name when nothing usable remains", () => {
    expect(chartFileName("···", null)).toBe("grafico");
  });

  it("never leaves leading or trailing hyphens", () => {
    const name = chartFileName("— Densidade —");
    expect(name).toBe("densidade");
  });
});
