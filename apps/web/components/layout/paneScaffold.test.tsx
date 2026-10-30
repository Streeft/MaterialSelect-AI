import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { PaneScaffold } from "./PaneScaffold";

describe("PaneScaffold (D-182)", () => {
  it("lista e detalhe: duas regiões nomeadas, e o foco diz qual aparece sozinha", () => {
    const { container } = render(
      <PaneScaffold
        layout="list-detail"
        focus="secondary"
        primaryLabel="Materiais"
        secondaryLabel="Ficha"
        primary={<p>lista</p>}
        secondary={<p>ficha</p>}
      />,
    );
    expect(screen.getByRole("region", { name: "Materiais" })).toHaveTextContent("lista");
    expect(screen.getByRole("region", { name: "Ficha" })).toHaveTextContent("ficha");
    const grid = container.querySelector(".m3-scaffold-grid")!;
    expect(grid).toHaveAttribute("data-layout", "list-detail");
    expect(grid).toHaveAttribute("data-focus", "secondary");
    // The container query measures this element, not the window.
    expect(container.firstElementChild).toHaveClass("m3-scaffold");
  });

  it("painel de apoio: o secundário é um complementary", () => {
    render(
      <PaneScaffold
        layout="supporting-pane"
        primaryLabel="Assistente"
        secondaryLabel="Funil"
        primary={<p>etapas</p>}
        secondary={<p>funil</p>}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Funil" })).toHaveTextContent("funil");
  });

  it("monta os dois painéis sempre, para o estado de um não se perder ao trocar", () => {
    render(
      <PaneScaffold
        layout="list-detail"
        primaryLabel="Lista"
        secondaryLabel="Detalhe"
        primary={<input aria-label="filtro" defaultValue="aço" />}
        secondary={<p>ficha</p>}
      />,
    );
    expect(screen.getByLabelText("filtro")).toHaveValue("aço");
    expect(screen.getByText("ficha")).toBeInTheDocument();
  });

  it("não tem violação de acessibilidade", async () => {
    const { container } = render(
      <main>
        <PaneScaffold
          layout="supporting-pane"
          primaryLabel="Principal"
          secondaryLabel="Apoio"
          primary={<h1>Título</h1>}
          secondary={<p>apoio</p>}
        />
      </main>,
    );
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
