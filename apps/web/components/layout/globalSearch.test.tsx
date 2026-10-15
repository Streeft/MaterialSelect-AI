import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GlobalSearchButton } from "./GlobalSearch";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/api", () => ({
  getBillingStatus: () =>
    Promise.resolve({
      active: true,
      status: null,
      current_period_end: null,
      access_mode: "subscription",
      has_access: true,
      can_edit_catalog: true,
    }),
  listMaterials: () =>
    Promise.resolve([
      { id: 7, name: "Aço inoxidável 304", class_name: "Metais" },
      { id: 8, name: "Alumínio 6061", class_name: "Metais" },
    ]),
  listProcesses: () => Promise.resolve([{ slug: "fundicao", name: "Fundição em areia" }]),
  listNotebooks: () => Promise.resolve([{ id: 3, title: "Estudo de bielas", emoji: "📓" }]),
  listStudies: () => Promise.resolve([{ id: 5, name: "Eixo leve" }]),
}));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <input aria-label="campo de texto" />
      <GlobalSearchButton />
    </QueryClientProvider>,
  );
}

beforeEach(() => push.mockClear());

describe("GlobalSearch (D-129)", () => {
  it("opens with Ctrl+K, lists the screens first and closes with Escape", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    const dialog = screen.getByRole("dialog", { name: ptBR.palette.title });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("option", { name: new RegExp(ptBR.nav.selection) })).toBeInTheDocument();
    // No query: the catalogue is not offered as a suggestion.
    expect(screen.queryByRole("option", { name: /Alumínio/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("finds a material ignoring case and accents, and opens it with Enter", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: new RegExp(ptBR.palette.open) }));
    const input = screen.getByRole("combobox");
    await user.type(input, "ACO inox");
    expect(await screen.findByRole("option", { name: /Aço inoxidável 304/ })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/app/materiais/7");
  });

  it("moves the highlight with the arrow keys and reports it by aria-activedescendant", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("/");
    const input = screen.getByRole("combobox");
    await user.type(input, "metais");
    const options = await screen.findAllByRole("option");
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(input).toHaveAttribute("aria-activedescendant", options[0]!.id);
    await user.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", options[1]!.id);
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/app/materiais/8");
  });

  it("says so when nothing matches", async () => {
    const user = userEvent.setup();
    setup();
    await user.keyboard("{Control>}k{/Control}");
    await user.type(screen.getByRole("combobox"), "zzzz");
    expect(await screen.findByText(ptBR.palette.empty)).toBeInTheDocument();
  });

  it("does not steal the slash while the reader types in a field", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByLabelText("campo de texto"));
    await user.keyboard("a/b");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("campo de texto")).toHaveValue("a/b");
  });

  it("has no accessibility violations while open", async () => {
    const user = userEvent.setup();
    const { container } = setup();
    await user.keyboard("{Control>}k{/Control}");
    await screen.findByRole("dialog");
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
    expect(container).toBeTruthy();
  });
});
