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

const api = vi.hoisted(() => ({
  list: vi.fn(),
  patch: vi.fn(),
  create: vi.fn(),
  del: vi.fn(),
  merge: vi.fn(),
  canEdit: { value: true },
}));
vi.mock("@/lib/api", () => ({
  listSources: () => api.list(),
  patchSource: (id: number, patch: unknown) => api.patch(id, patch),
  createSource: (body: unknown) => api.create(body),
  deleteSource: (id: number) => api.del(id),
  mergeSource: (id: number, target: number) => api.merge(id, target),
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
  api.create.mockReset();
  api.del.mockReset().mockResolvedValue(undefined);
  api.merge.mockReset();
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

// --- D-249: criar, apagar e mesclar ------------------------------------------------

const cited: SourceRecord = { ...base, citations: 12 };
const free: SourceRecord = {
  ...base,
  id: 3,
  label: "Fonte livre",
  license_label: "Uso interno",
  license_url: null,
  citations: 0,
};
const flagged: SourceRecord = { ...base, id: 4, label: "Fonte de terceiros", contains_third_party_data: true, citations: 2 };
const demo: SourceRecord = { ...orphan, citations: 5 };

describe("admin/fontes — criar, apagar e mesclar (D-249)", () => {
  beforeEach(() => {
    api.list.mockResolvedValue([cited, free, flagged, demo]);
  });

  it("mostra quantos dados citam cada fonte, e só a que ninguém cita tem Apagar", async () => {
    setup();
    await screen.findByRole("rowheader", { name: /Ashby 2011/ });
    expect(screen.getByText(t.citations(12))).toBeInTheDocument();
    expect(screen.getByText(t.citations(0))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.deleteActionFor("Fonte livre") })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.deleteActionFor("Ashby 2011") })).toBeNull();
    // A demonstration source has neither: it leaves with the fictitious data.
    expect(screen.queryByRole("button", { name: t.mergeActionFor("Fonte sem ficha") })).toBeNull();
    expect(screen.queryByRole("button", { name: t.deleteActionFor("Fonte sem ficha") })).toBeNull();
    expect(screen.getByText(t.demoKept)).toBeInTheDocument();
  });

  it("cadastra uma fonte: rótulo e licença obrigatórios, e o corpo vai limpo", async () => {
    api.create.mockResolvedValue({ ...free, id: 9, label: "Norma NBR 1234" });
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.create }));
    const dialog = await screen.findByRole("dialog", { name: t.createTitle });
    await user.click(within(dialog).getByRole("button", { name: t.createSave }));
    expect(await within(dialog).findByText(t.errorLabelRequired)).toBeInTheDocument();
    expect(within(dialog).getByText(t.errorLicenseRequired)).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(`^${t.label}`) }), "  Norma NBR 1234 ");
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(`^${t.licenseLabel}`) }), "Uso autorizado");
    await user.click(within(dialog).getByRole("checkbox", { name: t.thirdPartyField }));
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(`^${te.year}`) }), "2018");
    await user.click(within(dialog).getByRole("button", { name: t.createSave }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(api.create).toHaveBeenCalledWith({
      label: "Norma NBR 1234",
      license_label: "Uso autorizado",
      license_url: null,
      reference: null,
      contains_third_party_data: true,
      authors: null,
      title: null,
      publisher: null,
      year: 2018,
      url: null,
      accessed_on: null,
    });
    expect(await screen.findByText(t.created("Norma NBR 1234"))).toBeInTheDocument();
  });

  it("mostra a recusa do servidor ao cadastrar (rótulo repetido)", async () => {
    api.create.mockRejectedValue(Object.assign(new Error("Já existe uma fonte com o rótulo «X»."), { status: 409 }));
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.create }));
    const dialog = await screen.findByRole("dialog", { name: t.createTitle });
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(`^${t.label}`) }), "X");
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(`^${t.licenseLabel}`) }), "Uso");
    await user.click(within(dialog).getByRole("button", { name: t.createSave }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
  });

  it("apagar pede confirmação, some a linha e dá Desfazer antes de chamar o servidor", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.deleteActionFor("Fonte livre") }));
    const confirm = await screen.findByRole("dialog", { name: t.deleteTitle });
    expect(within(confirm).getByText(t.deleteMessage("Fonte livre"))).toBeInTheDocument();
    expect(api.del).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: t.deleteConfirm }));

    expect(await screen.findByText(t.deleted("Fonte livre"))).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: /Fonte livre/ })).toBeNull();
    // The call is held back: nothing was sent yet, and Desfazer brings the row back.
    expect(api.del).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(api.del).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("rowheader", { name: /Fonte livre/ })).toBeInTheDocument());
  });

  it("cancelar a confirmação não apaga nada", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.deleteActionFor("Fonte livre") }));
    const confirm = await screen.findByRole("dialog", { name: t.deleteTitle });
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("rowheader", { name: /Fonte livre/ })).toBeInTheDocument();
    expect(api.del).not.toHaveBeenCalled();
  });

  it("mescla: escolhe o destino, vê a licença diferente, confirma e o servidor recebe os dois ids", async () => {
    api.merge.mockResolvedValue({ target: { ...cited, citations: 12 }, moved: 0 });
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.mergeActionFor("Fonte livre") }));
    const dialog = await screen.findByRole("dialog", { name: t.mergeTitle("Fonte livre") });
    const next = within(dialog).getByRole("button", { name: t.mergeContinue });
    expect(next).toBeDisabled();
    // A demonstration source is not offered as a target.
    expect(within(dialog).queryByRole("option", { name: /Fonte sem ficha/ })).toBeNull();
    await user.selectOptions(within(dialog).getByRole("combobox", { name: t.mergeTarget }), "1");
    expect(within(dialog).getByText(t.mergeLicenseDiffers("Uso interno", "CC-BY-4.0"))).toBeInTheDocument();
    await user.click(next);

    const confirm = await screen.findByRole("dialog", { name: t.mergeConfirmTitle });
    expect(within(confirm).getByText(t.mergeConfirmMessage("Fonte livre", "Ashby 2011", 0))).toBeInTheDocument();
    expect(api.merge).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole("button", { name: t.mergeConfirm }));
    await waitFor(() => expect(api.merge).toHaveBeenCalledWith(3, 1));
    expect(await screen.findByText(t.merged("Fonte livre", "Ashby 2011", 0))).toBeInTheDocument();
  });

  it("a fonte sinalizada como de terceiros só oferece destinos sinalizados", async () => {
    api.list.mockResolvedValue([cited, free, { ...flagged, id: 5, label: "Outra de terceiros" }, flagged]);
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.mergeActionFor("Fonte de terceiros") }));
    const dialog = await screen.findByRole("dialog", { name: t.mergeTitle("Fonte de terceiros") });
    expect(within(dialog).getByText(t.mergeFlagged)).toBeInTheDocument();
    expect(within(dialog).getAllByRole("option").map((o) => o.textContent)).toEqual([
      t.mergePick,
      "Outra de terceiros",
    ]);
  });

  it("a recusa do servidor ao mesclar volta ao primeiro diálogo, com a escolha mantida", async () => {
    api.merge.mockRejectedValue(Object.assign(new Error("Mesclar apagaria o sinal de terceiros."), { status: 409 }));
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.mergeActionFor("Fonte livre") }));
    const dialog = await screen.findByRole("dialog", { name: t.mergeTitle("Fonte livre") });
    await user.selectOptions(within(dialog).getByRole("combobox", { name: t.mergeTarget }), "1");
    await user.click(within(dialog).getByRole("button", { name: t.mergeContinue }));
    const confirm = await screen.findByRole("dialog", { name: t.mergeConfirmTitle });
    await user.click(within(confirm).getByRole("button", { name: t.mergeConfirm }));
    const back = await screen.findByRole("dialog", { name: t.mergeTitle("Fonte livre") });
    expect(await within(back).findByRole("alert")).toHaveTextContent(/sinal de terceiros/);
    expect(within(back).getByRole("combobox", { name: t.mergeTarget })).toHaveValue("1");
  });

  it("quem não cura o catálogo não vê Nova fonte, Mesclar nem Apagar", async () => {
    api.canEdit.value = false;
    setup();
    await screen.findByRole("rowheader", { name: /Ashby 2011/ });
    expect(screen.queryByRole("button", { name: t.create })).toBeNull();
    expect(screen.queryByRole("button", { name: t.mergeActionFor("Fonte livre") })).toBeNull();
    expect(screen.queryByRole("button", { name: t.deleteActionFor("Fonte livre") })).toBeNull();
  });

  it("os diálogos de criar e de mesclar não têm violações de acessibilidade", async () => {
    const { user } = setup();
    const rules = {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false }, "heading-order": { enabled: false } },
    };
    await user.click(await screen.findByRole("button", { name: t.create }));
    await screen.findByRole("dialog", { name: t.createTitle });
    let violations = await findA11yViolations(document.body, rules);
    expect(violations, describeViolations(violations)).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await user.click(await screen.findByRole("button", { name: t.mergeActionFor("Fonte livre") }));
    await screen.findByRole("dialog", { name: t.mergeTitle("Fonte livre") });
    violations = await findA11yViolations(document.body, rules);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
