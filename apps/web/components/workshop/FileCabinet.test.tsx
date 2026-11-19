import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import type { MaterialListItem } from "@/lib/types";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { renderWithQuery } from "@/lib/testing/queryWrapper";
import { FileCabinet } from "./FileCabinet";

const search = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ searchMaterials: (q: unknown) => search(q) }));

const t = ptBR.catalog.cabinet;

function material(id: number, name: string, subclass: string | null): MaterialListItem {
  return {
    id,
    name,
    class_name: "Metais",
    class_slug: "metais",
    subclass,
    is_demo: false,
    is_own_record: false,
    keywords: [],
    quality: { medido: 2, importado: 0, estimado: 1, missing: 3 },
    designations: [],
  };
}

const FAMILIES = [
  { slug: "metais", name: "Metais" },
  { slug: "polimeros", name: "Polímeros" },
];

function answer(items: MaterialListItem[], total: number, subclasse: Record<string, number> = {}) {
  return Promise.resolve({ items, total, facets: { classe: {}, subclasse, qualidade: {}, demo: {} }, composition: null });
}

function renderCabinet(onFilterFamily = vi.fn()) {
  return renderWithQuery(
    <FileCabinet
      families={FAMILIES}
      counts={{ metais: 14, polimeros: 0 }}
      base={{ q: "leve", qualidade: "complete", demo: null }}
      onFilterFamily={onFilterFamily}
    />,
  );
}

afterEach(() => search.mockReset());

describe("FileCabinet (D-256)", () => {
  it("mostra uma gaveta fechada por família, com a contagem do servidor na etiqueta", () => {
    renderCabinet();
    const metais = screen.getByRole("button", { name: /Metais/ });
    expect(metais).toHaveAttribute("aria-expanded", "false");
    expect(metais).toHaveTextContent("14 materiais");
    expect(screen.getByRole("button", { name: /Polímeros/ })).toHaveTextContent("0 materiais");
    // Closed drawers ask nothing of the server.
    expect(search).not.toHaveBeenCalled();
  });

  it("abre a gaveta com a pergunta do leitor estreitada à família, e os envelopes levam à ficha", async () => {
    search.mockImplementation(() =>
      answer([material(7, "Aço A", "Aço estrutural"), material(9, "Liga B", "Liga leve")], 14, {
        "Aço estrutural": 9,
        "Liga leve": 5,
      }),
    );
    const user = userEvent.setup();
    const { container } = renderCabinet();
    await user.click(screen.getByRole("button", { name: /Metais/ }));

    const tray = await screen.findByRole("region", { name: t.tray("Metais") });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ q: "leve", qualidade: "complete", classe: "metais", subclasse: null, limit: 12 }),
    );
    const envelopes = await within(tray).findByRole("list", { name: t.envelopes("Metais") });
    expect(within(envelopes).getByRole("link", { name: "Aço A" })).toHaveAttribute("href", "/app/materiais/7");
    // The quality marks are the list's own, absence included; no property value is invented.
    expect(within(envelopes).getAllByText(/3 ausente/)).toHaveLength(2);
    expect(within(tray).getByRole("status")).toHaveTextContent(t.shown(2, 14));
    expect(within(tray).getByRole("link", { name: t.openFamily("Metais") })).toHaveAttribute(
      "href",
      "/app/catalogo/metais",
    );
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });

  it("as divisórias são as subfamílias que a gaveta tem, e escolher uma pergunta de novo ao servidor", async () => {
    search.mockImplementation(() => answer([material(7, "Aço A", "Aço estrutural")], 14, { "Aço estrutural": 9, "Liga leve": 5 }));
    const user = userEvent.setup();
    renderCabinet();
    await user.click(screen.getByRole("button", { name: /Metais/ }));
    const dividers = await screen.findByRole("group", { name: t.dividers("Metais") });
    expect(within(dividers).getByRole("button", { name: t.allDividers })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(dividers).getByRole("button", { name: t.divider("Liga leve", 5) }));
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ classe: "metais", subclasse: "Liga leve" })),
    );
  });

  it("uma gaveta aberta por vez, e a vazia diz que está vazia", async () => {
    search.mockImplementation((q: { classe: string }) =>
      q.classe === "metais" ? answer([material(7, "Aço A", null)], 1) : answer([], 0),
    );
    const user = userEvent.setup();
    renderCabinet();
    await user.click(screen.getByRole("button", { name: /Metais/ }));
    await screen.findByRole("link", { name: "Aço A" });
    await user.click(screen.getByRole("button", { name: /Polímeros/ }));

    expect(screen.getByRole("button", { name: /Metais/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Aço A" })).not.toBeInTheDocument();
    expect(await screen.findByText(t.empty)).toBeInTheDocument();
  });

  it('"Filtrar a lista abaixo" devolve a família a quem guarda os filtros', async () => {
    search.mockImplementation(() => answer([material(7, "Aço A", null)], 1));
    const onFilter = vi.fn();
    const user = userEvent.setup();
    renderCabinet(onFilter);
    await user.click(screen.getByRole("button", { name: /Metais/ }));
    await user.click(await screen.findByRole("button", { name: t.filterList }));
    expect(onFilter).toHaveBeenCalledWith("metais");
  });

  it("uma falha do servidor aparece na gaveta, com nova tentativa", async () => {
    search.mockImplementation(() => Promise.reject(new Error("fora do ar")));
    const user = userEvent.setup();
    renderCabinet();
    await user.click(screen.getByRole("button", { name: /Metais/ }));
    expect(await screen.findByText(t.error)).toBeInTheDocument();
  });
});
