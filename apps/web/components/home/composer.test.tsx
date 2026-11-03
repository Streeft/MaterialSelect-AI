import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { Notebook } from "@/lib/types";
import { HomeComposer } from "./HomeComposer";
import { NewMenu } from "./NewMenu";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const createNotebook = vi.fn<() => Promise<Notebook>>();
vi.mock("@/lib/api", () => ({ createNotebook: () => createNotebook() }));

const t = ptBR.home;

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
});

describe("HomeComposer (D-195)", () => {
  it("opens the wizard on its first step with what was written as the function", async () => {
    const user = userEvent.setup();
    render(wrap(<HomeComposer />));
    await user.type(screen.getByRole("textbox", { name: t.composer.label }), "Viga leve a 80 °C");
    await user.click(screen.getByShadowRole("button", { name: t.composer.submit }));
    expect(push).toHaveBeenCalledWith("/app/selecao?etapa=funcao&funcao=Viga+leve+a+80+%C2%B0C");
  });

  it("sends on Enter, keeps Shift+Enter for a new line, and opens an empty study when blank", async () => {
    const user = userEvent.setup();
    render(wrap(<HomeComposer />));
    const box = screen.getByRole("textbox", { name: t.composer.label });
    await user.type(box, "Eixo{Shift>}{Enter}{/Shift}curto");
    expect(push).not.toHaveBeenCalled();
    expect(box).toHaveValue("Eixo\ncurto");

    await user.clear(box);
    await user.type(box, "{Enter}");
    expect(push).toHaveBeenCalledWith("/app/selecao");
  });

  it("fills the box from a suggestion without sending it", async () => {
    const user = userEvent.setup();
    render(wrap(<HomeComposer />));
    const suggestion = t.composer.suggestions[0]!;
    await user.click(screen.getByRole("button", { name: suggestion }));
    expect(screen.getByRole("textbox", { name: t.composer.label })).toHaveValue(suggestion);
    expect(screen.getByRole("button", { name: suggestion })).toHaveAttribute("aria-pressed", "true");
    expect(push).not.toHaveBeenCalled();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(wrap(<HomeComposer />));
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
