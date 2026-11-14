import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { PlanView } from "./PlanView";
import { ConstraintOriginChip } from "./ConstraintOriginChip";
import { planText } from "@/lib/i18n-plan";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { makeComponent, makeConstraint, makePlan } from "@/lib/testing/planFixtures";
import type { PlanRunRequest, PlanRunResponse, ProjectPlan } from "@/lib/types";

const runPlan = vi.fn<(request: PlanRunRequest) => Promise<PlanRunResponse>>();
vi.mock("@/lib/api", () => ({ runPlan: (request: PlanRunRequest) => runPlan(request) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const t = planText;

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

/** The view with its plan held in state, as the home and the wizard hold it. */
function Host({ initial, onChange }: { initial: ProjectPlan; onChange?: (plan: ProjectPlan) => void }) {
  const [plan, setPlan] = useState(initial);
  return (
    <PlanView
      plan={plan}
      onPlanChange={(next) => {
        setPlan(next);
        onChange?.(next);
      }}
      renderActions={(component) => <button type="button">Abrir {component.name}</button>}
    />
  );
}

beforeEach(() => {
  runPlan.mockReset();
});

describe("ConstraintOriginChip (D-225)", () => {
  it("says the origin in words, with the scenario's name and the source in the tooltip", () => {
    render(
      <>
        <ConstraintOriginChip origin="usuario" />
        <ConstraintOriginChip origin="cenario:frio" scenarioName="Frio extremo" source="Tabela do projeto" />
        <ConstraintOriginChip origin="sugestao_ia" />
        <ConstraintOriginChip origin="indice" />
      </>,
    );
    expect(screen.getByText("Você")).toBeInTheDocument();
    const scenario = screen.getByText("Cenário: Frio extremo");
    expect(scenario.getAttribute("title")).toContain("Tabela do projeto");
    expect(screen.getByText("Sugestão da IA, revise")).toHaveClass("msds-badge-warning");
    expect(screen.getByText("Do índice")).toBeInTheDocument();
  });
});

describe("PlanView (D-225)", () => {
  it("shows the summary, premises, open questions, scenarios and one card per part", () => {
    render(wrap(<Host initial={makePlan()} />));
    expect(screen.getByText("Roupa de esqui em três camadas, para frio intenso.")).toBeInTheDocument();
    expect(screen.getByText(/Uso em temperaturas negativas/)).toBeInTheDocument();
    expect(screen.getByText(/Qual é a temperatura mais baixa esperada/)).toBeInTheDocument();
    expect(screen.getByText("Calor moderado")).toBeInTheDocument();
    for (const name of ["Camada externa", "Camada isolante", "Forro"]) {
      expect(screen.getByRole("article", { name })).toBeInTheDocument();
    }
  });

  it("marks each number with where it came from: you, a scenario, an AI suggestion", () => {
    render(wrap(<Host initial={makePlan({ components: [makeComponent()] })} />));
    const card = screen.getByRole("article", { name: "Camada externa" });
    expect(within(card).getByText("Você")).toBeInTheDocument();
    expect(within(card).getByText("Cenário: Calor moderado")).toBeInTheDocument();
    expect(within(card).getByText("Sugestão da IA, revise")).toBeInTheDocument();
    // The scenario's source is written next to the number, not only in a tooltip.
    expect(
      within(card).getByText(/Fonte: Referência didática do projeto/),
    ).toBeInTheDocument();
  });

  it("lists the server's materials with a link to each sheet and the reason", () => {
    render(wrap(<Host initial={makePlan({ components: [makeComponent()] })} />));
    const card = screen.getByRole("article", { name: "Camada externa" });
    const link = within(card).getByRole("link", { name: "Náilon 6,6" });
    expect(link).toHaveAttribute("href", "/app/materiais/11");
    expect(within(card).getByText(/Melhor no índice de leveza/)).toBeInTheDocument();
    expect(within(card).getAllByRole("listitem").length).toBeGreaterThan(3);
    expect(within(card).getByText(/42 de 668 materiais/)).toBeInTheDocument();
  });

  it("leaves an AI suggestion unchecked and asks before it counts", async () => {
    const user = userEvent.setup();
    const component = makeComponent();
    runPlan.mockImplementation(async (request) => {
      const confirmed = request.components[0]?.constraints?.[2]?.confirmed;
      return {
        components: [
          makeComponent({
            constraints: component.constraints.map((c, i) =>
              i === 2 ? { ...c, applied: confirmed === true } : c,
            ),
          }),
        ],
      };
    });
    const changed = vi.fn();
    render(wrap(<Host initial={makePlan({ components: [component] })} onChange={changed} />));

    const box = screen.getByRole("checkbox", { name: /Densidade ≤ 1\.500 kg\/m³/ });
    expect(box).not.toBeChecked();
    expect(screen.getByText(t.suggestionNotApplied)).toBeInTheDocument();

    await user.click(box);
    // Nothing ran: the confirmation is the next thing.
    expect(runPlan).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", { name: t.suggestionConfirmTitle });
    await user.click(within(dialog).getByRole("button", { name: t.suggestionConfirm }));

    await waitFor(() => expect(runPlan).toHaveBeenCalledTimes(1));
    const sent = runPlan.mock.calls[0]![0].components[0]!.constraints!;
    expect(sent.map((c) => [c.origin, c.confirmed])).toEqual([
      ["usuario", undefined],
      ["cenario:calor-moderado", undefined],
      ["sugestao_ia", true],
    ]);
    await waitFor(() => expect(changed).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /Densidade/ })).toBeChecked(),
    );
    expect(screen.getByText(t.suggestionApplied)).toBeInTheDocument();
  });

  it("does not run when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    render(wrap(<Host initial={makePlan({ components: [makeComponent()] })} />));
    await user.click(screen.getByRole("checkbox", { name: /Densidade/ }));
    const dialog = await screen.findByRole("dialog", { name: t.suggestionConfirmTitle });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(runPlan).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Densidade/ })).not.toBeChecked();
  });

  it("takes a confirmed suggestion back without asking, and re-runs", async () => {
    const user = userEvent.setup();
    const confirmed = makeComponent();
    confirmed.constraints = confirmed.constraints.map((c, i) => (i === 2 ? { ...c, applied: true } : c));
    runPlan.mockResolvedValue({ components: [makeComponent()] });
    render(wrap(<Host initial={makePlan({ components: [confirmed] })} />));
    const box = screen.getByRole("checkbox", { name: /Densidade/ });
    expect(box).toBeChecked();
    await user.click(box);
    await waitFor(() => expect(runPlan).toHaveBeenCalledTimes(1));
    expect(runPlan.mock.calls[0]![0].components[0]!.constraints![2]!.confirmed).toBe(false);
  });

  it("says why when the re-run fails, and shows when to try again on a 429", async () => {
    const user = userEvent.setup();
    const error = Object.assign(new Error("Muitas consultas à IA em pouco tempo. Tente de novo em 12 s."), {
      status: 429,
    });
    runPlan.mockRejectedValue(error);
    render(wrap(<Host initial={makePlan({ components: [makeComponent()] })} />));
    await user.click(screen.getByRole("checkbox", { name: /Densidade/ }));
    const dialog = await screen.findByRole("dialog", { name: t.suggestionConfirmTitle });
    await user.click(within(dialog).getByRole("button", { name: t.suggestionConfirm }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tente de novo em 12 s.");
  });

  it("warns plainly when the local rules answered because the AI did not", () => {
    render(
      wrap(
        <Host
          initial={makePlan({
            degraded: true,
            notice: "Proposta montada por regras locais porque a IA não respondeu.",
            components: [makeComponent()],
          })}
        />,
      ),
    );
    expect(screen.getByText(t.degradedTitle)).toBeInTheDocument();
    expect(
      screen.getByText("Proposta montada por regras locais porque a IA não respondeu."),
    ).toBeInTheDocument();
  });

  it("keeps the refused suggestions folded, with the reason", () => {
    render(
      wrap(
        <Host
          initial={makePlan({
            rejected: ["Densidade ≤ 0,1 kg/m³: fora da faixa do catálogo."],
            components: [makeComponent()],
          })}
        />,
      ),
    );
    const summary = screen.getByText(t.rejectedTitle(1));
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/fora da faixa do catálogo/)).toBeInTheDocument();
  });

  it("says honestly when no material passes, without inventing one", () => {
    const empty = makeComponent();
    empty.result = { ...empty.result!, final_count: 0, materials: [], message: "Nenhum material passou." };
    render(wrap(<Host initial={makePlan({ components: [empty] })} />));
    expect(screen.getByText(t.noMaterials)).toBeInTheDocument();
    expect(screen.getByText("Nenhum material passou.")).toBeInTheDocument();
  });

  it("shows a part with no number at all as a ranking, never as an empty card", () => {
    const part = makeComponent({
      index: null,
      constraints: [makeConstraint({ origin: "indice", source: "Derivado do índice", label: "Densidade definido" })],
      criteria: [
        { property: "densidade", property_name: "Densidade", direction: "min", origin: "ia" },
      ],
    });
    render(wrap(<Host initial={makePlan({ components: [part] })} />));
    expect(screen.getByText("Densidade: quanto menor, melhor")).toBeInTheDocument();
    expect(screen.getByText("Do índice")).toBeInTheDocument();
  });

  it("has no accessibility violations, with all three origins on screen", async () => {
    const { container } = render(wrap(<Host initial={makePlan({ cached: true, rejected: ["Uma recusa."] })} />));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
