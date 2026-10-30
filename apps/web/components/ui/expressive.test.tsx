import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "shadow-dom-testing-library";
import { describe, expect, it, vi } from "vitest";
import { FabMenu, LoadingIndicator, MenuItem, SplitButton } from "@/components/ui";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";

const globals = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

describe("molas do M3 (D-183)", () => {
  it.each([
    ["expressive-fast-spatial", "cubic-bezier(0.42, 1.67, 0.21, 0.9)", "350ms"],
    ["expressive-default-spatial", "cubic-bezier(0.38, 1.21, 0.22, 1)", "500ms"],
    ["expressive-slow-spatial", "cubic-bezier(0.39, 1.29, 0.35, 0.98)", "650ms"],
    ["expressive-fast-effects", "cubic-bezier(0.31, 0.94, 0.34, 1)", "150ms"],
    ["expressive-default-effects", "cubic-bezier(0.34, 0.8, 0.34, 1)", "200ms"],
    ["standard-slow-spatial", "cubic-bezier(0.27, 1.06, 0.18, 1)", "750ms"],
  ])("%s tem a curva e a duração da página do M3", (name, curve, dur) => {
    expect(globals).toContain(`--m3-spring-${name}: ${curve};`);
    expect(globals).toContain(`--m3-spring-${name}-dur: ${dur};`);
  });

  it("o app usa o esquema expressivo (D-181)", () => {
    expect(globals).toContain("--motion-spatial: var(--m3-spring-expressive-default-spatial);");
    expect(globals).toContain("--motion-effects: var(--m3-spring-expressive-default-effects);");
  });

  it("movimento reduzido desliga as animações novas", () => {
    const reduced = globals.slice(globals.indexOf("/* D-183: M3 Expressive components."));
    expect(reduced).toMatch(/prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.m3-loading-shape, \.m3-fabmenu-item \{ animation: none; \}/);
  });
});

describe("SplitButton (D-183)", () => {
  it("o rótulo roda a ação sem abrir o menu; a seta abre o menu sem rodar a ação", async () => {
    const user = userEvent.setup();
    const run = vi.fn();
    const other = vi.fn();
    render(
      <SplitButton onClick={run} menuLabel="Mais opções de execução" menu={<MenuItem onSelect={other}>Executar sem AHP</MenuItem>}>
        Executar seleção
      </SplitButton>,
    );

    await user.click(screen.getByRole("button", { name: "Executar seleção" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    const trigger = screen.getByRole("button", { name: "Mais opções de execução" });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("menuitem", { name: "Executar sem AHP" }));
    expect(other).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("LoadingIndicator (D-183)", () => {
  it("é uma barra de progresso indeterminada com nome", () => {
    render(<LoadingIndicator label="Executando a seleção" />);
    const bar = screen.getByRole("progressbar", { name: "Executando a seleção" });
    expect(bar).toHaveAttribute("aria-busy", "true");
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });
});

describe("FabMenu (D-183)", () => {
  const actions = (spy: (label: string) => void) =>
    ["Estudo de seleção", "Material próprio", "Caderno"].map((label) => ({ label, onSelect: () => spy(label) }));

  it("abre, leva o foco à primeira ação e navega com as setas", async () => {
    const user = userEvent.setup();
    render(<FabMenu label="Novo" actions={actions(() => {})} />);
    const fab = screen.getByRole("button", { name: "Novo" });

    await user.click(fab);
    expect(fab).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("menuitem", { name: "Estudo de seleção" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Material próprio" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: "Caderno" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "Estudo de seleção" })).toHaveFocus();
  });

  it("Esc fecha e devolve o foco ao botão", async () => {
    const user = userEvent.setup();
    render(<FabMenu label="Novo" actions={actions(() => {})} />);
    const fab = screen.getByRole("button", { name: "Novo" });

    await user.click(fab);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(fab).toHaveFocus();
  });

  it("escolher uma ação fecha o menu e roda a ação", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<FabMenu label="Novo" actions={actions(spy)} />);

    await user.click(screen.getByRole("button", { name: "Novo" }));
    await user.click(screen.getByRole("menuitem", { name: "Caderno" }));
    expect(spy).toHaveBeenCalledWith("Caderno");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("clique fora fecha", async () => {
    const user = userEvent.setup();
    render(
      <>
        <p>fora</p>
        <FabMenu label="Novo" actions={actions(() => {})} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Novo" }));
    await user.click(screen.getByText("fora"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("aberto, não tem violação de acessibilidade", async () => {
    const user = userEvent.setup();
    const { container } = render(<FabMenu label="Novo" actions={actions(() => {})} />);
    await user.click(screen.getByRole("button", { name: "Novo" }));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
