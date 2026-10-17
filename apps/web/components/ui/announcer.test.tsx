import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { AnnouncerProvider, useAnnounce } from "./Announcer";
import { findA11yViolations } from "@/lib/testing/axe";

function Button({ text }: { text: string }) {
  const announce = useAnnounce();
  return (
    <button type="button" onClick={() => announce(text)}>
      falar
    </button>
  );
}

describe("AnnouncerProvider", () => {
  it("keeps one empty polite region mounted before anything is said", () => {
    render(
      <AnnouncerProvider>
        <Button text="Oi" />
      </AnnouncerProvider>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("");
  });

  it("speaks the message, and the same message twice is still a change", () => {
    render(
      <AnnouncerProvider>
        <Button text="Classificação pronta: 3 candidatos." />
      </AnnouncerProvider>,
    );
    const region = screen.getByRole("status");
    act(() => screen.getByRole("button").click());
    const first = region.textContent;
    expect(first).toBe("Classificação pronta: 3 candidatos.");
    act(() => screen.getByRole("button").click());
    expect(region.textContent).not.toBe(first);
    expect(region.textContent?.trim()).toBe(first);
  });

  it("is a no-op outside the provider", () => {
    render(<Button text="Oi" />);
    expect(() => act(() => screen.getByRole("button").click())).not.toThrow();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <AnnouncerProvider>
        <Button text="Oi" />
      </AnnouncerProvider>,
    );
    expect(await findA11yViolations(container)).toEqual([]);
  });
});
