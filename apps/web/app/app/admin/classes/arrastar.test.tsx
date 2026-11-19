import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { curadoriaText } from "@/lib/i18n-curadoria";

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
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <ClassesAdminPage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

const row = (name: string) =>
  screen.getByRole("rowheader", { name }).closest<HTMLElement>("tr")!;
const grip = (name: string) => row(name).querySelector<HTMLElement>(".ds-block-grip")!;
const rootStrip = () => screen.getByText(t.dropRoot);

/** jsdom has no layout: the element "under the pointer" is whatever the test says it is. */
let under: Element | null = null;
const hover = (target: Element | null) => {
  under = target;
};
const pointerMove = () => fireEvent.pointerMove(document, { clientX: 5, clientY: 5 });
const pointerUp = () => fireEvent.pointerUp(document, { clientX: 5, clientY: 5 });

/** Press the grip of `from`, move onto `target` and release, as a finger or a mouse would. */
function dragOnto(from: string, target: HTMLElement) {
  fireEvent.pointerDown(grip(from), { button: 0, pointerType: "touch" });
  hover(target);
  pointerMove();
  pointerUp();
}

beforeEach(() => {
  under = null;
  document.elementFromPoint = () => under;
  moveClass.mockReset();
  moveClass.mockResolvedValue({});
});
afterEach(() => vi.clearAllMocks());

describe("admin/classes: arrastar para mover, com mouse ou dedo (D-236, D-244)", () => {
  it("soltar uma linha sobre outra faz dela subclasse, com o mesmo PATCH do Mover para…", async () => {
    setup();
    await screen.findAllByRole("row");

    dragOnto("Aços inox", row("Polímeros"));

    await waitFor(() => expect(moveClass).toHaveBeenCalledWith(8, 9));
    expect(await screen.findByText(t.moved("Aços inox", "Polímeros"))).toBeInTheDocument();
  });

  it("soltar na faixa da raiz manda parent_id nulo", async () => {
    setup();
    await screen.findAllByRole("row");

    dragOnto("Aços inox", rootStrip());

    await waitFor(() => expect(moveClass).toHaveBeenCalledWith(8, null));
    expect(await screen.findByText(t.moved("Aços inox", null))).toBeInTheDocument();
  });

  it("não aceita soltar sobre si mesma nem sobre uma subclasse (fecharia um ciclo)", async () => {
    setup();
    await screen.findAllByRole("row");
    fireEvent.pointerDown(grip("Aços"), { button: 0, pointerType: "touch" });

    for (const name of ["Aços", "Aços inox", "Duplex"]) {
      hover(row(name));
      pointerMove();
      expect(row(name)).not.toHaveAttribute("data-drop-target");
    }
    // A class that is not under it, and the root, are accepted.
    hover(row("Polímeros"));
    pointerMove();
    expect(row("Polímeros")).toHaveAttribute("data-drop-target");
    hover(rootStrip());
    pointerMove();
    expect(rootStrip()).toHaveAttribute("data-drop-target");

    hover(row("Duplex"));
    pointerMove();
    pointerUp();
    expect(moveClass).not.toHaveBeenCalled();
  });

  it("soltar onde a classe já está não chama o servidor e diz isso", async () => {
    setup();
    await screen.findAllByRole("row");

    dragOnto("Aços inox", row("Aços"));

    expect(await screen.findByText(t.sameParent("Aços inox"))).toBeInTheDocument();
    expect(moveClass).not.toHaveBeenCalled();
  });

  it("a linha de destino acende enquanto o dedo está sobre ela e apaga ao sair", async () => {
    setup();
    await screen.findAllByRole("row");
    fireEvent.pointerDown(grip("Duplex"), { button: 0, pointerType: "touch" });
    hover(row("Polímeros"));
    pointerMove();
    expect(row("Polímeros")).toHaveAttribute("data-drop-target");
    expect(row("Duplex")).toHaveAttribute("data-dragged");
    hover(null);
    pointerMove();
    expect(row("Polímeros")).not.toHaveAttribute("data-drop-target");
  });

  it("soltar fora de qualquer linha, ou cancelar o toque, ou Esc, não move nada", async () => {
    setup();
    await screen.findAllByRole("row");

    fireEvent.pointerDown(grip("Duplex"), { button: 0, pointerType: "touch" });
    hover(document.body);
    pointerMove();
    pointerUp();

    fireEvent.pointerDown(grip("Duplex"), { button: 0, pointerType: "touch" });
    hover(row("Polímeros"));
    pointerMove();
    fireEvent.pointerCancel(document);
    expect(row("Polímeros")).not.toHaveAttribute("data-drop-target");
    pointerUp();

    fireEvent.pointerDown(grip("Duplex"), { button: 0, pointerType: "touch" });
    hover(row("Polímeros"));
    pointerMove();
    fireEvent.keyDown(document, { key: "Escape" });
    pointerUp();

    expect(moveClass).not.toHaveBeenCalled();
  });

  it("a alça tem a classe que desliga o rolar da página (touch-action) para o dedo arrastar", async () => {
    setup();
    await screen.findAllByRole("row");
    expect(grip("Aços")).toHaveClass("ds-grip-pointer");
    expect(grip("Aços")).not.toHaveAttribute("draggable");
  });

  it("quando o servidor recusa um ciclo, a tela escreve o motivo e nada fica como se tivesse movido", async () => {
    // The page's list is stale (the server already has a different tree): it refuses.
    const refusal = Object.assign(new Error("A hierarquia de classes não pode conter ciclos."), {
      status: 400,
    });
    moveClass.mockRejectedValue(refusal);
    setup();
    await screen.findAllByRole("row");

    dragOnto("Polímeros", row("Aços inox"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("A hierarquia de classes não pode conter ciclos.");
    expect(screen.queryByText(t.moved("Polímeros", "Aços inox"))).toBeNull();
  });

  it("uma falha sem texto legível cai na mensagem padrão", async () => {
    moveClass.mockRejectedValue(new Error("boom"));
    setup();
    await screen.findAllByRole("row");

    dragOnto("Polímeros", row("Aços"));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.dragFailed);
  });

  it("o Mover para… continua em cada linha como alternativa por teclado", async () => {
    setup();
    await screen.findAllByRole("row");
    expect(screen.getByRole("button", { name: t.actionFor("Aços inox") })).toBeInTheDocument();
    expect(screen.getByText(t.dragHint)).toBeInTheDocument();
  });

  it("a página com a faixa da raiz e as alças não tem violações de acessibilidade", async () => {
    const { container } = setup();
    await screen.findAllByRole("row");
    const violations = await findA11yViolations(container, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  describe("rolar sozinha perto da borda (D-249)", () => {
    let frames = new Map<number, FrameRequestCallback>();
    let nextId = 0;
    let scrollBy: ReturnType<typeof vi.spyOn>;
    const nextFrame = () => {
      const due = [...frames.values()];
      frames = new Map();
      act(() => due.forEach((callback) => callback(0)));
    };

    beforeEach(() => {
      frames = new Map();
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
        nextId += 1;
        frames.set(nextId, callback);
        return nextId;
      });
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
        frames.delete(id);
      });
      scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    const press = (name: string, clientY: number) => {
      fireEvent.pointerDown(grip(name), { button: 0, pointerType: "touch", clientX: 5, clientY });
      return (y: number) => fireEvent.pointerMove(document, { clientX: 5, clientY: y });
    };

    it("com o ponteiro na borda de baixo a página rola para baixo, e na de cima, para cima", async () => {
      setup();
      await screen.findAllByRole("row");
      const move = press("Duplex", window.innerHeight - 4);
      nextFrame();
      expect(scrollBy).toHaveBeenCalled();
      expect(scrollBy.mock.calls.at(-1)![1]).toBeGreaterThan(0);

      scrollBy.mockClear();
      move(3);
      nextFrame();
      expect(scrollBy.mock.calls.at(-1)![1]).toBeLessThan(0);
    });

    it("no meio da tela não rola, e rola mais depressa quanto mais perto da borda", async () => {
      setup();
      await screen.findAllByRole("row");
      const move = press("Duplex", window.innerHeight / 2);
      nextFrame();
      expect(scrollBy).not.toHaveBeenCalled();

      move(window.innerHeight - 60);
      nextFrame();
      const slow = scrollBy.mock.calls.at(-1)![1] as number;
      move(window.innerHeight - 2);
      nextFrame();
      const fast = scrollBy.mock.calls.at(-1)![1] as number;
      expect(fast).toBeGreaterThan(slow);
    });

    it("o alvo sob o ponteiro é recalculado depois de rolar: a linha nova acende sem mover o dedo", async () => {
      setup();
      await screen.findAllByRole("row");
      press("Duplex", window.innerHeight - 4);
      hover(row("Polímeros"));
      nextFrame();
      expect(row("Polímeros")).toHaveAttribute("data-drop-target");
    });

    it("soltar, cancelar ou Esc param de rolar", async () => {
      setup();
      await screen.findAllByRole("row");
      press("Duplex", window.innerHeight - 4);
      nextFrame();
      scrollBy.mockClear();
      pointerUp();
      nextFrame();
      expect(scrollBy).not.toHaveBeenCalled();
      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("sem arrastar nada, nada rola", async () => {
      setup();
      await screen.findAllByRole("row");
      nextFrame();
      expect(scrollBy).not.toHaveBeenCalled();
    });
  });
});
