import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WeightsPreview } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { WeightBudget } from "./WeightBudget";

const t = ptBR.selection.weights;

const preview: WeightsPreview = {
  budget: {
    limit: 1,
    tolerance: 0.001,
    total: 0.8,
    remaining: 0.2,
    excess: 0,
    status: "incomplete",
    rows: [
      { position: 0, key: "densidade", weight: 0.6, share: 0.75, share_percent: 75, issue: null },
      { position: 1, key: "modulo_young", weight: 0.2, share: 0.25, share_percent: 25, issue: null },
      { position: 2, key: "custo", weight: null, share: null, share_percent: null, issue: "missing_weight" },
    ],
    suggestion: { kind: "fill_blanks", weights: [0.6, 0.2, 0.2] },
    can_run: false,
  },
  method: "weighted_sum",
  top: [
    { rank: 1, record_id: 7, name: "Alumínio 6061", class_name: "Metais", score: 0.912 },
    { rank: 2, record_id: 3, name: "CFRP", class_name: "Compósitos", score: 0.7 },
  ],
  initial_count: 75,
  candidate_count: 75,
  ranked_count: 60,
  constraints_applied: false,
  renormalized: true,
  unavailable_reason: null,
  unavailable_message: null,
};

const labels: Record<string, string> = {
  densidade: "Densidade",
  modulo_young: "Módulo de Young",
  custo: "Custo",
};

function renderBudget(onApply = vi.fn(), onUndo: (() => void) | null = null) {
  return render(
    <WeightBudget
      preview={preview}
      pending={false}
      failed={false}
      labelOf={(key) => (key ? (labels[key] ?? key) : "")}
      onApplySuggestion={onApply}
      onUndo={onUndo}
    />,
  );
}

describe("WeightBudget", () => {
  it("states the total against the limit, and each share as the backend sent it", () => {
    renderBudget();
    expect(screen.getByRole("status")).toHaveTextContent(t.totalMissing("0,8", "0,2"));
    expect(screen.getByText(t.limit)).toBeInTheDocument();
    expect(screen.getByText("75,0%")).toBeInTheDocument();
    expect(screen.getByText("25,0%")).toBeInTheDocument();
  });

  it("writes a blank weight as 'sem peso', never 0", () => {
    renderBudget();
    expect(screen.getByText(t.noWeight)).toBeInTheDocument();
    expect(screen.getByText(t.noShare)).toBeInTheDocument();
    expect(screen.getByText(t.issues.missing_weight)).toBeInTheDocument();
  });

  it("offers the suggestion with its values, and reports the click", async () => {
    const onApply = vi.fn();
    renderBudget(onApply);
    expect(screen.getByText(t.suggestionValues("0,6 · 0,2 · 0,2"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: t.suggest.fill_blanks }));
    expect(onApply).toHaveBeenCalledWith([0.6, 0.2, 0.2]);
  });

  it("shows the top five with the notes that qualify them", () => {
    renderBudget();
    expect(screen.getByText("Alumínio 6061")).toBeInTheDocument();
    expect(screen.getByText(t.previewWholeCatalogue(75))).toBeInTheDocument();
    expect(screen.getByText(t.previewRenormalized)).toBeInTheDocument();
  });

  it("offers Desfazer only when there is something to undo", () => {
    const { unmount } = renderBudget();
    expect(screen.queryByRole("button", { name: t.undo })).toBeNull();
    unmount();
    renderBudget(vi.fn(), vi.fn());
    expect(screen.getByRole("button", { name: t.undo })).toBeInTheDocument();
  });

  it("is accessible", async () => {
    const { container } = renderBudget();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
