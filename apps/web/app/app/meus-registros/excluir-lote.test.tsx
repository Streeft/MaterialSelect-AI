import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MaterialListItem, MyRecords } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";

const rec = curadoriaText.records;

vi.mock("next/navigation", () => ({
  usePathname: () => "/app/meus-registros",
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const quality = { medido: 1, importado: 0, estimado: 0, missing: 0 };
const own = (id: number, name: string): MaterialListItem => ({
  id,
  name,
  class_name: "Metais",
  class_slug: "metais",
  subclass: null,
  is_demo: false,
  is_own_record: true,
  keywords: [],
  quality,
  designations: [],
});

const ana = own(7, "Liga da Ana");
const pet = own(8, "PET da Ana");
const aco = own(9, "Aço da Ana");
const records: MyRecords = {
  favorites: [{ universe: "material", at: "2026-09-14T10:00:00Z", material: ana, process: null }],
  recents: [],
  own_records: [ana, pet, aco],
};

const deleteOwnMaterials = vi.fn((ids: number[]) => Promise.resolve({ deleted: ids }));
const state = { data: records };

vi.mock("@/lib/api", () => ({
  getAIStatus: () =>
    Promise.resolve({ enabled: false, provider: "none", simulated: false, disclaimer: "" }),
  suggestNextSteps: () => Promise.resolve(null),
  getMyRecords: () => Promise.resolve(state.data),
  removeFavorite: () => Promise.resolve(state.data),
  deleteOwnMaterials: (ids: number[]) => deleteOwnMaterials(ids),
  addFavorite: () => Promise.resolve(state.data),
  touchRecent: () => Promise.resolve(undefined),
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <SnackbarProvider>{node}</SnackbarProvider>
    </QueryClientProvider>
  );
}

const { default: MyRecordsPage } = await import("./page");

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  deleteOwnMaterials.mockClear();
  state.data = records;
});
afterEach(() => vi.useRealTimers());

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(wrap(<MyRecordsPage />));
  return { user, ...view };
}

describe("excluir registros próprios em lote (D-233)", () => {
  it("mostra os registros próprios em qualquer largura, cada um com a sua caixa", async () => {
    setup();
    await screen.findByShadowLabelText(rec.selectOwn("Liga da Ana"));
    expect(screen.getByShadowLabelText(rec.selectOwn("PET da Ana"))).toBeInTheDocument();
    expect(screen.getByShadowLabelText(rec.selectOwn("Aço da Ana"))).toBeInTheDocument();
    // The list is the gallery one: the default layout is hidden from `sm` up.
    const list = screen.getByShadowLabelText(rec.selectOwn("PET da Ana")).closest("ul");
    expect(list?.className).not.toContain("sm:hidden");
  });

  it("não há barra de lote enquanto nada está marcado", async () => {
    setup();
    await screen.findByShadowLabelText(rec.selectOwn("Liga da Ana"));
    expect(screen.queryByShadowRole("button", { name: rec.deleteSelected })).toBeNull();
  });

  it("confirma antes de excluir, e só chama o servidor quando o prazo do Desfazer acaba", async () => {
    const { user } = setup();
    await user.click(await screen.findByShadowLabelText(rec.selectOwn("Liga da Ana")));
    await user.click(screen.getByShadowLabelText(rec.selectOwn("PET da Ana")));
    expect(screen.getByShadowText(rec.selected(2))).toBeInTheDocument();

    await user.click(screen.getByShadowRole("button", { name: rec.deleteSelected }));
    // The question first; nothing has left the list and the server has not heard.
    expect(await screen.findByShadowText(rec.confirmTitle(2))).toBeInTheDocument();
    expect(deleteOwnMaterials).not.toHaveBeenCalled();
    expect(screen.getByShadowLabelText(rec.selectOwn("PET da Ana"))).toBeInTheDocument();

    await user.click(screen.getAllByShadowRole("button", { name: rec.deleteSelected }).at(-1)!);

    // Out of the list at once, with "Desfazer" on offer.
    expect(await screen.findByShadowText(rec.deleted(2))).toBeInTheDocument();
    expect(screen.queryByShadowLabelText(rec.selectOwn("PET da Ana"))).toBeNull();
    expect(screen.getByShadowLabelText(rec.selectOwn("Aço da Ana"))).toBeInTheDocument();
    expect(screen.getByShadowRole("button", { name: ptBR.snackbar.undo })).toBeInTheDocument();
    expect(deleteOwnMaterials).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(8100));
    // One call, with every id, in the order of the list.
    expect(deleteOwnMaterials).toHaveBeenCalledTimes(1);
    expect(deleteOwnMaterials).toHaveBeenCalledWith([7, 8]);
  });

  it("Desfazer cancela a chamada e os registros voltam", async () => {
    const { user } = setup();
    await user.click(await screen.findByShadowLabelText(rec.selectOwn("PET da Ana")));
    await user.click(screen.getByShadowRole("button", { name: rec.deleteSelected }));
    await user.click(screen.getAllByShadowRole("button", { name: rec.deleteSelected }).at(-1)!);
    await user.click(await screen.findByShadowRole("button", { name: ptBR.snackbar.undo }));

    act(() => vi.advanceTimersByTime(8100));
    expect(deleteOwnMaterials).not.toHaveBeenCalled();
    expect(await screen.findByShadowLabelText(rec.selectOwn("PET da Ana"))).toBeInTheDocument();
  });

  it("Cancelar na confirmação não exclui nada e mantém a seleção", async () => {
    const { user } = setup();
    await user.click(await screen.findByShadowLabelText(rec.selectOwn("PET da Ana")));
    await user.click(screen.getByShadowRole("button", { name: rec.deleteSelected }));
    await user.click(await screen.findByShadowRole("button", { name: ptBR.actions.cancel }));

    act(() => vi.advanceTimersByTime(8100));
    expect(deleteOwnMaterials).not.toHaveBeenCalled();
    expect(screen.getByShadowText(rec.selected(1))).toBeInTheDocument();
  });

  it("limpar a seleção tira a barra", async () => {
    const { user } = setup();
    await user.click(await screen.findByShadowLabelText(rec.selectOwn("PET da Ana")));
    await user.click(screen.getByShadowRole("button", { name: rec.clear }));
    expect(screen.queryByShadowRole("button", { name: rec.deleteSelected })).toBeNull();
  });

  it("a seleção de favoritos e a de registros próprios são independentes", async () => {
    const { user } = setup();
    await user.click(await screen.findByShadowLabelText(ptBR.myRecords.selectRow("Liga da Ana")));
    expect(screen.queryByShadowRole("button", { name: rec.deleteSelected })).toBeNull();
    expect(screen.getByShadowText(ptBR.myRecords.selected(1))).toBeInTheDocument();
  });

  it("não tem violações de acessibilidade com a barra de lote aberta", async () => {
    const { user, container } = setup();
    await user.click(await screen.findByShadowLabelText(rec.selectOwn("PET da Ana")));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
