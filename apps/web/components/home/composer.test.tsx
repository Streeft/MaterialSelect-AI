import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, waitFor, within } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { planText } from "@/lib/i18n-plan";
import { makePlan } from "@/lib/testing/planFixtures";
import { PLAN_DRAFT_HREF } from "@/lib/selection/planDraft";
import { draftKey, parseDraft, serializeDraft } from "@/lib/selectionDraft";
import { initialWizardState, snapshotOf } from "@/app/app/selecao/wizardState";
import type { AIStatus, CurrentUser, Notebook, PlanRequest, ProjectPlan } from "@/lib/types";
import { HomeComposer } from "./HomeComposer";
import { NewMenu } from "./NewMenu";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const createNotebook = vi.fn<() => Promise<Notebook>>();
const getAIStatus = vi.fn<() => Promise<AIStatus>>();
const planProject = vi.fn<(request: PlanRequest) => Promise<ProjectPlan>>();
const getCurrentUser = vi.fn<() => Promise<CurrentUser>>();
vi.mock("@/lib/api", () => ({
  createNotebook: () => createNotebook(),
  getAIStatus: () => getAIStatus(),
  planProject: (request: PlanRequest) => planProject(request),
  getCurrentUser: () => getCurrentUser(),
  runPlan: () => Promise.reject(new Error("not used")),
}));

const t = ptBR.home;
const p = planText;

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  push.mockReset();
  createNotebook.mockReset();
  planProject.mockReset();
  getAIStatus.mockReset();
  getCurrentUser.mockReset();
  getAIStatus.mockResolvedValue({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" });
  getCurrentUser.mockResolvedValue({ id: 5 } as CurrentUser);
  window.localStorage.clear();
});

/** A request that answers when the test says so. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Assistente de projeto no Início (D-225)", () => {
  it("asks for a project plan with the text, from the button or from Ctrl+Enter", async () => {
    const user = userEvent.setup();
    planProject.mockResolvedValue(makePlan());
    render(wrap(<HomeComposer />));
    const box = screen.getByRole("textbox", { name: t.composer.label });
    await user.type(box, "quero fazer uma roupa de esqui");
    await user.click(screen.getByRole("button", { name: t.composer.submit }));
    await waitFor(() =>
      expect(planProject).toHaveBeenCalledWith({ text: "quero fazer uma roupa de esqui", mode: "project" }),
    );
    expect(push).not.toHaveBeenCalled();
    expect(await screen.findByRole("article", { name: "Camada externa" })).toBeInTheDocument();

    planProject.mockClear();
    await user.click(box);
    await user.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(planProject).toHaveBeenCalledTimes(1));
  });

  it("keeps Enter for a new line: it does not spend a call", async () => {
    const user = userEvent.setup();
    render(wrap(<HomeComposer />));
    const box = screen.getByRole("textbox", { name: t.composer.label });
    await user.type(box, "Eixo{Enter}curto");
    expect(planProject).not.toHaveBeenCalled();
    expect(box).toHaveValue("Eixo\ncurto");
  });

  it("will not send a blank request", async () => {
    const user = userEvent.setup();
    render(wrap(<HomeComposer />));
    expect(screen.getByRole("button", { name: t.composer.submit })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: t.composer.label }), "   {Control>}{Enter}{/Control}");
    expect(planProject).not.toHaveBeenCalled();
  });

  it("says what the assistant is doing while it waits, with a skeleton, and moves on by phase", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const pending = deferred<ProjectPlan>();
      planProject.mockReturnValue(pending.promise);
      render(wrap(<HomeComposer />));
      await user.type(screen.getByRole("textbox", { name: t.composer.label }), "prédio para 50 pessoas");
      await user.click(screen.getByRole("button", { name: t.composer.submit }));

      const status = await screen.findByRole("status", { name: p.working });
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(status).toHaveTextContent(p.phases[0]!);
      await act(() => vi.advanceTimersByTimeAsync(2300));
      expect(screen.getByRole("status", { name: p.working })).toHaveTextContent(p.phases[1]!);
      await act(() => vi.advanceTimersByTimeAsync(2300));
      expect(screen.getByRole("status", { name: p.working })).toHaveTextContent(p.phases[2]!);

      await act(async () => pending.resolve(makePlan()));
      expect(await screen.findByRole("article", { name: "Forro" })).toBeInTheDocument();
      expect(screen.queryByText(p.phases[2]!)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the proposal: three parts, materials, and where every number came from", async () => {
    const user = userEvent.setup();
    planProject.mockResolvedValue(makePlan());
    render(wrap(<HomeComposer />));
    await user.type(screen.getByRole("textbox", { name: t.composer.label }), "roupa de esqui");
    await user.click(screen.getByRole("button", { name: t.composer.submit }));
    const articles = await screen.findAllByRole("article");
    expect(articles).toHaveLength(3);
    const first = within(articles[0]!);
    expect(first.getByRole("link", { name: "Náilon 6,6" })).toHaveAttribute("href", "/app/materiais/11");
    expect(first.getByText("Você")).toBeInTheDocument();
    expect(first.getByText("Cenário: Calor moderado")).toBeInTheDocument();
    expect(first.getByText("Sugestão da IA, revise")).toBeInTheDocument();
    expect(first.getByRole("checkbox", { name: /Densidade/ })).not.toBeChecked();
    expect(first.getByRole("link", { name: /Comparar estes materiais/ })).toHaveAttribute(
      "href",
      "/app/comparar?materiais=11-13",
    );
  });

  it("opens a part in the wizard: its study becomes the draft, then it navigates", async () => {
    const user = userEvent.setup();
    planProject.mockResolvedValue(makePlan());
    render(wrap(<HomeComposer />));
    await user.type(screen.getByRole("textbox", { name: t.composer.label }), "roupa de esqui");
    await user.click(screen.getByRole("button", { name: t.composer.submit }));
    await screen.findAllByRole("article");
    // The account's id arrives with its query; the button waits for it.
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /Abrir na Seleção: Camada isolante/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(PLAN_DRAFT_HREF));
    const draft = parseDraft(window.localStorage.getItem(draftKey(5)));
    expect(draft?.data.name).toBe("Camada isolante");
    expect(JSON.stringify(draft?.data.stages)).not.toContain("densidade");
  });

  it("asks before replacing a draft the reader already has", async () => {
    const user = userEvent.setup();
    planProject.mockResolvedValue(makePlan());
    window.localStorage.setItem(
      draftKey(5),
      serializeDraft("function", { ...snapshotOf(initialWizardState({ get: () => null }), ) } as never),
    );
    render(wrap(<HomeComposer />));
    await user.type(screen.getByRole("textbox", { name: t.composer.label }), "roupa de esqui");
    await user.click(screen.getByRole("button", { name: t.composer.submit }));
    await screen.findAllByRole("article");
    await waitFor(() => expect(getCurrentUser).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /Abrir na Seleção: Forro/ }));
    const dialog = await screen.findByRole("dialog", { name: p.replaceDraftTitle });
    expect(push).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: p.replaceDraftConfirm }));
    await waitFor(() => expect(push).toHaveBeenCalledWith(PLAN_DRAFT_HREF));
    expect(parseDraft(window.localStorage.getItem(draftKey(5)))?.data.name).toBe("Forro");
  });

  it("says honestly when the local rules answered because the AI did not", async () => {
    const user = userEvent.setup();
    planProject.mockResolvedValue(
      makePlan({ degraded: true, notice: "Proposta montada por regras locais porque a IA não respondeu." }),
    );
    render(wrap(<HomeComposer />));
    await user.type(screen.getByRole("textbox", { name: t.composer.label }), "roupa de esqui");
    await user.click(screen.getByRole("button", { name: t.composer.submit }));
    expect(
      await screen.findByText("Proposta montada por regras locais porque a IA não respondeu."),
    ).toBeInTheDocument();
  });

  it("shows a real error with a way to try again, and the time to wait on a 429", async () => {
    const user = userEvent.setup();
    const limited = Object.assign(new Error("Muitas consultas à IA em pouco tempo. Tente de novo em 30 s."), {
      status: 429,
    });
    planProject.mockRejectedValueOnce(limited).mockResolvedValueOnce(makePlan());
    render(wrap(<HomeComposer />));
    await user.type(screen.getByRole("textbox", { name: t.composer.label }), "roupa de esqui");
    await user.click(screen.getByRole("button", { name: t.composer.submit }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Tente de novo em 30 s.");
    await user.click(within(alert).getByRole("button", { name: ptBR.ui.retry }));
    expect(await screen.findByRole("article", { name: "Camada externa" })).toBeInTheDocument();
    expect(planProject).toHaveBeenCalledTimes(2);
  });

  it("falls back to the old behaviour when the AI layer is off: the text becomes the function", async () => {
    const user = userEvent.setup();
    getAIStatus.mockResolvedValue({ enabled: false, provider: "none", simulated: false, disclaimer: "" });
    render(wrap(<HomeComposer />));
    await screen.findByText(p.homeOff);
    await user.type(screen.getByRole("textbox", { name: t.composer.label }), "Viga leve a 80 °C");
    await user.click(screen.getByRole("button", { name: t.composer.submit }));
    expect(push).toHaveBeenCalledWith("/app/selecao?etapa=funcao&funcao=Viga+leve+a+80+%C2%B0C");
    expect(planProject).not.toHaveBeenCalled();
  });

  it("fills the box from a suggestion without sending it, and offers the two new examples", async () => {
    const user = userEvent.setup();
    render(wrap(<HomeComposer />));
    expect(t.composer.suggestions).toContain("Roupa de esqui");
    expect(t.composer.suggestions).toContain("Prédio para 50 pessoas");
    const suggestion = t.composer.suggestions[0]!;
    await user.click(screen.getByRole("button", { name: suggestion }));
    expect(screen.getByRole("textbox", { name: t.composer.label })).toHaveValue(suggestion);
    expect(screen.getByRole("button", { name: suggestion })).toHaveAttribute("aria-pressed", "true");
    expect(push).not.toHaveBeenCalled();
    expect(planProject).not.toHaveBeenCalled();
  });

  it("has no accessibility violations, empty or with a proposal", async () => {
    const user = userEvent.setup();
    planProject.mockResolvedValue(makePlan());
    const { container } = render(wrap(<HomeComposer />));
    expect(await findA11yViolations(container)).toEqual([]);
    await user.type(screen.getByRole("textbox", { name: t.composer.label }), "roupa de esqui");
    await user.click(screen.getByRole("button", { name: t.composer.submit }));
    await screen.findAllByRole("article");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("NewMenu (D-195)", () => {
  it("opens the screens where a study and a material are made", async () => {
    const user = userEvent.setup();
    render(wrap(<NewMenu />));
    await user.click(screen.getByRole("button", { name: t.newMenu.label }));
    await user.click(screen.getByRole("menuitem", { name: t.newMenu.study }));
    expect(push).toHaveBeenLastCalledWith("/app/selecao");

    await user.click(screen.getByRole("button", { name: t.newMenu.label }));
    await user.click(screen.getByRole("menuitem", { name: t.newMenu.material }));
    expect(push).toHaveBeenLastCalledWith("/app/materiais/novo");
  });

  it("creates a notebook and opens it", async () => {
    const user = userEvent.setup();
    createNotebook.mockResolvedValue({ id: 42 } as Notebook);
    render(wrap(<NewMenu />));
    await user.click(screen.getByRole("button", { name: t.newMenu.label }));
    await user.click(screen.getByRole("menuitem", { name: t.newMenu.notebook }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/cadernos/42"));
  });

  it("says in a snackbar when the notebook could not be created", async () => {
    const user = userEvent.setup();
    createNotebook.mockRejectedValue(new Error("offline"));
    render(wrap(<NewMenu />));
    await user.click(screen.getByRole("button", { name: t.newMenu.label }));
    await user.click(screen.getByRole("menuitem", { name: t.newMenu.notebook }));
    expect(await screen.findByText(t.newMenu.notebookError)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
