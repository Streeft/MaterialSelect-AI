import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { renderWithQuery } from "@/lib/testing/queryWrapper";
import ProjectsPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/app/projetos" }));
const api = vi.hoisted(() => ({ listAssemblies: vi.fn(), createAssembly: vi.fn() }));
vi.mock("@/lib/api", () => api);

const t = ptBR.projects;

afterEach(() => {
  api.listAssemblies.mockReset();
  api.createAssembly.mockReset();
  push.mockReset();
});

describe("Projetos (D-257)", () => {
  it("lista os projetos com o andamento que o servidor contou", async () => {
    api.listAssemblies.mockResolvedValue([
      { id: 5, name: "Mesa de jantar", description: "Para seis", part_count: 3, chosen_count: 1, updated_at: "2026-11-19T12:00:00Z" },
      { id: 6, name: "Estante", description: null, part_count: 0, chosen_count: 0, updated_at: "2026-11-18T12:00:00Z" },
    ]);
    const { container } = renderWithQuery(<ProjectsPage />);
    const list = await screen.findByRole("list", { name: t.listLabel });
    const table = within(list).getByRole("link", { name: /Mesa de jantar/ });
    expect(table).toHaveAttribute("href", "/app/projetos/5");
    expect(table).toHaveTextContent(t.progress(1, 3));
    expect(within(list).getByRole("link", { name: /Estante/ })).toHaveTextContent(t.progress(0, 0));
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("sem projetos, diz o que fazer; o botão só liga com um nome", async () => {
    api.listAssemblies.mockResolvedValue([]);
    renderWithQuery(<ProjectsPage />);
    expect(await screen.findByText(t.empty)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.create })).toBeDisabled();
  });

  it("criar leva direto ao projeto", async () => {
    api.listAssemblies.mockResolvedValue([]);
    api.createAssembly.mockResolvedValue({ id: 9, name: "Cadeira" });
    const user = userEvent.setup();
    renderWithQuery(<ProjectsPage />);
    await user.type(screen.getByRole("textbox", { name: t.newLabel }), "  Cadeira ");
    await user.click(screen.getByRole("button", { name: t.create }));
    await waitFor(() => expect(api.createAssembly).toHaveBeenCalledWith("Cadeira"));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/projetos/9"));
  });

  it("um nome repetido é recusado pelo servidor, e a recusa aparece", async () => {
    api.listAssemblies.mockResolvedValue([]);
    api.createAssembly.mockRejectedValue(Object.assign(new Error("Já existe um projeto chamado “Mesa”."), { status: 409 }));
    const user = userEvent.setup();
    renderWithQuery(<ProjectsPage />);
    await user.type(screen.getByRole("textbox", { name: t.newLabel }), "Mesa");
    await user.click(screen.getByRole("button", { name: t.create }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
