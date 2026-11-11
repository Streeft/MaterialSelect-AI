import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";
import { useRipple } from "./msds";

/**
 * D-202: the ripple's 600 ms cleanup timer used to outlive its component. In a
 * test run that meant a setState firing after jsdom was torn down, which vitest
 * reports as an unhandled `window is not defined` and exits non-zero even with
 * every test green. The timer is now cleared on unmount.
 */

function Host() {
  const ripple = useRipple();
  return (
    <button type="button" onPointerDown={ripple.onPointerDown}>
      Tocar
      {ripple.layer}
    </button>
  );
}

afterEach(() => vi.useRealTimers());

describe("useRipple", () => {
  it("draws a ripple on press and removes it after 600 ms", () => {
    vi.useFakeTimers();
    const { container } = render(<Host />);
    fireEvent.pointerDown(container.querySelector("button")!);
    expect(container.querySelectorAll(".msds-ripple")).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(container.querySelectorAll(".msds-ripple")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the pending timers when the component unmounts", () => {
    vi.useFakeTimers();
    const { container, unmount } = render(<Host />);
    const button = container.querySelector("button")!;
    fireEvent.pointerDown(button);
    fireEvent.pointerDown(button);
    expect(vi.getTimerCount()).toBe(2);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
