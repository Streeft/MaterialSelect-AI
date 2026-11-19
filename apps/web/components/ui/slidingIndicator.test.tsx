import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { Tabs } from "./Tabs";

/**
 * D-248: the tab strip has one indicator that travels to the chosen tab. jsdom
 * has no layout, so each tab is given a box here: 100 px wide, side by side.
 */

const ITEMS = [
  { id: "a", label: "Tabela" },
  { id: "b", label: "Barras" },
  { id: "c", label: "Radar" },
] as const;

function Strip() {
  const [value, setValue] = useState<"a" | "b" | "c">("b");
  return (
    <Tabs label="Vistas" items={ITEMS} value={value} onChange={setValue}>
      <p>{value}</p>
    </Tabs>
  );
}

function box(left: number, width: number): DOMRect {
  return { left, top: 0, width, height: 40, right: left + width, bottom: 40, x: left, y: 0, toJSON: () => ({}) };
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.getAttribute("role") === "tablist") return box(0, 300);
    const index = ITEMS.findIndex((item) => this.id.endsWith(`-tab-${item.id}`));
    return index >= 0 ? box(index * 100, 100) : box(0, 0);
  });
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
    const visible = this.getAttribute("role") === "tab";
    return (visible ? [box(0, 1)] : []) as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40);
});

afterEach(() => vi.restoreAllMocks());

describe("the travelling tab indicator (D-248)", () => {
  it("stands under the chosen tab and marks it, then slides when another is chosen", async () => {
    const user = userEvent.setup();
    render(<Strip />);
    const list = screen.getByRole("tablist");
    expect(["ready", "on"]).toContain(list.dataset.ind);
    expect(list.style.getPropertyValue("--ind-l")).toBe("100px");
    expect(list.style.getPropertyValue("--ind-r")).toBe("100px");
    expect(screen.getByRole("tab", { name: "Barras" })).toHaveAttribute("data-ind-target");

    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(list.dataset.ind).toBe("on");

    await user.click(screen.getByRole("tab", { name: "Radar" }));
    expect(list.style.getPropertyValue("--ind-l")).toBe("200px");
    expect(list.style.getPropertyValue("--ind-r")).toBe("0px");
    expect(list.dataset.indDir).toBe("fwd");
    expect(screen.getByRole("tab", { name: "Radar" })).toHaveAttribute("data-ind-target");
    expect(screen.getByRole("tab", { name: "Barras" })).not.toHaveAttribute("data-ind-target");

    await user.click(screen.getByRole("tab", { name: "Tabela" }));
    expect(list.dataset.indDir).toBe("back");
    expect(list.style.getPropertyValue("--ind-l")).toBe("0px");
  });

  it("is decorative: the strip still passes axe with it inside", async () => {
    render(<Strip />);
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("stretches on the way: the leading edge takes the fast spring, the trailing one the slow", () => {
    const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
    const fwd = /\[data-ind="on"\]\[data-ind-dir="fwd"\] > \.m3-ind \{[^}]*\}/.exec(css)![0];
    expect(fwd).toContain("transition-property: left, top, right, bottom;");
    expect(fwd).toMatch(/transition-timing-function: var\(--motion-spatial-slow\), var\(--motion-spatial-slow\), var\(--motion-spatial-fast\), var\(--motion-spatial-fast\);/);
    const back = /\[data-ind="on"\]\[data-ind-dir="back"\] > \.m3-ind \{[^}]*\}/.exec(css)![0];
    expect(back).toMatch(/transition-timing-function: var\(--motion-spatial-fast\), var\(--motion-spatial-fast\), var\(--motion-spatial-slow\), var\(--motion-spatial-slow\);/);
  });
});
