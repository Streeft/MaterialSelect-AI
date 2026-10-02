import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HighlightText, extractHighlightTerms } from "./HighlightText";

describe("extractHighlightTerms", () => {
  it("extracts bare words while ignoring operators and wildcards", () => {
    expect(extractHighlightTerms("aco AND inox")).toEqual(["aco", "inox"]);
    expect(extractHighlightTerms("aco OR aluminio")).toEqual(["aco", "aluminio"]);
    expect(extractHighlightTerms("aco NOT plastico")).toEqual(["aco", "plastico"]);
    expect(extractHighlightTerms('alum* AND "aco inox"')).toEqual(["alum", "aco", "inox"]);
    expect(extractHighlightTerms("(ferro OR cobre)?")).toEqual(["ferro", "cobre"]);
  });

  it("returns empty array for empty or whitespace-only queries", () => {
    expect(extractHighlightTerms("")).toEqual([]);
    expect(extractHighlightTerms("   ")).toEqual([]);
    expect(extractHighlightTerms(undefined)).toEqual([]);
  });
});

describe("HighlightText", () => {
  it("renders text normally when no query is given", () => {
    render(<HighlightText text="Aço inoxidável austenítico 304" />);
    expect(screen.getByText("Aço inoxidável austenítico 304")).toBeInTheDocument();
  });

  it("highlights matched terms with mark element", () => {
    const { container } = render(
      <HighlightText text="Aço inoxidável austenítico 304" query="inox" />,
    );
    const mark = container.querySelector("mark");
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe("inox");
  });

  it("highlights multiple terms case-insensitively while preserving original text case", () => {
    const { container } = render(
      <HighlightText text="Aço Inox 316L com Titânio" query="aço AND titânio" />,
    );
    const marks = container.querySelectorAll("mark");
    expect(marks).toHaveLength(2);
    expect(marks[0]?.textContent).toBe("Aço");
    expect(marks[1]?.textContent).toBe("Titânio");
  });
});
