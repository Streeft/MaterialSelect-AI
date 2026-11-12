import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ResumeWork } from "./ResumeWork";
import { FirstUseGuide, GUIDE_KEY } from "./FirstUseGuide";
import { TaskShortcuts } from "./TaskShortcuts";
import { CatalogNews } from "./CatalogNews";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { draftKey, serializeDraft, type DraftData } from "@/lib/selectionDraft";
import { RECENTS_KEY, resetNavMemory } from "@/lib/navMemory";

const t = ptBR.home;

const api = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  listNotebooks: vi.fn(),
  listCatalogReleases: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  getCurrentUser: () => api.getCurrentUser(),
  listNotebooks: () => api.listNotebooks(),
  listCatalogReleases: () => api.listCatalogReleases(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const draftData: DraftData = {
  name: "Viga de ponte",
  functionText: "",
  objectiveText: "",
  freeVariables: "",
  universe: "material",
  stages: [],
  indexMode: "",
  customExpression: "",
  indexGoal: "",
  indexConfirmed: false,
  criteria: [],
  method: "",
  normalization: "",
  useAhp: false,
};

beforeEach(() => {
  window.localStorage.clear();
  resetNavMemory();
  api.getCurrentUser.mockResolvedValue({ id: 3, name: "Maria Souza", email: "m@x.br" });
  api.listNotebooks.mockResolvedValue([]);
  api.listCatalogReleases.mockResolvedValue([]);
});
afterEach(() => window.localStorage.clear());

describe("ResumeWork (D-221)", () => {
  it("não desenha nada quando não há o que retomar", async () => {
    const { container } = render(<ResumeWork />, { wrapper });
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("devolve o rascunho da seleção, o último mapa e o caderno mais recente", async () => {
    window.localStorage.setItem(draftKey(3), serializeDraft("limits", draftData, new Date("2026-11-10T12:00:00Z")));
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify([{ href: "/app/mapas", label: "Mapas" }]));
    api.listNotebooks.mockResolvedValue([
      { id: 1, title: "Antigo", emoji: "📘", source_count: 1, archived: false, created_at: "", updated_at: "2026-01-01T00:00:00Z" },
      { id: 2, title: "Fadiga em eixos", emoji: "📗", source_count: 3, archived: false, created_at: "", updated_at: "2026-11-01T00:00:00Z" },
    ]);
    const { container } = render(<ResumeWork />, { wrapper });

    expect(await screen.findByText("Viga de ponte")).toBeInTheDocument();
    expect(screen.getByText(t.resumeMapOpen).closest("a")).toHaveAttribute("href", "/app/mapas");
    const notebook = await screen.findByText(/Fadiga em eixos/);
    expect(notebook.closest("a")).toHaveAttribute("href", "/app/cadernos/2");
    expect(screen.queryByText(/Antigo/)).not.toBeInTheDocument();
    expect(screen.getByText(t.resumeNotebookSources(3))).toBeInTheDocument();

    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it("não oferece o rascunho de outra conta", async () => {
    window.localStorage.setItem(draftKey(99), serializeDraft("limits", draftData));
    const { container } = render(<ResumeWork />, { wrapper });
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FirstUseGuide (D-221)", () => {
  it("lembra o que foi marcado e some quando dispensado, só neste aparelho", async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<FirstUseGuide />);
    const first = await screen.findByLabelText(t.guideSteps[0]!.label);
    await user.click(first);
    expect(screen.getByText(t.guideProgress(1, 3))).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(GUIDE_KEY)!).done).toEqual(["funcao"]);

    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);

    unmount();
    render(<FirstUseGuide />);
    expect(await screen.findByLabelText(t.guideSteps[0]!.label)).toBeChecked();

    await user.click(await screen.findByShadowRole("button", { name: t.guideDismiss }));
    expect(screen.queryByText(t.guideTitle)).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(GUIDE_KEY)!).dismissed).toBe(true);
  });

  it("funciona sem armazenamento", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<FirstUseGuide />);
    expect(await screen.findByText(t.guideTitle)).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("TaskShortcuts (D-221)", () => {
  it("lista as tarefas como links, sem violações", async () => {
    const { container } = render(<TaskShortcuts />);
    expect(screen.getByRole("link", { name: /Importar uma planilha/ })).toHaveAttribute("href", "/app/importar");
    expect(screen.getAllByRole("listitem")).toHaveLength(t.tasks.length);
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("CatalogNews (D-221)", () => {
  const base = {
    slug: "granta-2026", name: "Catálogo oficial", release: "2026.1", lineage: "x", license_label: "",
    provenance: null, source_sha256: "", is_active: true, is_demo: false, created_at: "2026-10-01T00:00:00Z",
    imported_at: "2026-10-02T00:00:00Z", bundle_sha256: null, manifest_sha256: null, material_count: 1,
    previous_slug: null,
  };

  it("mostra a versão importada mais recente e ignora a demonstração", async () => {
    api.listCatalogReleases.mockResolvedValue([
      { ...base, slug: "a", release: "2026.1", material_count: 10 },
      { ...base, slug: "b", release: "2026.2", imported_at: "2026-11-01T00:00:00Z", material_count: 12 },
      { ...base, slug: "demo", release: "demo", is_demo: true, imported_at: "2026-11-09T00:00:00Z" },
    ]);
    render(<CatalogNews />, { wrapper });
    expect(await screen.findByText("Catálogo oficial, versão 2026.2")).toBeInTheDocument();
    expect(screen.getByText(/12 materiais/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.newsOpen })).toHaveAttribute("href", "/app/catalogo/releases");
  });

  it("some quando só há demonstração ou quando não carrega", async () => {
    api.listCatalogReleases.mockResolvedValue([{ ...base, is_demo: true }]);
    const { container } = render(<CatalogNews />, { wrapper });
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });
});
