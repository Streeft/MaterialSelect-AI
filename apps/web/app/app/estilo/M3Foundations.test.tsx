import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { M3Foundations } from "./M3Foundations";

describe("M3Foundations specimen", () => {
  it("shows the five groups", () => {
    render(<M3Foundations />);
    for (const t of [/Papéis de cor/, "Forma", /Elevação/, /Tipografia/, /Camadas de estado/]) {
      expect(screen.getByRole("heading", { name: t })).toBeInTheDocument();
    }
    expect(screen.getByText(/display-large/)).toBeInTheDocument();
    expect(screen.getByText(/label-small/)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    render(<M3Foundations />);
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
