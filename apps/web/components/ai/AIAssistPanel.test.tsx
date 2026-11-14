import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor, within } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AIAssistPanel } from "./AIAssistPanel";
import { ptBR } from "@/lib/i18n";
import { planText } from "@/lib/i18n-plan";
import { PLAN_DEBOUNCE_MS } from "@/lib/ai/plan";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { makeComponent, makePlan } from "@/lib/testing/planFixtures";
import type { AIStatus, PlanRequest, ProjectPlan } from "@/lib/types";

const getAIStatus = vi.fn<() => Promise<AIStatus>>();
const planProject = vi.fn<(request: PlanRequest, signal?: AbortSignal) => Promise<ProjectPlan>>();
vi.mock("@/lib/api", () => ({
  getAIStatus: () => getAIStatus(),
  planProject: (request: PlanRequest, signal?: AbortSignal) => planProject(request, signal),
  runPlan: () => Promise.reject(new Error("not used")),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const t = planText;
const LONG = "viga leve e rígida que não pode fletir muito";

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

function singlePlan(): ProjectPlan {
  return makePlan({ mode: "single", components: [makeComponent()] });
}

/** A call that stays open until its signal aborts, as `fetch` does. */
function hangUntilAborted(signal?: AbortSignal): Promise<ProjectPlan> {
  return new Promise((_, reject) => {
    signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  });
}

beforeEach(() => {
  getAIStatus.mockReset();
  planProject.mockReset();
  getAIStatus.mockResolvedValue({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AIAssistPanel — assistente de projeto na Seleção (D-225)", () => {
  it("interprets while typing: after a pause, from 15 characters, in single mode", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    planProject.mockResolvedValue(singlePlan());
    render(wrap(<AIAssistPanel onApply={vi.fn()} />));
    const box = await screen.findByRole("textbox", { name: t.statementLabel });

    // Too short: nothing is asked, however long the pause.
    await user.type(box, "viga leve");
    await act(() => vi.advanceTimersByTimeAsync(PLAN_DEBOUNCE_MS + 500));
    expect(planProject).not.toHaveBeenCalled();

    await user.type(box, " e rígida que não pode fletir");
    // Still typing: the pause has not run out.
    await act(() => vi.advanceTimersByTimeAsync(PLAN_DEBOUNCE_MS - 300));
    expect(planProject).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(planProject).toHaveBeenCalledTimes(1);
    expect(planProject.mock.calls[0]![0]).toEqual({
      text: "viga leve e rígida que não pode fletir",
      mode: "single",
    });
    expect(await screen.findByRole("article", { name: "Camada externa" })).toBeInTheDocument();

    // The same text is not asked twice.
    await act(() => vi.advanceTimersByTimeAsync(PLAN_DEBOUNCE_MS * 2));
    expect(planProject).toHaveBeenCalledTimes(1);
  });

  it("shows a quiet 'interpretando…' while the call is on its way", async () => {
    const user = userEvent.setup();
    planProject.mockImplementation((_, signal) => hangUntilAborted(signal));
    render(wrap(<AIAssistPanel onApply={vi.fn()} />));
    await user.type(await screen.findByRole("textbox", { name: t.statementLabel }), LONG);
    await user.click(screen.getByRole("button", { name: t.interpret }));
    expect(await screen.findByText(t.interpreting)).toBeInTheDocument();
  });

  it("cancels the earlier call when a new one starts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const signals: AbortSignal[] = [];
    planProject.mockImplementation((_, signal) => {
      if (signal) signals.push(signal);
      return planProject.mock.calls.length === 1 ? hangUntilAborted(signal) : Promise.resolve(singlePlan());
    });
    render(wrap(<AIAssistPanel onApply={vi.fn()} />));
    const box = await screen.findByRole("textbox", { name: t.statementLabel });
    await user.type(box, LONG);
    await act(() => vi.advanceTimersByTimeAsync(PLAN_DEBOUNCE_MS + 100));
    expect(planProject).toHaveBeenCalledTimes(1);
    expect(signals[0]!.aborted).toBe(false);

    await user.type(box, " e leve");
    await act(() => vi.advanceTimersByTimeAsync(PLAN_DEBOUNCE_MS + 100));
    expect(planProject).toHaveBeenCalledTimes(2);
    expect(signals[0]!.aborted).toBe(true);
    // The cancelled call is not an error on screen.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(await screen.findByRole("article", { name: "Camada externa" })).toBeInTheDocument();
  });

  it("the Interpretar button still asks at once, whatever the length", async () => {
    const user = userEvent.setup();
    planProject.mockResolvedValue(singlePlan());
    render(wrap(<AIAssistPanel onApply={vi.fn()} />));
    expect(await screen.findByRole("button", { name: t.interpret })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: t.statementLabel }), "mola");
    await user.click(screen.getByRole("button", { name: t.interpret }));
    await waitFor(() => expect(planProject).toHaveBeenCalledWith({ text: "mola", mode: "single" }, expect.any(AbortSignal)));
  });

  it("applies nothing until the click, and then only the applied limits of the part", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    planProject.mockResolvedValue(singlePlan());
    render(wrap(<AIAssistPanel onApply={onApply} />));
    await user.type(await screen.findByRole("textbox", { name: t.statementLabel }), LONG);
    await user.click(screen.getByRole("button", { name: t.interpret }));
    const card = await screen.findByRole("article", { name: "Camada externa" });
    expect(onApply).not.toHaveBeenCalled();
    // The AI suggestion starts unchecked, so it is not part of what is applied.
    expect(within(card).getByRole("checkbox", { name: /Densidade/ })).not.toBeChecked();

    await user.click(within(card).getByRole("button", { name: t.apply }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0]![0];
    expect(JSON.stringify(applied.study.stages)).not.toContain("densidade");
    expect(await screen.findByText(t.applied)).toBeInTheDocument();
  });

  it("holds the apply button back when the text moved on since the proposal", async () => {
    const user = userEvent.setup();
    planProject.mockResolvedValue(singlePlan());
    render(wrap(<AIAssistPanel onApply={vi.fn()} />));
    const box = await screen.findByRole("textbox", { name: t.statementLabel });
    await user.type(box, LONG);
    await user.click(screen.getByRole("button", { name: t.interpret }));
    const card = await screen.findByRole("article", { name: "Camada externa" });
    expect(within(card).getByRole("button", { name: t.apply })).toBeEnabled();
    await user.type(box, " e barata");
    expect(within(card).getByRole("button", { name: t.apply })).toBeDisabled();
    expect(within(card).getByText(t.stale)).toBeInTheDocument();
  });

  it("shows a real error with a way to try again", async () => {
    const user = userEvent.setup();
    const limited = Object.assign(new Error("Muitas consultas à IA em pouco tempo. Tente de novo em 9 s."), {
      status: 429,
    });
    planProject.mockRejectedValueOnce(limited).mockResolvedValueOnce(singlePlan());
    render(wrap(<AIAssistPanel onApply={vi.fn()} />));
    await user.type(await screen.findByRole("textbox", { name: t.statementLabel }), LONG);
    await user.click(screen.getByRole("button", { name: t.interpret }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tente de novo em 9 s.");
    await user.click(within(alert).getByRole("button", { name: t.retry }));
    expect(await screen.findByRole("article", { name: "Camada externa" })).toBeInTheDocument();
  });

  it("says so, and asks for nothing, when the AI layer is off", async () => {
    getAIStatus.mockResolvedValue({ enabled: false, provider: "none", simulated: false, disclaimer: "" });
    render(wrap(<AIAssistPanel onApply={vi.fn()} />));
    expect(await screen.findByText(t.panelOff)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(planProject).not.toHaveBeenCalled();
  });

  it("keeps the old title for the disabled card", async () => {
    getAIStatus.mockResolvedValue({ enabled: false, provider: "none", simulated: false, disclaimer: "" });
    render(wrap(<AIAssistPanel onApply={vi.fn()} />));
    expect(await screen.findByRole("heading", { name: ptBR.ai.title })).toBeInTheDocument();
  });

  it("has no accessibility violations, with a proposal on screen", async () => {
    const user = userEvent.setup();
    planProject.mockResolvedValue(singlePlan());
    const { container } = render(wrap(<AIAssistPanel onApply={vi.fn()} />));
    await user.type(await screen.findByRole("textbox", { name: t.statementLabel }), LONG);
    await user.click(screen.getByRole("button", { name: t.interpret }));
    await screen.findByRole("article", { name: "Camada externa" });
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
