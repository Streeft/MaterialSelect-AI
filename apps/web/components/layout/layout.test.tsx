import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
// @material/web's button family exposes its `role="button"` on a <button>
// inside a shadow root — plain @testing-library/react's screen/within can't
// see past that boundary (see the M3 migration plan's "Testes" section).
// shadow-dom-testing-library's screen/within are supersets of the originals
// (light-DOM-only queries still work) plus the Shadow-prefixed variants.
import { screen, within } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppSidebar, GROUPS, visibleGroups } from "./AppSidebar";
import { ptBR } from "@/lib/i18n";
import type { CurrentUser } from "@/lib/types";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";

// The sidebar reads the route to say where the reader is; nothing else about
// Next's router matters here. The sidebar only ever renders under /app now
// (app/app/layout.tsx), so "/app" is the sidebar's own home route, not "/".
const route = { pathname: "/app" };
const routerReplace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ replace: routerReplace }),
}));

const user: CurrentUser = {
  id: 1,
  email: "pesquisador@example.com",
  name: "Usuária de teste",
  avatar_url: null,
  project_id: 1,
};
const getCurrentUser = vi.fn(() => Promise.resolve(user));
const logoutMock = vi.fn(() => Promise.resolve());
// D-86: the menu depends on whether this reader may curate the catalogue.
const billing = { can_edit_catalog: true };
vi.mock("@/lib/api", () => ({
  getCurrentUser: () => getCurrentUser(),
  logout: () => logoutMock(),
  getBillingStatus: () =>
    Promise.resolve({
      active: billing.can_edit_catalog,
      status: null,
      current_period_end: null,
      access_mode: billing.can_edit_catalog ? "subscription" : "open",
      has_access: true,
      can_edit_catalog: billing.can_edit_catalog,
    }),
}));

function renderSidebar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppSidebar />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  billing.can_edit_catalog = true;
  route.pathname = "/app";
  routerReplace.mockClear();
  getCurrentUser.mockClear();
  logoutMock.mockClear();
});

/** The rail's own navigation. The drawer's is a second, unnamed one. */
const rail = () => screen.getByShadowRole("navigation", { name: ptBR.ui.mainNav });

describe("AppSidebar", () => {
  it("groups every link under what someone came here to do", () => {
    renderSidebar();
    const nav = rail();

    for (const group of [ptBR.nav.groupStudy, ptBR.nav.groupData, ptBR.nav.groupAdmin]) {
      expect(within(nav).getByShadowRole("list", { name: group })).toBeInTheDocument();
    }

    const study = within(nav).getByShadowRole("list", { name: ptBR.nav.groupStudy });
    expect(within(study).getByShadowRole("link", { name: ptBR.nav.selection })).toBeInTheDocument();
    expect(within(study).getByShadowRole("link", { name: ptBR.nav.maps })).toBeInTheDocument();
    expect(within(study).getByShadowRole("link", { name: ptBR.nav.compare })).toBeInTheDocument();
  });

  it("announces the current page, and only that one", () => {
    route.pathname = "/app/mapas";
    renderSidebar();
    const nav = rail();

    expect(within(nav).getByShadowRole("link", { name: ptBR.nav.maps })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByShadowRole("link", { name: ptBR.nav.catalog })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps a nested route inside the section it belongs to", () => {
    route.pathname = "/app/admin/classes";
    renderSidebar();

    expect(within(rail()).getByShadowRole("link", { name: ptBR.nav.classes })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not mark the home link on every route", () => {
    // `/app` matches only itself; `startsWith("/app/")` would light it up everywhere.
    route.pathname = "/app/catalogo";
    renderSidebar();

    expect(within(rail()).getByShadowRole("link", { name: ptBR.nav.home })).not.toHaveAttribute(
      "aria-current",
    );
  });

  describe("collapsing the rail", () => {
    it("keeps every destination reachable by name", async () => {
      // The label is unpainted, never removed: a link whose text is gone is a
      // link with no accessible name, and the rail would become eight unnamed
      // glyphs for anyone reading it aloud.
      const user = userEvent.setup();
      renderSidebar();

      const toggle = await screen.findByShadowRole("button", { name: ptBR.ui.collapseSidebar });
      expect(toggle).toHaveAttribute("aria-expanded", "true");

      await user.click(toggle);

      const nav = rail();
      for (const label of [ptBR.nav.selection, ptBR.nav.maps, ptBR.nav.catalog, ptBR.nav.classes]) {
        expect(within(nav).getByShadowRole("link", { name: label })).toBeInTheDocument();
      }
      // The groups still name their lists, so the structure survives too.
      expect(within(nav).getByShadowRole("list", { name: ptBR.nav.groupStudy })).toBeInTheDocument();
    });

    it("flips the control's own name and state", async () => {
      const user = userEvent.setup();
      renderSidebar();

      await user.click(await screen.findByShadowRole("button", { name: ptBR.ui.collapseSidebar }));

      const toggle = screen.getByShadowRole("button", { name: ptBR.ui.expandSidebar });
      expect(toggle).toHaveAttribute("aria-expanded", "false");

      await user.click(toggle);
      expect(screen.getByShadowRole("button", { name: ptBR.ui.collapseSidebar })).toBeInTheDocument();
    });

    it("gives the collapsed links a tooltip, since the glyph is all that is painted", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(await screen.findByShadowRole("button", { name: ptBR.ui.collapseSidebar }));

      expect(within(rail()).getByShadowRole("link", { name: ptBR.nav.maps })).toHaveAttribute(
        "title",
        ptBR.nav.maps,
      );
    });

    it("has no accessibility violations while collapsed", async () => {
      const user = userEvent.setup();
      const { container } = renderSidebar();
      await user.click(await screen.findByShadowRole("button", { name: ptBR.ui.collapseSidebar }));

      const violations = await findA11yViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  describe("the drawer, on a narrow screen", () => {
    it("opens, closes with Esc and gives the focus back", async () => {
      const user = userEvent.setup();
      renderSidebar();

      const trigger = await screen.findByShadowRole("button", { name: ptBR.ui.openMenu });
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      await user.click(trigger);
      const drawer = screen.getByShadowRole("dialog", { name: ptBR.ui.mainNav });
      expect(within(drawer).getByShadowRole("link", { name: ptBR.nav.home })).toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(within(drawer).getByShadowRole("button", { name: ptBR.ui.closeMenu })).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(screen.queryByShadowRole("dialog")).not.toBeInTheDocument();
      // The reader pressed Esc; the focus has to come back to what they opened,
      // not to the top of the document.
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("carries the same sixteen destinations as the rail", async () => {
      const user = userEvent.setup();
      renderSidebar();
      await user.click(await screen.findByShadowRole("button", { name: ptBR.ui.openMenu }));

      const drawer = screen.getByShadowRole("dialog", { name: ptBR.ui.mainNav });
      for (const group of [ptBR.nav.groupStudy, ptBR.nav.groupData, ptBR.nav.groupAdmin]) {
        expect(within(drawer).getByShadowRole("list", { name: group })).toBeInTheDocument();
      }
      // Dezesseis com a P4 aberta: o universo de processos ganhou porta de
      // entrada no P1-4, o espaço do usuário ("Meus registros") também, o grupo
      // de estudo recebeu "Dimensionar" (P2), "Custo" e "Eco" (P3) e agora
      // "Baterias" (P4), e "Dados" recebeu "Sintetizar" — que cria registro, e
      // por isso mora ali. Dezessete desde o D-90: "Cadernos", em "Estudar".
      expect(within(drawer).getAllByShadowRole("link")).toHaveLength(18); // 17 + o wordmark
    });

    it("marks the current page inside the drawer too", async () => {
      route.pathname = "/app/importar";
      const user = userEvent.setup();
      renderSidebar();
      await user.click(await screen.findByShadowRole("button", { name: ptBR.ui.openMenu }));

      const drawer = screen.getByShadowRole("dialog", { name: ptBR.ui.mainNav });
      expect(within(drawer).getByShadowRole("link", { name: ptBR.nav.imports })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });

  it("has no accessibility violations, drawer open or closed", async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar();

    let violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);

    await user.click(await screen.findByShadowRole("button", { name: ptBR.ui.openMenu }));
    violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  describe("the signed-in user's footer", () => {
    it("names the logged-in user once /auth/me resolves", async () => {
      renderSidebar();
      expect(await screen.findByText(user.name)).toBeInTheDocument();
    });

    it("logs out, clears the cached session and leaves for /entrar", async () => {
      const eventUser = userEvent.setup();
      renderSidebar();
      await screen.findByText(user.name);

      await eventUser.click(screen.getByShadowRole("button", { name: ptBR.auth.logout }));

      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(routerReplace).toHaveBeenCalledWith("/entrar");
    });
  });
});

describe("menu por papel e ícones próprios (D-86)", () => {
  it("hides from a student what only a curator can use", async () => {
    billing.can_edit_catalog = false;
    renderSidebar();
    await vi.waitFor(() =>
      expect(within(rail()).queryByShadowRole("link", { name: ptBR.nav.imports })).not.toBeInTheDocument(),
    );
    expect(within(rail()).queryByShadowRole("list", { name: ptBR.nav.groupAdmin })).not.toBeInTheDocument();
    // Everything a student uses is still there.
    expect(within(rail()).getByShadowRole("link", { name: ptBR.nav.selection })).toBeInTheDocument();
  });

  it("keeps the full menu for a curator", () => {
    const hrefs = visibleGroups(GROUPS, true).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain("/app/importar");
    expect(hrefs).toContain("/app/admin/classes");
  });

  it("gives every destination its own glyph", () => {
    // In the collapsed rail the glyph is the whole label; two alike are one
    // unlabelled choice between two screens.
    const icons = GROUPS.flatMap((g) => g.items.map((i) => i.icon));
    expect(new Set(icons).size).toBe(icons.length);
  });
});
