import { describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { SheetActions } from "./SheetActions";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMyRecords: () => Promise.resolve({ favorites: [], recent: [] }),
}));

function wrap(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

describe("SheetActions (D-197)", () => {
  it("offers the sheet's own doors: compare, the map, export and favourite", () => {
    render(wrap(<SheetActions materialId={7} unitChoices={undefined} showMap />));
    const bar = screen.getByRole("toolbar", { name: ptBR.detail.sheetActions });
    expect(within(bar).getByRole("link", { name: ptBR.detail.compareThis })).toHaveAttribute(
      "href",
      "/app/comparar?materiais=7",
    );
    expect(within(bar).getByRole("link", { name: ptBR.detail.seeOnMap })).toHaveAttribute(
      "href",
      "/app/mapas?x=densidade&y=modulo_young&destaque=7",
    );
    expect(screen.getByShadowRole("button", { name: ptBR.exports.title })).toBeInTheDocument();
  });

  it("leaves the map out when the sheet does not offer it", () => {
    render(wrap(<SheetActions materialId={7} unitChoices={undefined} showMap={false} />));
    expect(screen.queryByRole("link", { name: ptBR.detail.seeOnMap })).not.toBeInTheDocument();
  });
});
