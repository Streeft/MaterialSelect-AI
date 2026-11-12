import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { LoadCaseDiagram, loadCaseKind } from "./LoadCaseDiagram";

const t = ptBR.solver.diagram;

describe("LoadCaseDiagram (D-216)", () => {
  it("reads the geometry from the catalogue key, and nothing from a key it does not know", () => {
    expect(loadCaseKind("tirante-rigidez")).toBe("tie");
    expect(loadCaseKind("viga-circular-resistencia")).toBe("beam");
    expect(loadCaseKind("placa-rigidez")).toBe("plate");
    expect(loadCaseKind("coluna-circular-flambagem")).toBe("column");
    expect(loadCaseKind("eixo-torcao")).toBeNull();
    const { container } = render(<LoadCaseDiagram caseKey="eixo-torcao" />);
    // A wrong sketch is worse than none.
    expect(container).toBeEmptyDOMElement();
  });

  it("names the sketch for assistive technology, with the support when there is one", () => {
    render(<LoadCaseDiagram caseKey="viga-rigidez" supportKey="biengastada-central" supportLabel="Biengastada" />);
    expect(
      screen.getByRole("img", { name: t.aria(t.kinds.beam, "Biengastada") }),
    ).toHaveAttribute("data-diagram", "beam");
    expect(screen.getByText(t.caption)).toBeInTheDocument();
  });

  it("draws a different picture for each support of a beam (not one sketch for all)", () => {
    const drawings = ["engastada-livre", "biapoiada-central", "biengastada-central"].map((support) => {
      const { container, unmount } = render(<LoadCaseDiagram caseKey="viga-rigidez" supportKey={support} />);
      const markup = container.querySelector("svg")!.innerHTML;
      unmount();
      return markup;
    });
    expect(new Set(drawings).size).toBe(3);
  });

  it("draws the four geometries and passes axe", async () => {
    for (const key of ["tirante-rigidez", "viga-rigidez", "placa-rigidez", "coluna-flambagem"]) {
      const { container, unmount } = render(<LoadCaseDiagram caseKey={key} />);
      expect(container.querySelector("svg")).not.toBeNull();
      const violations = await findA11yViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
      unmount();
    }
  });
});
