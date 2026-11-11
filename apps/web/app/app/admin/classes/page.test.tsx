import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const deleteClass = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  createClass: vi.fn(),
  deleteClass: (id: number) => deleteClass(id),
  listClasses: vi
    .fn()
    .mockResolvedValue([
      {
        id: 7,
        name: "Aços",
        slug: "acos",
        parent_id: null,
        description: null,
        material_count: 0,
      },
    ]),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/admin/classes" }));
vi.mock("@/components/auth/CatalogReadOnlyNotice", () => ({
  CatalogReadOnlyNotice: () => null,
}));

import ClassesAdminPage from "./page";

beforeEach(() => deleteClass.mockClear());

describe("admin/classes delete (D-201)", () => {
  it("asks for confirmation and only deletes after confirming", async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ClassesAdminPage />
      </QueryClientProvider>,
    );
    const trigger = await screen.findByRole("button", { name: /excluir/i });
    await user.click(trigger);
    expect(deleteClass).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: 'Excluir a classe "Aços"?' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(deleteClass).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /excluir/i }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));
    expect(deleteClass).toHaveBeenCalledWith(7);
  });
});
