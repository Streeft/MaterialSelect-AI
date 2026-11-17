import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { curadoriaText } from "@/lib/i18n-curadoria";
import type { SourceRecord } from "@/lib/types";

const t = curadoriaText.sourcesAdmin;
const te = curadoriaText.editSource;

const base: SourceRecord = {
  id: 1,
  label: "Ashby 2011",
  reference: null,
  authors: "ASHBY, Michael F.",
  title: "Materials selection in mechanical design",
  publisher: null,
  year: 2011,
  url: null,
  accessed_on: null,
  abnt: "ASHBY, Michael F. Materials selection in mechanical design. 2011.",
  is_demo: false,
  license_label: "CC-BY-4.0",
  license_url: "https://creativecommons.org/licenses/by/4.0/",
  contains_third_party_data: false,
  reviewed_by_email: "curadora@exemplo.org",
  reviewed_at: "2026-11-01T12:00:00Z",
};
const orphan: SourceRecord = {
  ...base,
  id: 2,
  label: "Fonte sem ficha",
  authors: null,
  title: null,
  year: null,
  abnt: "Fonte sem ficha.",
  license_label: null,
  license_url: null,
  contains_third_party_data: true,
  reviewed_by_email: null,
  reviewed_at: null,
  is_demo: true,
};

const api = vi.hoisted(() => ({ list: vi.fn(), patch: vi.fn(), canEdit: { value: true } }));
vi.mock("@/lib/api", () => ({
  listSources: () => api.list(),
  patchSource: (id: number, patch: unknown) => api.patch(id, patch),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/admin/fontes" }));
vi.mock("@/lib/billing", () => ({ useCanEditCatalog: () => api.canEdit.value }));
vi.mock("@/components/auth/CatalogReadOnlyNotice", () => ({ CatalogReadOnlyNotice: () => null }));

import SourcesAdminPage from "./page";

function setup() {
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <SourcesAdminPage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { user, ...view };
}

beforeEach(() => {
  api.list.mockReset().mockResolvedValue([base, orphan]);
  api.patch.mockReset().mockResolvedValue(base);
  api.canEdit.value = true;
});
afterEach(() => vi.clearAllMocks());

describe("admin/fontes (D-244)", () => {
  it("lista todas as fontes, também a que nenhuma ficha cita, com licença, revisão e citação", async () => {
    setup();
    expect(await screen.findByRole("rowheader", { name: /Ashby 2011/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Fonte sem ficha/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC-BY-4.0" })).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by/4.0/",
    );
    // A missing licence and a missing reviewer are written out, never blank or zero.
    expect(screen.getByText(t.noLicense)).toBeInTheDocument();
    expect(screen.getByText(t.noReviewer)).toBeInTheDocument();
    expect(screen.getByText(t.demo)).toBeInTheDocument();
    expect(screen.getByText(t.thirdParty)).toBeInTheDocument();
    expect(screen.getByText(base.abnt)).toBeInTheDocument();
    expect(screen.getByText(t.shown(2, 2))).toBeInTheDocument();
  });

  it("a busca filtra por rótulo e diz quando nada combina", async () => {
    const { user } = setup();
    await screen.findByRole("rowheader", { name: /Ashby 2011/ });
    await user.type(screen.getByRole("searchbox", { name: new RegExp(t.search) }), "sem ficha");
    expect(screen.queryByRole("rowheader", { name: /Ashby 2011/ })).toBeNull();
    expect(screen.getByText(t.shown(1, 2))).toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox", { name: new RegExp(t.search) }));
    await user.type(screen.getByRole("searchbox", { name: new RegExp(t.search) }), "zzz");
    expect(screen.getByText(t.noMatch("zzz"))).toBeInTheDocument();
  });

  it("o curador corrige rótulo e licença e só o que mudou vai no PATCH", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: te.actionFor("Fonte sem ficha") }));
    const dialog = await screen.findByRole("dialog", { name: te.title("Fonte sem ficha") });
    const label = within(dialog).getByRole("textbox", { name: new RegExp(`^${t.label}`) });
    await user.clear(label);
    await user.type(label, "Fonte revisada");
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(`^${t.licenseLabel}`) }), "Domínio público");
    await user.click(within(dialog).getByRole("button", { name: te.save }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(api.patch).toHaveBeenCalledWith(2, { label: "Fonte revisada", license_label: "Domínio público" });
  });

  it("rótulo em branco é recusado na tela, sem chamar o servidor", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: te.actionFor("Ashby 2011") }));
    const dialog = await screen.findByRole("dialog");
    await user.clear(within(dialog).getByRole("textbox", { name: new RegExp(`^${t.label}`) }));
    await user.click(within(dialog).getByRole("button", { name: te.save }));
    expect(await within(dialog).findByText(t.errorLabelRequired)).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("a recusa do servidor (rótulo repetido) aparece no diálogo", async () => {
    api.patch.mockRejectedValue(Object.assign(new Error("Já existe outra fonte com o rótulo «X»."), { status: 409 }));
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: te.actionFor("Ashby 2011") }));
    const dialog = await screen.findByRole("dialog");
    const label = within(dialog).getByRole("textbox", { name: new RegExp(`^${t.label}`) });
    await user.clear(label);
    await user.type(label, "X");
    await user.click(within(dialog).getByRole("button", { name: te.save }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });

  it("quem não cura o catálogo vê a lista sem o botão de editar", async () => {
    api.canEdit.value = false;
    setup();
    await screen.findByRole("rowheader", { name: /Ashby 2011/ });
    expect(screen.queryByRole("button", { name: te.actionFor("Ashby 2011") })).toBeNull();
  });

  it("sem fontes mostra o estado vazio; com falha, o erro com nova tentativa", async () => {
    api.list.mockResolvedValue([]);
    const first = setup();
    expect(await screen.findByText(t.none)).toBeInTheDocument();
    first.unmount();

    api.list.mockRejectedValue(new Error("boom"));
    setup();
    expect(await screen.findByText(t.error)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tentar/i })).toBeInTheDocument();
  });

  it("a página, a lista e o diálogo não têm violações de acessibilidade", async () => {
    const { container, user } = setup();
    await screen.findByRole("rowheader", { name: /Ashby 2011/ });
    const rules = { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } };
    let violations = await findA11yViolations(container, rules);
    expect(violations, describeViolations(violations)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: te.actionFor("Ashby 2011") }));
    await screen.findByRole("dialog");
    // The shared Dialog titles with an h3 (as every dialog of the app does): heading order is
    // the Dialog's own contract, tested there.
    violations = await findA11yViolations(document.body, {
      rules: { ...rules.rules, "heading-order": { enabled: false } },
    });
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
