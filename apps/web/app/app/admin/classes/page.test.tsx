import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";

const deleteClass = vi.fn().mockResolvedValue(undefined);
const createClass = vi.fn().mockResolvedValue({});

const CLASSES = [
  { id: 8, name: "Aços inox", slug: "acos-inox", parent_id: 7, description: null, material_count: 2 },
  { id: 7, name: "Aços", slug: "acos", parent_id: null, description: null, material_count: 0 },
  { id: 9, name: "Polímeros", slug: "polimeros", parent_id: null, description: null, material_count: 0 },
];

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  createClass: (p: unknown) => createClass(p),
  deleteClass: (id: number) => deleteClass(id),
  listClasses: () => Promise.resolve(CLASSES),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/admin/classes" }));
vi.mock("@/components/auth/CatalogReadOnlyNotice", () => ({
  CatalogReadOnlyNotice: () => null,
}));

import ClassesAdminPage from "./page";

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>
        <ClassesAdminPage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { user, ...view };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  deleteClass.mockClear();
  createClass.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("admin/classes", () => {
  it("lista a hierarquia: a subclasse vem logo abaixo do pai, com o pai nomeado", async () => {
    setup();
    const rows = await screen.findAllByRole("row");
    const names = rows.slice(1).map((r) => within(r).getAllByRole("rowheader")[0]?.textContent);
    expect(names).toEqual(["Aços", "↳ Aços inox", "Polímeros"]);
    expect(within(rows[2] as HTMLElement).getByText("Aços", { selector: "td" })).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText(ptBR.admin.rootClass)).toBeInTheDocument();
  });

  it("confirma, depois deixa desfazer, e só chama o servidor quando o prazo acaba (D-201, D-130)", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Excluir: Aços" }));
    expect(deleteClass).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: 'Excluir a classe "Aços"?' });
    await user.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(deleteClass).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Excluir: Aços" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Excluir" }));
    // Out of the list at once, with "Desfazer" on offer; the server has not heard yet.
    expect(screen.queryByRole("button", { name: "Excluir: Aços" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    expect(deleteClass).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(8100));
    expect(deleteClass).toHaveBeenCalledWith(7);
  });

  it("desfazer cancela a exclusão", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Excluir: Aços" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Excluir" }));
    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    act(() => vi.advanceTimersByTime(20000));
    expect(deleteClass).not.toHaveBeenCalled();
  });

  it("a classe com materiais não pode ser excluída, e diz por quê", async () => {
    setup();
    const button = await screen.findByRole("button", { name: "Excluir: Aços inox" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", ptBR.admin.inUse);
  });

  it("valida no campo: nome vazio e nome repetido, sem enviar", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await user.click(screen.getByRole("button", { name: ptBR.admin.newClass }));
    expect(screen.getByText(ptBR.admin.errorNameRequired)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`))).toBeInvalid();

    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), " polímeros ");
    expect(screen.getByText(ptBR.admin.errorClassDuplicate)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: ptBR.admin.newClass }));
    expect(createClass).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)));
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), "Cerâmicas");
    await user.click(screen.getByRole("button", { name: ptBR.admin.newClass }));
    expect(createClass).toHaveBeenCalledWith({ name: "Cerâmicas", parent_id: null, description: null });
  });

  it("não tem violações de acessibilidade", async () => {
    const { container } = setup();
    await screen.findAllByRole("row");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
