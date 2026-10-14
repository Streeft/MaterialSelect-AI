import { afterEach, describe, expect, it, vi } from "vitest";
import { copyText, toTsv, tsvCell } from "./clipboard";

describe("tsvCell", () => {
  it("flattens tabs and line breaks, which would shift the columns", () => {
    expect(tsvCell("a\tb\nc\r\nd")).toBe("a b c d");
  });

  it("puts an apostrophe before anything a spreadsheet would read as a formula", () => {
    expect(tsvCell("=SOMA(A1:A2)")).toBe("'=SOMA(A1:A2)");
    expect(tsvCell("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(tsvCell("@SUM(1)")).toBe("'@SUM(1)");
    expect(tsvCell("-2+3")).toBe("'-2+3");
  });

  it("leaves a negative or signed number as a number", () => {
    expect(tsvCell("-12,5")).toBe("-12,5");
    expect(tsvCell("-3")).toBe("-3");
    expect(tsvCell("+4.2")).toBe("+4.2");
  });

  it("keeps ordinary text and the written word for absence", () => {
    expect(tsvCell("Aço inox 304")).toBe("Aço inox 304");
    expect(tsvCell("Ausente")).toBe("Ausente");
    expect(tsvCell("")).toBe("");
  });
});

describe("toTsv", () => {
  it("joins cells with tabs and lines with newlines, header first", () => {
    expect(
      toTsv(
        ["Nome", "Escore"],
        [
          ["Liga A", "0,912"],
          ["Liga B", "Ausente"],
        ],
      ),
    ).toBe("Nome\tEscore\nLiga A\t0,912\nLiga B\tAusente");
  });
});

describe("copyText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  });

  it("uses the async clipboard when there is one", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await expect(copyText("a\tb")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("a\tb");
  });

  it("reports false, and does not throw, when the browser refuses", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("negado")) },
      configurable: true,
    });
    document.execCommand = vi.fn().mockReturnValue(false);
    await expect(copyText("x")).resolves.toBe(false);
  });

  it("falls back to execCommand when there is no async clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(true);
    await expect(copyText("x")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });
});
