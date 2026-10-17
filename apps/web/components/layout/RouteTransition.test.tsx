import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

let pathname = "/app/mapas";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const { RouteTransition } = await import("./RouteTransition");

function Counter() {
  const [n, setN] = useState(0);
  return <button onClick={() => setN(n + 1)}>cliques: {n}</button>;
}

describe("RouteTransition (D-141)", () => {
  it("wraps the screen in the fade class", () => {
    pathname = "/app/mapas";
    const { container } = render(<RouteTransition><p>tela</p></RouteTransition>);
    expect(container.firstElementChild).toHaveClass("m3-route-enter");
    expect(screen.getByText("tela")).toBeInTheDocument();
  });

  it("a new path is a new screen: the subtree is rebuilt", async () => {
    pathname = "/app/mapas";
    const user = userEvent.setup();
    const { rerender } = render(<RouteTransition><Counter /></RouteTransition>);
    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toHaveTextContent("cliques: 1");

    pathname = "/app/painel";
    rerender(<RouteTransition><Counter /></RouteTransition>);
    expect(screen.getByRole("button")).toHaveTextContent("cliques: 0");
  });

  it("the same path keeps the screen (a query-string change is not a new screen)", async () => {
    pathname = "/app/selecao";
    const user = userEvent.setup();
    const { rerender } = render(<RouteTransition><Counter /></RouteTransition>);
    await user.click(screen.getByRole("button"));
    rerender(<RouteTransition><Counter /></RouteTransition>);
    expect(screen.getByRole("button")).toHaveTextContent("cliques: 1");
  });

  it("animates opacity only and switches off under reduced motion", () => {
    const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");
    const keyframes = /@keyframes m3-route-enter \{[\s\S]*?\n\}\n/.exec(css)![0];
    expect(keyframes).not.toMatch(/transform/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.m3-route-enter \{\s*animation: none;/);
  });
});
