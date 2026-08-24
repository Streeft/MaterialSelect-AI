import { renderToString } from "react-dom/server";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { MdFilledButton } from "./elements";

describe("MdFilledButton (createComponent wrapper)", () => {
  it("renders to a string without touching customElements (SSR safety)", () => {
    // A crash here would mean the "use client" boundary isn't enough on its
    // own and a real SSR guard (e.g. next/dynamic) is needed for this
    // element — the thing Stage 0 exists to find out before it's repeated
    // across every primitive.
    expect(() => renderToString(<MdFilledButton>Rótulo</MdFilledButton>)).not.toThrow();
  });

  it("fires the onClick prop when clicked, via a plain native click event", async () => {
    const user = userEvent.setup();
    let clicks = 0;

    render(<MdFilledButton onClick={() => (clicks += 1)}>Rótulo</MdFilledButton>);

    const button = screen.getByText("Rótulo");
    await user.click(button);

    expect(clicks).toBe(1);
  });
});
