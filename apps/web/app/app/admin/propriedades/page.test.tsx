import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";

const deleteProperty = vi.fn().mockResolvedValue(undefined);
const createProperty = vi.fn().mockResolvedValue({});

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  createProperty: (p: unknown) => createProperty(p),
  deleteProperty: (id: number) => deleteProperty(id),
  listProperties: () =>
    Promise.resolve([
      { id: 1, name: "Densidade", slug: "densidade", category: "FISICA", canonical_unit: "kg/m**3", symbol: "ρ", value_count: 0 },
    ]),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/admin/propriedades" }));
vi.mock("@/components/auth/CatalogReadOnlyNotice", () => ({ CatalogReadOnlyNotice: () => null }));

import PropertiesAdminPage from "./page";

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>
        <PropertiesAdminPage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { user, ...view };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  deleteProperty.mockClear();
  createProperty.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("admin/propriedades (D-222)", () => {
  it("valida nome, repetição e unidade no campo, sem enviar", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await user.click(screen.getByRole("button", { name: ptBR.admin.newProperty }));
    expect(screen.getByText(ptBR.admin.errorNameRequired)).toBeInTheDocument();
    expect(screen.getByText(ptBR.admin.errorUnitRequired)).toBeInTheDocument();

    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), "densidade");
    expect(screen.getByText(ptBR.admin.errorPropertyDuplicate)).toBeInTheDocument();
    expect(createProperty).not.toHaveBeenCalled();
  });

  it("confirma e deixa desfazer antes de excluir", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Excluir: Densidade" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Excluir" }));
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    expect(deleteProperty).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(8100));
    expect(deleteProperty).toHaveBeenCalledWith(1);
  });

  it("não tem violações de acessibilidade", async () => {
    const { container } = setup();
    await screen.findAllByRole("row");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
