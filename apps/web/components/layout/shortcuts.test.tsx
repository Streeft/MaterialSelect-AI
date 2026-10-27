import { act, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "shadow-dom-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ptBR } from "@/lib/i18n";
import { SHORTCUTS, SHORTCUTS_STORAGE_KEY } from "@/lib/shortcuts";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { KeyboardShortcuts } = await import("./KeyboardShortcuts");
const t = ptBR.shortcuts;

beforeEach(() => {
  push.mockClear();
  window.localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("SHORTCUTS (D-169)", () => {
  it("uma letra por destino, e todos os destinos são telas do app", () => {
    const keys = SHORTCUTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.href.startsWith("/app")).toBe(true);
      expect(ptBR.nav[shortcut.label]).toBeTruthy();
    }
  });
});

describe("KeyboardShortcuts (D-169)", () => {
  it("g e depois uma letra vai para a tela", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);

    await user.keyboard("gm");
    expect(push).toHaveBeenCalledWith("/app/mapas");
  });

  it("uma letra sozinha, ou uma letra sem destino, não navega", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);

    await user.keyboard("m");
    await user.keyboard("gz");
    expect(push).not.toHaveBeenCalled();
  });

  it("depois de um tempo o g esquece, e o par não fecha", async () => {
    vi.useFakeTimers();
    render(<KeyboardShortcuts />);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "g" }));
      vi.advanceTimersByTime(2000);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "m" }));
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("não age enquanto se digita num campo, nem com Ctrl", async () => {
    const user = userEvent.setup();
    render(
      <>
        <input aria-label="campo" />
        <KeyboardShortcuts />
      </>,
    );

    await user.click(screen.getByLabelText("campo"));
    await user.keyboard("gm");
    expect(push).not.toHaveBeenCalled();

    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Control>}g{/Control}m");
    expect(push).not.toHaveBeenCalled();
  });

  it("? abre a lista com todos os atalhos", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);

    await user.keyboard("?");
    expect(await screen.findByRole("dialog", { name: t.title })).toBeInTheDocument();
    for (const shortcut of SHORTCUTS) {
      expect(screen.getAllByShadowText(ptBR.nav[shortcut.label]).length).toBeGreaterThan(0);
    }
  });

  it("desligar na lista grava a escolha e para o g; a lista continua abrindo", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);

    await user.keyboard("?");
    await user.click(await screen.findByRole("checkbox", { name: new RegExp(t.enable) }));
    expect(window.localStorage.getItem(SHORTCUTS_STORAGE_KEY)).toBe("off");

    await user.keyboard("{Escape}");
    await user.keyboard("gm");
    expect(push).not.toHaveBeenCalled();

    await user.keyboard("?");
    expect(await screen.findByRole("dialog", { name: t.title })).toBeInTheDocument();
  });

  it("a lista não tem violação de acessibilidade", async () => {
    const user = userEvent.setup();
    render(<KeyboardShortcuts />);
    await user.keyboard("?");
    await screen.findByRole("dialog", { name: t.title });

    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
