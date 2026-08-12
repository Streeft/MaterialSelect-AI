import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppSidebar } from "./AppSidebar";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";

// The sidebar reads the route to say where the reader is; nothing else about
// Next's router matters here.
const route = { pathname: "/" };
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

beforeEach(() => {
  route.pathname = "/";
});

/** The rail's own navigation. The drawer's is a second, unnamed one. */
const rail = () => screen.getByRole("navigation", { name: ptBR.ui.mainNav });

describe("AppSidebar", () => {
  it("groups the eight links under what someone came here to do", () => {
    render(<AppSidebar />);
    const nav = rail();

    for (const group of [ptBR.nav.groupStudy, ptBR.nav.groupData, ptBR.nav.groupAdmin]) {
      expect(within(nav).getByRole("list", { name: group })).toBeInTheDocument();
    }

    const study = within(nav).getByRole("list", { name: ptBR.nav.groupStudy });
    expect(within(study).getByRole("link", { name: ptBR.nav.selection })).toBeInTheDocument();
    expect(within(study).getByRole("link", { name: ptBR.nav.maps })).toBeInTheDocument();
    expect(within(study).getByRole("link", { name: ptBR.nav.compare })).toBeInTheDocument();
  });

  it("announces the current page, and only that one", () => {
    route.pathname = "/mapas";
    render(<AppSidebar />);
    const nav = rail();

    expect(within(nav).getByRole("link", { name: ptBR.nav.maps })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: ptBR.nav.catalog })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps a nested route inside the section it belongs to", () => {
    route.pathname = "/admin/classes";
    render(<AppSidebar />);

    expect(within(rail()).getByRole("link", { name: ptBR.nav.classes })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("does not mark the home link on every route", () => {
    // `/` matches only itself; `startsWith("/")` would light it up everywhere.
    route.pathname = "/catalogo";
    render(<AppSidebar />);

    expect(within(rail()).getByRole("link", { name: ptBR.nav.home })).not.toHaveAttribute(
      "aria-current",
    );
  });

  describe("collapsing the rail", () => {
    it("keeps every destination reachable by name", async () => {
      // The label is unpainted, never removed: a link whose text is gone is a
      // link with no accessible name, and the rail would become eight unnamed
      // glyphs for anyone reading it aloud.
      const user = userEvent.setup();
      render(<AppSidebar />);

      const toggle = screen.getByRole("button", { name: ptBR.ui.collapseSidebar });
      expect(toggle).toHaveAttribute("aria-expanded", "true");

      await user.click(toggle);

      const nav = rail();
      for (const label of [ptBR.nav.selection, ptBR.nav.maps, ptBR.nav.catalog, ptBR.nav.classes]) {
        expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
      }
      // The groups still name their lists, so the structure survives too.
      expect(within(nav).getByRole("list", { name: ptBR.nav.groupStudy })).toBeInTheDocument();
    });

    it("flips the control's own name and state", async () => {
      const user = userEvent.setup();
      render(<AppSidebar />);

      await user.click(screen.getByRole("button", { name: ptBR.ui.collapseSidebar }));

      const toggle = screen.getByRole("button", { name: ptBR.ui.expandSidebar });
      expect(toggle).toHaveAttribute("aria-expanded", "false");

      await user.click(toggle);
      expect(screen.getByRole("button", { name: ptBR.ui.collapseSidebar })).toBeInTheDocument();
    });

    it("gives the collapsed links a tooltip, since the glyph is all that is painted", async () => {
      const user = userEvent.setup();
      render(<AppSidebar />);
      await user.click(screen.getByRole("button", { name: ptBR.ui.collapseSidebar }));

      expect(within(rail()).getByRole("link", { name: ptBR.nav.maps })).toHaveAttribute(
        "title",
        ptBR.nav.maps,
      );
    });

    it("has no accessibility violations while collapsed", async () => {
      const user = userEvent.setup();
      const { container } = render(<AppSidebar />);
      await user.click(screen.getByRole("button", { name: ptBR.ui.collapseSidebar }));

      const violations = await findA11yViolations(container);
      expect(violations, describeViolations(violations)).toEqual([]);
    });
  });

  describe("the drawer, on a narrow screen", () => {
    it("opens, closes with Esc and gives the focus back", async () => {
      const user = userEvent.setup();
      render(<AppSidebar />);

      const trigger = screen.getByRole("button", { name: ptBR.ui.openMenu });
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      await user.click(trigger);
      const drawer = screen.getByRole("dialog", { name: ptBR.ui.mainNav });
      expect(within(drawer).getByRole("link", { name: ptBR.nav.home })).toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(within(drawer).getByRole("button", { name: ptBR.ui.closeMenu })).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // The reader pressed Esc; the focus has to come back to what they opened,
      // not to the top of the document.
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("carries the same nine destinations as the rail", async () => {
      const user = userEvent.setup();
      render(<AppSidebar />);
      await user.click(screen.getByRole("button", { name: ptBR.ui.openMenu }));

      const drawer = screen.getByRole("dialog", { name: ptBR.ui.mainNav });
      for (const group of [ptBR.nav.groupStudy, ptBR.nav.groupData, ptBR.nav.groupAdmin]) {
        expect(within(drawer).getByRole("list", { name: group })).toBeInTheDocument();
      }
      expect(within(drawer).getAllByRole("link")).toHaveLength(10); // 9 + o wordmark
    });

    it("marks the current page inside the drawer too", async () => {
      route.pathname = "/importar";
      const user = userEvent.setup();
      render(<AppSidebar />);
      await user.click(screen.getByRole("button", { name: ptBR.ui.openMenu }));

      const drawer = screen.getByRole("dialog", { name: ptBR.ui.mainNav });
      expect(within(drawer).getByRole("link", { name: ptBR.nav.imports })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });
  });

  it("has no accessibility violations, drawer open or closed", async () => {
    const user = userEvent.setup();
    const { container } = render(<AppSidebar />);

    let violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);

    await user.click(screen.getByRole("button", { name: ptBR.ui.openMenu }));
    violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
