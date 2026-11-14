import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";

const t = curadoriaText.editProperty;

const DENSIDADE = {
  id: 1,
  name: "Densidade",
  slug: "densidade",
  category: "FISICA",
  symbol: "ρ",
  description: "Massa por volume.",
  physical_dimension: "[mass] / [length] ** 3",
  canonical_unit: "kg/m**3",
  accepted_units: ["kg/m**3", "g/cm**3"],
  display_unit: null,
  value_count: 12,
};

const patchProperty = vi.fn();

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: false, provider: "none", simulated: false, disclaimer: "" }),
  suggestNextSteps: () => Promise.resolve(null),
  ApiError: class ApiError extends Error {},
  createProperty: vi.fn(),
  deleteProperty: vi.fn(),
  patchProperty: (id: number, patch: unknown) => patchProperty(id, patch),
  listProperties: () => Promise.resolve([DENSIDADE]),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/admin/propriedades" }));
vi.mock("@/components/auth/CatalogReadOnlyNotice", () => ({ CatalogReadOnlyNotice: () => null }));

import PropertiesAdminPage from "./page";

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <PropertiesAdminPage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { user, ...view };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: t.actionFor("Densidade") }));
  return screen.findByRole("dialog", { name: t.title("Densidade") });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  patchProperty.mockReset();
  patchProperty.mockResolvedValue({ ...DENSIDADE, name: "Massa específica" });
});
afterEach(() => vi.useRealTimers());

describe("admin/propriedades: editar (D-233)", () => {
  it("abre com o que está cadastrado e diz o que não muda por aqui", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    expect(within(dialog).getByLabelText(new RegExp(`^${ptBR.form.name}`))).toHaveValue("Densidade");
    expect(within(dialog).getByLabelText(new RegExp(`^${ptBR.form.description}`))).toHaveValue("Massa por volume.");
    expect(within(dialog).getByText(t.fixedNote)).toBeInTheDocument();
    // There is no field for the slug, the dimension or the canonical unit.
    expect(within(dialog).queryByLabelText(ptBR.admin.slug)).toBeNull();
    expect(within(dialog).queryByLabelText(ptBR.admin.physicalDimension)).toBeNull();
    expect(within(dialog).queryByLabelText(ptBR.admin.canonicalUnit)).toBeNull();
  });

  it("a unidade de leitura só oferece as unidades aceitas, mais 'como está guardada'", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    const options = within(dialog)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toHaveLength(3);
    expect(options[0]).toBe(t.displayUnitNone);
  });

  it("sem mudar nada, 'Salvar' fica desligado", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    expect(within(dialog).getByRole("button", { name: t.save })).toBeDisabled();
  });

  it("manda só o que mudou", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    const name = within(dialog).getByLabelText(new RegExp(`^${ptBR.form.name}`));
    await user.clear(name);
    await user.type(name, "  Massa específica ");
    await user.click(within(dialog).getByRole("button", { name: t.save }));

    await waitFor(() => expect(patchProperty).toHaveBeenCalledWith(1, { name: "Massa específica" }));
    expect(await screen.findByText(t.saved("Massa específica"))).toBeInTheDocument();
  });

  it("escolhe a unidade de leitura e limpa a descrição com null", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    await user.selectOptions(within(dialog).getByLabelText(t.displayUnit), "g/cm**3");
    await user.clear(within(dialog).getByLabelText(new RegExp(`^${ptBR.form.description}`)));
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    await waitFor(() =>
      expect(patchProperty).toHaveBeenCalledWith(1, { description: null, display_unit: "g/cm**3" }),
    );
  });

  it("nome em branco é recusado no campo, sem enviar", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    await user.clear(within(dialog).getByLabelText(new RegExp(`^${ptBR.form.name}`)));
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    expect(within(dialog).getByText(ptBR.admin.errorNameRequired)).toBeInTheDocument();
    expect(patchProperty).not.toHaveBeenCalled();
  });

  it("a recusa do servidor aparece no diálogo", async () => {
    patchProperty.mockRejectedValue(new Error("boom"));
    const { user } = setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(new RegExp(`^${ptBR.form.name}`)), " 2");
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });

  it("o diálogo aberto não tem violações de acessibilidade", async () => {
    const { user, container } = setup();
    await openDialog(user);
    // The MSDS dialog titles itself with an h3 in every dialog of the app (a library choice, not this
    // dialog's), which axe reads as a skipped level under the page's h1: that one rule is set aside.
    const violations = await findA11yViolations(container, {
      rules: {
        "color-contrast": { enabled: false },
        region: { enabled: false },
        "heading-order": { enabled: false },
      },
    });
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
