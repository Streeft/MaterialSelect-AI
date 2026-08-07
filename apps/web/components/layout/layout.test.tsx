import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppHeader } from "./AppHeader";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";

// The header reads the route to say where the reader is; nothing else about
// Next's router matters here.
const route = { pathname: "/" };
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

beforeEach(() => {
  route.pathname = "/";
});

describe("AppHeader", () => {
  it("groups the eight links under what someone came here to do", () => {
    render(<AppHeader />);
    const nav = screen.getByRole("navigation", { name: ptBR.ui.mainNav });

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
    render(<AppHeader />);
    const nav = screen.getByRole("navigation", { name: ptBR.ui.mainNav });

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
    render(<AppHeader />);
    const nav = screen.getByRole("navigation", { name: ptBR.ui.mainNav });

    expect(within(nav).getByRole("link", { name: ptBR.nav.classes })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens the drawer, closes it with Esc and gives the focus back", async () => {
    const user = userEvent.setup();
    render(<AppHeader />);

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

  it("has no accessibility violations, drawer open or closed", async () => {
    const user = userEvent.setup();
    const { container } = render(<AppHeader />);

    let violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);

    await user.click(screen.getByRole("button", { name: ptBR.ui.openMenu }));
    violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
