import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { descendantIds } from "@/components/admin/MoveClassDialog";

const t = curadoriaText.move;

const CLASSES = [
  { id: 7, name: "Aços", slug: "acos", parent_id: null, description: null, material_count: 0 },
  { id: 8, name: "Aços inox", slug: "acos-inox", parent_id: 7, description: null, material_count: 2 },
  { id: 10, name: "Duplex", slug: "duplex", parent_id: 8, description: null, material_count: 0 },
  { id: 9, name: "Polímeros", slug: "polimeros", parent_id: null, description: null, material_count: 0 },
];

const moveClass = vi.fn();

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: false, provider: "none", simulated: false, disclaimer: "" }),
  suggestNextSteps: () => Promise.resolve(null),
  ApiError: class ApiError extends Error {},
  createClass: vi.fn(),
  deleteClass: vi.fn(),
  moveClass: (id: number, parent: number | null) => moveClass(id, parent),
  listClasses: () => Promise.resolve(CLASSES),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/admin/classes" }));
vi.mock("@/components/auth/CatalogReadOnlyNotice", () => ({ CatalogReadOnlyNotice: () => null }));

import ClassesAdminPage from "./page";

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <ClassesAdminPage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { user, ...view };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  moveClass.mockReset();
  moveClass.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe("descendantIds", () => {
  it("a classe e tudo o que está dentro dela, em qualquer profundidade", () => {
    const aços = CLASSES[0]!;
    expect([...descendantIds(aços, CLASSES)].sort()).toEqual([10, 7, 8]);
    expect([...descendantIds(CLASSES[3]!, CLASSES)]).toEqual([9]);
  });

  it("não trava com dados circulares", () => {
    const loop = [
      { ...CLASSES[0]!, id: 1, parent_id: 2 },
      { ...CLASSES[0]!, id: 2, parent_id: 1 },
    ];
    expect([...descendantIds(loop[0]!, loop)].sort()).toEqual([1, 2]);
  });
});

describe("admin/classes: Mover para… (D-233)", () => {
  it("cada linha tem o botão, com o nome da classe no rótulo", async () => {
    setup();
    await screen.findAllByRole("row");
    for (const name of ["Aços", "Aços inox", "Duplex", "Polímeros"]) {
      expect(screen.getByRole("button", { name: t.actionFor(name) })).toBeInTheDocument();
    }
  });

  it("a lista de destinos não traz a própria classe nem as que estão dentro dela", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.actionFor("Aços") }));
    const dialog = await screen.findByRole("dialog", { name: t.title("Aços") });
    const options = within(dialog)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toEqual([t.toRoot, "Polímeros"]);
  });

  it("move para outra classe, só com o pai, e avisa", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.actionFor("Aços inox") }));
    const dialog = await screen.findByRole("dialog", { name: t.title("Aços inox") });
    // Starts on the current parent, so "Mover" is off until the choice changes.
    expect(within(dialog).getByRole("button", { name: t.confirm })).toBeDisabled();
    expect(within(dialog).getByText(t.unchanged)).toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText(t.parentLabel), "9");
    await user.click(within(dialog).getByRole("button", { name: t.confirm }));

    await waitFor(() => expect(moveClass).toHaveBeenCalledWith(8, 9));
    expect(await screen.findByText(t.moved("Aços inox", "Polímeros"))).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("move para a raiz mandando parent_id nulo", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.actionFor("Aços inox") }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText(t.parentLabel), "");
    await user.click(within(dialog).getByRole("button", { name: t.confirm }));
    await waitFor(() => expect(moveClass).toHaveBeenCalledWith(8, null));
    expect(await screen.findByText(t.moved("Aços inox", null))).toBeInTheDocument();
  });

  it("funciona só com o teclado: Enter no botão abre, o foco entra, Tab até Mover e Enter envia", async () => {
    const { user } = setup();
    const button = await screen.findByRole("button", { name: t.actionFor("Polímeros") });
    button.focus();
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog", { name: t.title("Polímeros") });
    // Focus moved into the dialog.
    expect(dialog.contains(document.activeElement)).toBe(true);
    const select = within(dialog).getByLabelText(t.parentLabel);
    // jsdom does not move a native select with the arrow keys; the choice is the browser's,
    // and what is tested here is that the form is reachable and submits from the keyboard.
    await user.selectOptions(select, "7");
    select.focus();
    // Tab: Cancelar, then Mover (Enter on a select does not submit, in a browser either).
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: t.confirm }));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(moveClass).toHaveBeenCalledWith(9, 7));
  });

  it("Escape fecha sem mover", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.actionFor("Aços inox") }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(moveClass).not.toHaveBeenCalled();
  });

  it("a recusa do servidor aparece no diálogo, que continua aberto", async () => {
    moveClass.mockRejectedValue(new Error("boom"));
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: t.actionFor("Aços inox") }));
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText(t.parentLabel), "9");
    await user.click(within(dialog).getByRole("button", { name: t.confirm }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("o texto da dica não promete mais que mover é impossível", () => {
    expect(ptBR.admin.treeHint).not.toMatch(/ainda não é possível/);
  });

  it("o diálogo aberto não tem violações de acessibilidade", async () => {
    const { user, container } = setup();
    await user.click(await screen.findByRole("button", { name: t.actionFor("Aços inox") }));
    await screen.findByRole("dialog");
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
