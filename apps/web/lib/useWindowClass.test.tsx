import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useWindowClass } from "./useWindowClass";

type Listener = () => void;
const original = window.matchMedia;
let width = 1024;
const listeners = new Set<Listener>();

function install() {
  window.matchMedia = (query: string): MediaQueryList => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      get matches() {
        return width >= min;
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: Listener) => listeners.add(fn),
      removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
}

afterEach(() => {
  window.matchMedia = original;
  listeners.clear();
});

describe("useWindowClass (D-182)", () => {
  it("lê a classe da janela e acompanha a mudança de largura", () => {
    width = 1024;
    install();
    const { result } = renderHook(() => useWindowClass());
    expect(result.current).toBe("expanded");

    act(() => {
      width = 390;
      listeners.forEach((fn) => fn());
    });
    expect(result.current).toBe("compact");

    act(() => {
      width = 1700;
      listeners.forEach((fn) => fn());
    });
    expect(result.current).toBe("extraLarge");
  });
});
