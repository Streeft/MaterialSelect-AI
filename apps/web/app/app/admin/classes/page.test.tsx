import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";
import { suggestText } from "@/lib/i18n-suggest";
import type { SuggestionsOut } from "@/lib/types";

const deleteClass = vi.fn().mockResolvedValue(undefined);
const createClass = vi.fn().mockResolvedValue({});
const patchClass = vi.fn().mockResolvedValue({});

const CLASSES = [
  { id: 8, name: "Aços inox", slug: "acos-inox", parent_id: 7, description: null, material_count: 2 },
  { id: 7, name: "Aços", slug: "acos", parent_id: null, description: null, material_count: 0 },
  { id: 9, name: "Polímeros", slug: "polimeros", parent_id: null, description: null, material_count: 0 },
];

const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  ApiError: class ApiError extends Error {},
  createClass: (p: unknown) => createClass(p),
  deleteClass: (id: number) => deleteClass(id),
  patchClass: (id: number, patch: unknown) => patchClass(id, patch),
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

/** D-238: the creation form is behind "Nova classe" in the header. */
async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: ptBR.admin.newClassOpen }));
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  deleteClass.mockClear();
  createClass.mockClear();
  patchClass.mockReset();
  patchClass.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe("admin/classes", () => {
  it("lista a hierarquia: a subclasse vem logo abaixo do pai, com o pai nomeado", async () => {
    setup();
    const rows = await screen.findAllByRole("row");
    const names = rows.slice(1).map((r) => within(r).getAllByRole("rowheader")[0]?.textContent);
    expect(names).toEqual(["Aços", "↳Aços inox", "Polímeros"]);
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
    await openForm(user);
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

describe("admin/classes — Sugestão da IA (D-230b)", () => {
  const answer: SuggestionsOut = {
    tool: "admin_classes",
    summary: "Sugestões para a classe que você está editando.",
    suggestions: [
      {
        title: "Escreva a descrição",
        body: "Uma descrição curta ajuda quem filtra o catálogo; ajuste o rascunho abaixo.",
        actions: [
          {
            type: "fill_text",
            label: "Preencher a descrição",
            field: "description",
            text: "Cerâmicas: materiais inorgânicos, duros e frágeis.",
          },
          // A field the form does not have is not a button.
          { type: "fill_text", label: "Preencher o apelido", field: "apelido", text: "x" },
          { type: "open_route", label: "Ver as classes", path: "/app/admin/classes" },
        ],
      },
    ],
    rejected: [],
    degraded: false,
    cached: false,
    notice: null,
    provider: "mock",
    simulated: true,
    disclaimer: "",
  };

  beforeEach(() => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
  });

  it("sem o nome o botão fica desligado e diz por quê; nada é perguntado", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await openForm(user);
    expect(screen.getByRole("button", { name: suggestText.button })).toBeDisabled();
    expect(screen.getByText(suggestText.needsName)).toBeInTheDocument();
    expect(suggest.fn).not.toHaveBeenCalled();
  });

  it("preenche a descrição sem gravar; quem grava é a pessoa, depois de ler", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await openForm(user);
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), "Cerâmicas técnicas");
    expect(suggest.fn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    expect(await screen.findByRole("button", { name: "Preencher a descrição" })).toBeInTheDocument();
    expect(suggest.fn).toHaveBeenCalledWith("admin_classes", { name: "Cerâmicas técnicas", description: "" });
    expect(screen.queryByRole("button", { name: "Preencher o apelido" })).toBeNull();
    // The answer arriving wrote nothing.
    const field = screen.getByLabelText(new RegExp(`^${ptBR.form.description}`)) as HTMLTextAreaElement;
    expect(field.value).toBe("");

    await user.click(screen.getByRole("button", { name: "Preencher a descrição" }));
    expect(field.value).toBe("Cerâmicas: materiais inorgânicos, duros e frágeis.");
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(field).toHaveAttribute("data-ai-changed", "true");
    // Nothing was saved by filling the field.
    expect(createClass).not.toHaveBeenCalled();

    // The person edits and saves.
    await user.type(field, " Ex.: alumina.");
    await user.click(screen.getByRole("button", { name: ptBR.admin.newClass }));
    expect(createClass).toHaveBeenCalledWith({
      name: "Cerâmicas técnicas",
      parent_id: null,
      description: "Cerâmicas: materiais inorgânicos, duros e frágeis. Ex.: alumina.",
    });
  });

  it("a descrição já escrita vai no contexto, para a sugestão não a sobrescrever às cegas", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await openForm(user);
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), "Cerâmicas técnicas");
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.description}`)), "Minha frase.");
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByRole("button", { name: "Preencher a descrição" });
    expect(suggest.fn).toHaveBeenCalledWith("admin_classes", {
      name: "Cerâmicas técnicas",
      description: "Minha frase.",
    });
  });

  it("não tem violações de acessibilidade com o painel aberto", async () => {
    const { user, container } = setup();
    await screen.findAllByRole("row");
    await openForm(user);
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), "Cerâmicas técnicas");
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByRole("button", { name: "Preencher a descrição" });
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  }, 30_000);
});

describe("admin/classes — árvore editável (D-238)", () => {
  const rowNames = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).queryAllByRole("rowheader")[0]?.textContent);

  it("o formulário de criação fica atrás de “Nova classe”", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    expect(screen.queryByLabelText(new RegExp(`^${ptBR.form.description}`))).toBeNull();
    await openForm(user);
    expect(screen.getByLabelText(new RegExp(`^${ptBR.form.description}`))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: ptBR.admin.cancelCreate }));
    expect(screen.queryByLabelText(new RegExp(`^${ptBR.form.description}`))).toBeNull();
  });

  it("recolhe e expande as subclasses, com o estado dito no botão", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    const fold = screen.getByRole("button", { name: ptBR.admin.collapseClass("Aços") });
    expect(fold).toHaveAttribute("aria-expanded", "true");
    await user.click(fold);
    expect(rowNames()).toEqual(["Aços", "Polímeros"]);
    const unfold = screen.getByRole("button", { name: ptBR.admin.expandClass("Aços") });
    expect(unfold).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: ptBR.admin.expandAll }));
    expect(rowNames()).toEqual(["Aços", "↳Aços inox", "Polímeros"]);
  });

  it("a busca acha sem acento, mostra o caminho e conta o que achou", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await user.type(screen.getByRole("searchbox", { name: new RegExp(ptBR.admin.searchClasses) }), "inox");
    expect(rowNames()).toEqual(["Aços" + ptBR.admin.ancestorOfMatch, "↳Aços inox"]);
    expect(screen.getByText(ptBR.admin.classesShown(1, 3))).toHaveAttribute("role", "status");
    await user.clear(screen.getByRole("searchbox", { name: new RegExp(ptBR.admin.searchClasses) }));
    await user.type(screen.getByRole("searchbox", { name: new RegExp(ptBR.admin.searchClasses) }), "ceramica");
    expect(screen.getByText(ptBR.admin.noClassMatch("ceramica"))).toBeInTheDocument();
  });

  it("renomeia na própria linha: Enter grava pelo PATCH, Esc desiste", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await user.click(screen.getByRole("button", { name: ptBR.editable.edit(ptBR.form.name, "Polímeros") }));
    const field = screen.getByRole("textbox", { name: ptBR.editable.fieldLabel(ptBR.form.name, "Polímeros") });
    await user.clear(field);
    await user.type(field, "Plásticos{Escape}");
    expect(patchClass).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: ptBR.editable.edit(ptBR.form.name, "Polímeros") }));
    const again = screen.getByRole("textbox", { name: ptBR.editable.fieldLabel(ptBR.form.name, "Polímeros") });
    await user.clear(again);
    await user.type(again, "  Plásticos {Enter}");
    expect(patchClass).toHaveBeenCalledWith(9, { name: "Plásticos" });
  });

  it("nome repetido é dito na célula e não vai ao servidor; recusa do servidor também", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await user.click(screen.getByRole("button", { name: ptBR.editable.edit(ptBR.form.name, "Polímeros") }));
    const field = screen.getByRole("textbox", { name: ptBR.editable.fieldLabel(ptBR.form.name, "Polímeros") });
    await user.clear(field);
    await user.type(field, "aços{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent(ptBR.admin.errorClassDuplicate);
    expect(patchClass).not.toHaveBeenCalled();

    patchClass.mockRejectedValueOnce(new Error("Já existe uma classe com o nome: Vidros"));
    await user.clear(field);
    await user.type(field, "Vidros{Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // Still editing: the cell never shows a name the server did not keep.
    expect(screen.getByRole("textbox", { name: ptBR.editable.fieldLabel(ptBR.form.name, "Polímeros") })).toHaveValue("Vidros");
  });

  it("a descrição se edita na linha e, apagada, vai como nenhuma", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await user.click(screen.getByRole("button", { name: ptBR.editable.edit(ptBR.admin.descriptionColumn, "Aços") }));
    const field = screen.getByRole("textbox", { name: ptBR.editable.fieldLabel(ptBR.admin.descriptionColumn, "Aços") });
    await user.type(field, "Ligas de ferro e carbono.{Control>}{Enter}{/Control}");
    expect(patchClass).toHaveBeenCalledWith(7, { description: "Ligas de ferro e carbono." });
  });

  it("não tem violações de acessibilidade editando uma célula", async () => {
    const { user, container } = setup();
    await screen.findAllByRole("row");
    await user.click(screen.getByRole("button", { name: ptBR.editable.edit(ptBR.form.name, "Aços") }));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  }, 30_000);
});

