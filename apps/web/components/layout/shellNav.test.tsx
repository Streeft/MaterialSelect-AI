import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, render, within } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppSidebar } from "./AppSidebar";
import { DocumentTitle } from "./DocumentTitle";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { ptBR } from "@/lib/i18n";
import {
  COLLAPSED_GROUPS_KEY,
  PINNED_KEY,
  RECENTS_KEY,
  recordRecent,
  resetNavMemory,
  togglePinned,
} from "@/lib/navMemory";
import { formatDocumentTitle, usePageTitle } from "@/lib/pageTitle";
import { openShortcutsHelp } from "@/lib/shortcuts";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { allowLoadedRunner } from "@/lib/testing/loadedRunner";

allowLoadedRunner();

const nav = ptBR.nav;

/**
 * D-207, the shell: groups that fold and remember it, "Fixados" and "Recentes",
 * the tab title per page and "?" listing the palette's keys too.
 */

const route = { pathname: "/app/mapas" };
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

// D-232b: the rail's "Favoritos" reads the account's records.
const myRecords = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ favorites: [] as unknown[], recents: [] as unknown[], own_records: [] as unknown[] })),
);
vi.mock("@/lib/api", () => ({
  getMyRecords: () => myRecords(),
  getCurrentUser: () =>
    Promise.resolve({ id: 1, email: "a@example.com", name: "Ana", avatar_url: null, project_id: 1 }),
  logout: () => Promise.resolve(),
  getBillingStatus: () =>
    Promise.resolve({
      active: true,
      status: null,
      current_period_end: null,
      access_mode: "subscription",
      has_access: true,
      can_edit_catalog: true,
    }),
}));

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

/** The desktop rail: the drawer is not rendered until opened. */
function rail() {
  return within(document.getElementById("navegacao-lateral")!);
}

function resetMemory() {
  // Through the stores, so their caches, fallbacks and subscribers see it too.
  act(() => resetNavMemory());
}

beforeEach(() => {
  route.pathname = "/app/mapas";
  resetMemory();
});

afterEach(() => vi.restoreAllMocks());

describe("grupos recolhíveis", () => {
  it("o título do grupo recolhe a lista e o leitor ouve o estado", async () => {
    const user = userEvent.setup();
    renderWithClient(<AppSidebar />);
    const toggle = rail().getByRole("button", { name: nav.groupData });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(rail().getByRole("link", { name: nav.catalog })).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(rail().queryByRole("link", { name: nav.catalog })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(COLLAPSED_GROUPS_KEY) ?? "[]")).toContain("data");
  });

  it("um grupo recolhido continua mostrando a página atual", async () => {
    const user = userEvent.setup();
    renderWithClient(<AppSidebar />);
    await user.click(rail().getByRole("button", { name: nav.groupStudy }));
    const current = rail().getByRole("link", { name: nav.maps });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(rail().queryByRole("link", { name: nav.selection })).not.toBeInTheDocument();
  });

  it("lembra o grupo recolhido depois de recarregar", () => {
    window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(["admin"]));
    window.dispatchEvent(new StorageEvent("storage", { key: COLLAPSED_GROUPS_KEY }));
    renderWithClient(<AppSidebar />);
    expect(rail().getByRole("button", { name: nav.groupAdmin })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(rail().queryByRole("link", { name: nav.classes })).not.toBeInTheDocument();
  });

  it("um localStorage que lança não derruba o menu", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });
    const user = userEvent.setup();
    renderWithClient(<AppSidebar />);
    const toggle = rail().getByRole("button", { name: nav.groupAdmin });
    await user.click(toggle);
    // The fold still works for this session, kept in memory.
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

describe("Fixados e Recentes", () => {
  it("fixa a página atual e a mostra em Fixados", async () => {
    const user = userEvent.setup();
    renderWithClient(<AppSidebar />);
    expect(rail().getByText(nav.pinnedEmpty)).toBeInTheDocument();
    const pin = rail().getByRole("button", { name: nav.pinCurrent });
    expect(pin).toHaveAttribute("aria-pressed", "false");
    await user.click(pin);

    const pinnedList = rail().getByRole("list", { name: nav.groupPinned });
    const link = within(pinnedList).getByRole("link", { name: nav.maps });
    expect(link).toHaveAttribute("href", "/app/mapas");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(rail().getByRole("button", { name: nav.unpinCurrent })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(within(pinnedList).getByRole("button", { name: nav.unpin(nav.maps) }));
    expect(rail().getByText(nav.pinnedEmpty)).toBeInTheDocument();
  });

  it("mostra as visitas recentes, a mais nova primeiro, e deixa fixá-las", async () => {
    act(() => {
      // The page on screen (/app/mapas) is not listed as a recent.
      recordRecent({ href: "/app/mapas", label: nav.maps });
      recordRecent({ href: "/app/materiais/7", label: "Aço inoxidável 304" });
      recordRecent({ href: "/app/processos/fundicao", label: "Fundição em areia" });
      recordRecent({ href: "/app/materiais/7", label: "Aço inoxidável 304" });
    });
    const user = userEvent.setup();
    renderWithClient(<AppSidebar />);
    const recents = rail().getByRole("list", { name: nav.groupRecents });
    const links = within(recents).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Aço inoxidável 304", "Fundição em areia"]);

    await user.click(within(recents).getByRole("button", { name: nav.pin("Fundição em areia") }));
    const pinnedList = rail().getByRole("list", { name: nav.groupPinned });
    expect(within(pinnedList).getByRole("link", { name: "Fundição em areia" })).toHaveAttribute(
      "href",
      "/app/processos/fundicao",
    );
  });

  it("não guarda mais que o limite e ignora lixo no armazenamento", () => {
    window.localStorage.setItem(
      PINNED_KEY,
      JSON.stringify([{ href: "https://evil.example", label: "x" }, { href: "/app/eco", label: "Eco" }, 3]),
    );
    window.dispatchEvent(new StorageEvent("storage", { key: PINNED_KEY }));
    renderWithClient(<AppSidebar />);
    const pinnedList = rail().getByRole("list", { name: nav.groupPinned });
    expect(within(pinnedList).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      "/app/eco",
    ]);
  });

  it("o trilho recolhido não desenha Fixados nem Recentes", async () => {
    act(() => togglePinned({ href: "/app/eco", label: "Eco" }));
    const user = userEvent.setup();
    renderWithClient(<AppSidebar />);
    await user.click(rail().getByRole("button", { name: ptBR.ui.collapseSidebar }));
    expect(rail().queryByRole("list", { name: nav.groupPinned })).not.toBeInTheDocument();
  });

  it("não tem violações de acessibilidade com grupos, fixados e recentes", async () => {
    act(() => {
      recordRecent({ href: "/app/eco", label: "Eco" });
      togglePinned({ href: "/app/custo", label: "Custo" });
    });
    const user = userEvent.setup();
    const { container } = renderWithClient(<AppSidebar />);
    await user.click(rail().getByRole("button", { name: nav.groupAdmin }));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

function TitledDetail({ name }: { name: string | null }) {
  usePageTitle(name);
  return null;
}

describe("título da aba e Recentes (DocumentTitle)", () => {
  it("uma tela do menu dá o próprio nome à aba e entra em Recentes", () => {
    renderWithClient(<DocumentTitle />);
    expect(document.title).toBe(formatDocumentTitle(nav.maps));
    expect(JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]")[0]).toEqual({
      href: "/app/mapas",
      label: nav.maps,
    });
  });

  it("uma página de detalhe só entra quando o registro tem nome", () => {
    route.pathname = "/app/materiais/7";
    const { rerender } = renderWithClient(
      <>
        <DocumentTitle />
        <TitledDetail name={null} />
      </>,
    );
    expect(document.title).toBe(ptBR.appName);
    expect(window.localStorage.getItem(RECENTS_KEY)).toBeNull();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <DocumentTitle />
        <TitledDetail name="Aço inoxidável 304" />
      </QueryClientProvider>,
    );
    expect(document.title).toBe(formatDocumentTitle("Aço inoxidável 304"));
    expect(JSON.parse(window.localStorage.getItem(RECENTS_KEY) ?? "[]")[0]).toEqual({
      href: "/app/materiais/7",
      label: "Aço inoxidável 304",
    });
  });

  it("o início não vira recente", () => {
    route.pathname = "/app";
    renderWithClient(<DocumentTitle />);
    expect(document.title).toBe(formatDocumentTitle(nav.home));
    expect(window.localStorage.getItem(RECENTS_KEY)).toBeNull();
  });
});

describe("atalhos (D-169, D-207)", () => {
  it("? lista também as teclas da paleta, e a ação da paleta abre a mesma lista", async () => {
    const user = userEvent.setup();
    renderWithClient(<KeyboardShortcuts />);
    act(() => openShortcutsHelp());
    const dialog = await screen.findByShadowRole("dialog", { name: ptBR.shortcuts.title });
    expect(within(dialog).getByText(ptBR.shortcuts.paletteTitle)).toBeInTheDocument();
    expect(within(dialog).getByText(ptBR.shortcuts.paletteRun)).toBeInTheDocument();
    expect(within(dialog).getByText(ptBR.shortcuts.search)).toBeInTheDocument();
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
    await user.keyboard("{Escape}");
  });
});

describe("Favoritos na barra lateral (D-232b)", () => {
  it("lista os registros com estrela, cada um levando à ficha", async () => {
    myRecords.mockResolvedValueOnce({
      favorites: [
        {
          universe: "material",
          at: "2026-11-13T10:00:00Z",
          material: { id: 7, name: "Alumínio 6061", class_name: "Metais", class_slug: "metais" },
          process: null,
        },
      ],
      recents: [],
      own_records: [],
    });
    renderWithClient(<AppSidebar />);
    const link = await rail().findByRole("link", { name: "Alumínio 6061" });
    expect(link).toHaveAttribute("href", "/app/materiais/7");
  });
});
