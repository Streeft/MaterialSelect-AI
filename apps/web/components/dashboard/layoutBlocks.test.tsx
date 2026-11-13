import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SavedView } from "@/lib/types";

const stored: SavedView[] = [];
const createSavedView = vi.fn((payload: Record<string, unknown>) => Promise.resolve(payload));

vi.mock("@/lib/api", () => ({
  listSavedViews: (scope: string) => Promise.resolve(stored.filter((v) => v.scope === scope)),
  createSavedView: (payload: Record<string, unknown>) => createSavedView(payload),
  updateSavedView: () => Promise.resolve({}),
  deleteSavedView: () => Promise.resolve(),
}));

const { LayoutBlocks } = await import("./OverviewBlocks");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LayoutBlocks
        scope="inicio"
        label="Blocos do Início"
        hint="Arraste para mudar a ordem."
        resetLabel="Voltar ao padrão"
        emptyLabel={(name) => `${name}: nada por enquanto.`}
        blocks={[
          { id: "a", name: "Bloco A", node: <p>conteúdo A</p> },
          { id: "vazio", name: "Bloco vazio", node: null },
          { id: "b", name: "Bloco B", node: <p>conteúdo B</p> },
        ]}
      />
    </QueryClientProvider>,
  );
}

describe("LayoutBlocks no Início (D-232)", () => {
  it("segue a ordem guardada na conta, sob o escopo do Início", async () => {
    stored.splice(0, stored.length, {
      id: 1,
      scope: "inicio",
      name: "Layout",
      kind: "layout",
      config: { filters: {}, blocks: ["b", "a"], hidden: [] },
      position: 0,
      created_at: "2026-11-13T00:00:00Z",
      updated_at: "2026-11-13T00:00:00Z",
    });
    mount();
    await waitFor(() => {
      const texts = screen.getAllByText(/conteúdo [AB]/).map((n) => n.textContent);
      expect(texts).toEqual(["conteúdo B", "conteúdo A"]);
    });
  });

  it("um bloco sem nada a mostrar fica no lugar e diz isso numa linha", () => {
    stored.splice(0, stored.length);
    const { container } = mount();
    const empty = Array.from(container.querySelectorAll(".ds-block-body")).filter(
      (b) => b.childElementCount === 0,
    );
    expect(empty).toHaveLength(1);
    expect(empty[0]).toHaveAttribute("data-empty", "Bloco vazio: nada por enquanto.");
  });

  it("mover com Alt+↓ grava o layout do Início na conta", async () => {
    stored.splice(0, stored.length);
    createSavedView.mockClear();
    mount();
    fireEvent.keyDown(screen.getByRole("button", { name: /Mover Bloco A/ }), {
      key: "ArrowDown",
      altKey: true,
    });
    await waitFor(() => expect(createSavedView).toHaveBeenCalled());
    expect(createSavedView.mock.calls[0]?.[0]).toMatchObject({
      scope: "inicio",
      kind: "layout",
      config: { blocks: ["vazio", "a", "b"], hidden: [] },
    });
  });
});
