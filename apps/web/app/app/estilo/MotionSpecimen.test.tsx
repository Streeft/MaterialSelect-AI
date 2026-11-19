import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { APP_ICON_GESTURES } from "@/lib/design/iconGestures";
import { MotionSpecimen } from "./MotionSpecimen";

describe("MotionSpecimen (D-248)", () => {
  it("shows the durations, curves, springs, gestures and shapes", () => {
    render(<MotionSpecimen />);
    for (const name of ["Durações", "Curvas", "Molas", "Gestos dos ícones", "Forma que responde"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("extra-long4")).toBeInTheDocument();
    expect(screen.getByText("1.000 ms")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Espacial rápida/ })).toBeInTheDocument();
  });

  it("puts every icon of the app in the gallery, under its gesture", () => {
    render(<MotionSpecimen />);
    const tiles = document.querySelectorAll(".m3-gesture-tile");
    expect(tiles).toHaveLength(Object.keys(APP_ICON_GESTURES).length);
    const spin = screen.getByRole("region", { name: /Girar/ });
    expect(within(spin).getByRole("button", { name: "Gear" }).querySelector("svg")).toHaveAttribute("data-gesture", "spin");
  });

  it("has no axe violations", async () => {
    render(<MotionSpecimen />);
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
