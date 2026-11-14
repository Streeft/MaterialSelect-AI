import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithQuery as render } from "@/lib/testing/queryWrapper";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { compareViewText } from "@/lib/i18n-compare-view";
import type { Bookmark, MaterialListItem, MyRecords } from "@/lib/types";

const records = vi.hoisted(() => ({ value: null as unknown, fail: false }));
vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getMyRecords: () =>
    records.fail
      ? Promise.reject(new TypeError("Failed to fetch"))
      : Promise.resolve(records.value as MyRecords),
  // D-232: the "top do último estudo" shelf reads the saved studies; none here.
  listStudies: () => Promise.resolve([]),
}));

const { CompareSuggestions } = await import("./CompareSuggestions");

function bookmark(id: number, name: string): Bookmark {
  return {
    universe: "material",
    at: "2026-11-01T10:00:00Z",
    material: { id, name, class_name: "Metais", class_slug: "metais" } as MaterialListItem,
    process: null,
  };
}

const t = compareViewText.empty;

describe("CompareSuggestions: o estado vazio do comparador (D-214)", () => {
  beforeEach(() => {
    records.fail = false;
    records.value = { favorites: [], recents: [], own_records: [] };
  });

  it("diz o que fazer e, sem histórico, aponta o catálogo", async () => {
    render(<CompareSuggestions chosen={[]} onAdd={vi.fn()} />);
    expect(screen.getByRole("heading", { name: t.title })).toBeInTheDocument();
    expect(await screen.findByText(t.nothingYet)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.browse })).toHaveAttribute("href", "/app/catalogo");
  });

  it("oferece favoritos e vistos recentemente, e compara um grupo inteiro de uma vez", async () => {
    records.value = {
      favorites: [bookmark(1, "Aço 1020"), bookmark(2, "Alumínio 6061")],
      recents: [bookmark(3, "Titânio Ti-6Al-4V")],
      own_records: [],
    };
    const onAdd = vi.fn();
    render(<CompareSuggestions chosen={[]} onAdd={onAdd} />);

    fireEvent.click(
      await screen.findByRole("button", { name: t.compareAll(2, t.whatFavorites) }),
    );
    expect(onAdd).toHaveBeenCalledWith([1, 2]);

    fireEvent.click(screen.getByRole("button", { name: t.addOne("Titânio Ti-6Al-4V") }));
    expect(onAdd).toHaveBeenLastCalledWith([3]);
    // One recent alone is not a comparison: no "compare all" for it.
    expect(screen.queryByRole("button", { name: t.compareAll(1, t.whatRecents) })).toBeNull();
  });

  it("não repete os favoritos entre os vistos recentemente", async () => {
    records.value = {
      favorites: [bookmark(1, "Aço 1020")],
      recents: [bookmark(1, "Aço 1020"), bookmark(3, "Cobre")],
      own_records: [],
    };
    render(<CompareSuggestions chosen={[]} onAdd={vi.fn()} />);
    await screen.findByRole("button", { name: t.addOne("Cobre") });
    expect(screen.getAllByRole("button", { name: t.addOne("Aço 1020") })).toHaveLength(1);
  });

  it("um registro de processo ou sem nome não vira sugestão", async () => {
    records.value = {
      favorites: [
        { universe: "process", at: "2026-11-01T10:00:00Z", material: null, process: null },
        bookmark(5, "Cobre"),
      ],
      recents: [],
      own_records: [],
    };
    render(<CompareSuggestions chosen={[]} onAdd={vi.fn()} />);
    expect(await screen.findByRole("button", { name: t.addOne("Cobre") })).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("falha de rede vira mensagem tratada, sem 'Failed to fetch'", async () => {
    records.fail = true;
    render(<CompareSuggestions chosen={[]} onAdd={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it("é acessível, vazio e com atalhos", async () => {
    records.value = {
      favorites: [bookmark(1, "Aço 1020"), bookmark(2, "Alumínio 6061")],
      recents: [],
      own_records: [],
    };
    const { container } = render(<CompareSuggestions chosen={[]} onAdd={vi.fn()} />);
    await screen.findByRole("button", { name: t.addOne("Aço 1020") });
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
