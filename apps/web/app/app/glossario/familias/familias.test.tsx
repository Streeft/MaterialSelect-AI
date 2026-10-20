import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import type { FamilyNoteEntry, MaterialClass } from "@/lib/types";

const t = ptBR.familyNotes;

vi.mock("next/navigation", () => ({ usePathname: () => "/app/glossario/familias" }));

const ceramicas: FamilyNoteEntry = {
  slug: "ceramicas",
  summary: "Compostos inorgânicos duros e frágeis.",
  body: ["Ligações fortes e direcionais."],
  when_to_use: ["Superfícies sujeitas a desgaste."],
  watch_out: ["Choque térmico."],
  reference: null,
  license: "Texto autoral do projeto MaterialSelect AI.",
  review_status: "rascunho",
  lang: "pt-BR",
};

function klass(slug: string, name: string, parent_id: number | null = null): MaterialClass {
  return { id: slug.length, slug, name, parent_id, description: null, material_count: 0 };
}

const classes = [
  klass("ceramicas", "Cerâmicas"),
  klass("madeiras-demo", "Madeiras"),
  // A sub-folder without a note is not listed: only top-level families are.
  klass("ligas-leves", "Ligas leves", 1),
];

const api = {
  notes: (): Promise<FamilyNoteEntry[]> => Promise.resolve([ceramicas]),
  classes: (): Promise<MaterialClass[]> => Promise.resolve(classes),
};

vi.mock("@/lib/api", () => ({
  listFamilyNotes: () => api.notes(),
  listClasses: () => api.classes(),
}));

const { default: FamilyNotesPage } = await import("./page");

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  api.notes = () => Promise.resolve([ceramicas]);
  api.classes = () => Promise.resolve(classes);
});

describe("página de famílias do glossário (D-151)", () => {
  it("mostra o carregamento", () => {
    api.notes = () => new Promise(() => {});
    render(wrap(<FamilyNotesPage />));
    expect(screen.getAllByShadowText(t.loading).length).toBeGreaterThan(0);
  });

  it("mostra o erro escrito", async () => {
    api.notes = () => Promise.reject(new Error("falhou"));
    render(wrap(<FamilyNotesPage />));
    expect(await screen.findByShadowText(t.error)).toBeInTheDocument();
  });

  it("mostra o vazio escrito", async () => {
    api.notes = () => Promise.resolve([]);
    api.classes = () => Promise.resolve([]);
    render(wrap(<FamilyNotesPage />));
    expect(await screen.findByShadowText(t.empty)).toBeInTheDocument();
  });

  it("mostra a nota com licença e revisão escritas, e a família sem nota escrita", async () => {
    render(wrap(<FamilyNotesPage />));
    expect(await screen.findByShadowRole("heading", { name: /Cerâmicas/ })).toBeInTheDocument();
    expect(screen.getByShadowText(ceramicas.summary)).toBeInTheDocument();
    expect(screen.getByShadowText(ceramicas.license)).toBeInTheDocument();
    expect(screen.getAllByShadowText(ptBR.glossary.reviewDraft).length).toBeGreaterThan(0);
    expect(screen.getByShadowRole("heading", { name: /Madeiras/ })).toBeInTheDocument();
    expect(screen.getByShadowText(t.missingHint)).toBeInTheDocument();
    expect(screen.queryByShadowRole("heading", { name: /Ligas leves/ })).not.toBeInTheDocument();
    expect(screen.getByShadowText(t.count(2))).toBeInTheDocument();
    // The section nav says where the reader is.
    const nav = screen.getByShadowRole("navigation", { name: t.navLabel });
    expect(nav).toBeInTheDocument();
    expect(screen.getByShadowRole("link", { name: t.navFamilies })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("filtra por nome, sem acento, e escreve quando nada corresponde", async () => {
    render(wrap(<FamilyNotesPage />));
    await screen.findByShadowRole("heading", { name: /Cerâmicas/ });
    const box = screen.getByShadowRole("searchbox", { name: t.filter });
    await userEvent.type(box, "ceramica");
    expect(screen.queryByShadowRole("heading", { name: /Madeiras/ })).not.toBeInTheDocument();
    expect(screen.getByShadowRole("heading", { name: /Cerâmicas/ })).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, "zzz");
    expect(screen.getByShadowText(t.noMatch("zzz"))).toBeInTheDocument();
  });
});
