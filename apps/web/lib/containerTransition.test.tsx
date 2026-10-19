import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  ORIGIN_MAX_AGE_MS,
  markContainerOrigin,
  setContainerOrigin,
  takeContainerOrigin,
} from "./containerTransition";
import { ContainerTransition } from "@/components/layout/ContainerTransition";

function Card({ marked = true }: { marked?: boolean }) {
  return (
    <div {...(marked ? { "data-container-origin": "" } : {})} data-testid="card">
      <a href="#x" onClick={(e) => { e.preventDefault(); markContainerOrigin(e); }}>abrir</a>
    </div>
  );
}

function stubRect(testid: string) {
  const card = screen.getByTestId(testid);
  card.getBoundingClientRect = () =>
    ({ top: 40, left: 20, width: 300, height: 120, right: 320, bottom: 160, x: 20, y: 40, toJSON() {} }) as DOMRect;
}

afterEach(() => {
  setContainerOrigin(null);
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("origem do contêiner (D-148)", () => {
  it("a plain click on a marked card leaves its rectangle, once", () => {
    render(<Card />);
    stubRect("card");
    fireEvent.click(screen.getByText("abrir"));
    const origin = takeContainerOrigin();
    expect(origin).toMatchObject({ top: 40, left: 20, width: 300, height: 120 });
    expect(takeContainerOrigin()).toBeNull();
  });

  it.each([
    ["ctrl", { ctrlKey: true }],
    ["cmd", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["middle button", { button: 1 }],
  ])("ignores a %s click, which does not navigate in place", (_n, init) => {
    render(<Card />);
    stubRect("card");
    fireEvent.click(screen.getByText("abrir"), init);
    expect(takeContainerOrigin()).toBeNull();
  });

  it("ignores a link that is not inside a marked card", () => {
    render(<Card marked={false} />);
    stubRect("card");
    fireEvent.click(screen.getByText("abrir"));
    expect(takeContainerOrigin()).toBeNull();
  });

  it("drops an origin older than the window", () => {
    setContainerOrigin({ top: 0, left: 0, width: 10, height: 10, radius: "0px", at: 1000 });
    expect(takeContainerOrigin(1000 + ORIGIN_MAX_AGE_MS + 1)).toBeNull();
  });
});

describe("ContainerTransition (D-148)", () => {
  function withMain() {
    const main = document.createElement("main");
    main.id = "conteudo";
    main.getBoundingClientRect = () =>
      ({ top: 60, left: 240, width: 1000, height: 700, right: 1240, bottom: 760, x: 240, y: 60, toJSON() {} }) as DOMRect;
    document.body.appendChild(main);
  }
  const origin = { top: 40, left: 20, width: 300, height: 120, radius: "16px", at: Date.now() };

  function stubAnimate() {
    const animation = { onfinish: null as null | (() => void), oncancel: null as null | (() => void), cancel: vi.fn() };
    const animate = vi.fn(() => animation);
    // jsdom has no Web Animations API; the component feature-detects it on `document.body`
    // and calls it on the surface it creates, so both resolve to the same stub.
    (Element.prototype as unknown as { animate: unknown }).animate = animate;
    return { animate, animation };
  }

  afterEach(() => {
    delete (Element.prototype as unknown as { animate?: unknown }).animate;
  });

  it("grows a surface from the card to the content area, then removes it", () => {
    withMain();
    const { animate, animation } = stubAnimate();
    setContainerOrigin(origin);
    render(<ContainerTransition />);
    expect(animate).toHaveBeenCalledTimes(1);
    const frames = (animate.mock.calls[0] as unknown as [Array<Record<string, string | number>>])[0];
    expect(frames[0]).toMatchObject({ top: "40px", left: "20px", width: "300px", height: "120px", borderRadius: "16px" });
    expect(frames[1]).toMatchObject({ top: "60px", left: "240px", width: "1000px", height: "700px" });
    expect(frames[2]).toMatchObject({ opacity: 0 });
    const surface = document.querySelector("[data-container-transform]")!;
    expect(surface).toHaveAttribute("aria-hidden", "true");
    expect((surface as HTMLElement).style.pointerEvents).toBe("none");
    animation.onfinish?.();
    expect(document.querySelector("[data-container-transform]")).toBeNull();
  });

  it("still draws the surface when React runs the effect twice (development StrictMode)", () => {
    withMain();
    const { animate } = stubAnimate();
    setContainerOrigin(origin);
    render(
      <StrictMode>
        <ContainerTransition />
      </StrictMode>,
    );
    expect(animate).toHaveBeenCalledTimes(2); // the first run is cancelled by the simulated unmount
    expect(document.querySelectorAll("[data-container-transform]")).toHaveLength(1);
  });

  it("does nothing when the screen was not opened from a card", () => {
    withMain();
    const { animate } = stubAnimate();
    render(<ContainerTransition />);
    expect(animate).not.toHaveBeenCalled();
    expect(document.querySelector("[data-container-transform]")).toBeNull();
  });

  it("does nothing under prefers-reduced-motion, and the origin is still consumed", () => {
    withMain();
    const { animate } = stubAnimate();
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    setContainerOrigin(origin);
    render(<ContainerTransition />);
    expect(animate).not.toHaveBeenCalled();
    expect(takeContainerOrigin()).toBeNull();
  });

  it("removes the surface if the screen unmounts mid-flight", () => {
    withMain();
    const { animation } = stubAnimate();
    setContainerOrigin(origin);
    const { unmount } = render(<ContainerTransition />);
    expect(document.querySelector("[data-container-transform]")).not.toBeNull();
    unmount();
    expect(animation.cancel).toHaveBeenCalled();
    expect(document.querySelector("[data-container-transform]")).toBeNull();
  });
});
