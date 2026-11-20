import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render as renderPlain, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnnouncerProvider } from "@/components/ui/Announcer";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { ptBR } from "@/lib/i18n";
import { OPEN_TRAY_EVENT } from "@/lib/tray";
import type { Tray as TrayData, TrayItem } from "@/lib/types";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { renderWithQuery } from "@/lib/testing/queryWrapper";
import { TakeToTrayButton } from "./AddToTray";
import { Tray } from "./Tray";
import { TrayButton } from "./TrayButton";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
const api = vi.hoisted(() => ({
  getTray: vi.fn(),
  putTrayItems: vi.fn(),
  updateTrayItem: vi.fn(),
  removeTrayItem: vi.fn(),
  clearTray: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const t = ptBR.tray;
const TOOLS = [
  { slug: "dimensionar", label: "Dimensionar", route: "/app/dimensionar" },
  { slug: "custo", label: "Custo", route: "/app/custo" },
];

function item(over: Partial<TrayItem>): TrayItem {
  return {
    id: 1,
    kind: "material",
    compartment: "material",
    position: 0,
    record_id: 7,
    tool: null,
    name: "Pinho",
    detail: "Naturais",
    href: "/app/materiais/7",
    unavailable: false,
    ...over,
  };
}
const tray = (items: TrayItem[]): TrayData => ({ items, tools: TOOLS, max_items: 40 });
const STEEL = item({ id: 2, record_id: 9, name: "Aço 1020", detail: "Metais", href: "/app/materiais/9" });
const COST = item({ id: 3, kind: "tool", compartment: "ferramenta", record_id: null, tool: "custo", name: "Custo", detail: null, href: "/app/custo" });

function renderTray(extra?: React.ReactNode) {
  return renderWithQuery(
    <SnackbarProvider>
      <AnnouncerProvider>
        <TrayButton />
        {extra}
        <Tray />
      </AnnouncerProvider>
    </SnackbarProvider>,
  );
}

async function openPanel() {
  act(() => void window.dispatchEvent(new Event(OPEN_TRAY_EVENT)));
  return screen.findByRole("dialog", { name: t.title });
}

afterEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("a bandeja (D-258)", () => {
  it("o botão diz quantos itens há, e não mostra número enquanto não sabe", async () => {
    let resolve!: (value: TrayData) => void;
    api.getTray.mockReturnValue(new Promise<TrayData>((r) => (resolve = r)));
    renderTray();
    expect(screen.getByRole("button", { name: t.title })).toBeInTheDocument();
    expect(document.querySelector(".ds-tray-count")).toBeNull();
    await act(async () => resolve(tray([item({}), STEEL])));
    expect(await screen.findByRole("button", { name: t.open(2) })).toBeInTheDocument();
    expect(document.querySelector(".ds-tray-count")).toHaveTextContent("2");
  });

  it("o painel mostra os três compartimentos, e cada coisa abre onde o servidor disse", async () => {
    api.getTray.mockResolvedValue(tray([item({}), item({ ...STEEL, compartment: "fixacao" }), COST]));
    const user = userEvent.setup();
    renderTray();
    await user.click(await screen.findByRole("button", { name: t.open(3) }));
    const panel = await screen.findByRole("dialog", { name: t.title });

    const materials = within(panel).getByRole("region", { name: t.compartments.material });
    expect(within(materials).getByRole("link", { name: "Pinho" })).toHaveAttribute("href", "/app/materiais/7");
    const fixings = within(panel).getByRole("region", { name: t.compartments.fixacao });
    expect(within(fixings).getByRole("link", { name: "Aço 1020" })).toBeInTheDocument();
    const tools = within(panel).getByRole("region", { name: t.compartments.ferramenta });
    expect(within(tools).getByRole("link", { name: "Custo" })).toHaveAttribute("href", "/app/custo");
    // Two readable materials: they can be compared, by their ids.
    expect(within(panel).getByRole("link", { name: t.compare })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/app\/comparar\?materiais=/),
    );
    expect(describeViolations(await findA11yViolations(panel))).toBe("");
  });

  it("vazia, diz como pôr algo nela", async () => {
    api.getTray.mockResolvedValue(tray([]));
    renderTray();
    const panel = await openPanel();
    expect(await within(panel).findByText(t.empty)).toBeInTheDocument();
    expect(within(panel).getByText(t.compartmentEmpty.fixacao)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: t.clear })).not.toBeInTheDocument();
  });

  it("um material vira fixação pelo menu dele", async () => {
    api.getTray.mockResolvedValue(tray([item({})]));
    api.updateTrayItem.mockResolvedValue(tray([item({ compartment: "fixacao" })]));
    const user = userEvent.setup();
    renderTray();
    const panel = await openPanel();
    await user.click(await within(panel).findByRole("button", { name: t.itemMenu("Pinho") }));
    await user.click(await screen.findByRole("menuitem", { name: t.moveTo(t.compartments.fixacao) }));
    await waitFor(() => expect(api.updateTrayItem).toHaveBeenCalledWith(1, { compartment: "fixacao" }));
    const fixings = await within(panel).findByRole("region", { name: t.compartments.fixacao });
    expect(await within(fixings).findByRole("link", { name: "Pinho" })).toBeInTheDocument();
  });

  it("tirar é na hora, e Desfazer devolve ao mesmo compartimento", async () => {
    const fixing = item({ compartment: "fixacao" });
    api.getTray.mockResolvedValue(tray([fixing]));
    api.removeTrayItem.mockResolvedValue(tray([]));
    api.putTrayItems.mockResolvedValue(tray([fixing]));
    const user = userEvent.setup();
    renderTray();
    const panel = await openPanel();
    await user.click(await within(panel).findByRole("button", { name: t.itemMenu("Pinho") }));
    await user.click(await screen.findByRole("menuitem", { name: t.remove }));
    await waitFor(() => expect(api.removeTrayItem).toHaveBeenCalledWith(1));
    // Said inside the panel, where its "Desfazer" can be reached: the panel is modal.
    const status = await within(panel).findByRole("status");
    expect(status).toHaveTextContent(t.removed("Pinho"));

    await user.click(within(panel).getByRole("button", { name: ptBR.snackbar.undo }));
    await waitFor(() =>
      expect(api.putTrayItems).toHaveBeenCalledWith([{ material_id: 7, compartment: "fixacao" }]),
    );
  });

  it("uma calculadora entra pelo painel, e só as que ainda não estão lá são oferecidas", async () => {
    api.getTray.mockResolvedValue(tray([COST]));
    api.putTrayItems.mockResolvedValue(tray([COST]));
    const user = userEvent.setup();
    renderTray();
    const panel = await openPanel();
    await user.click(await within(panel).findByRole("button", { name: t.addTool }));
    expect(screen.queryByRole("menuitem", { name: "Custo" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("menuitem", { name: "Dimensionar" }));
    await waitFor(() => expect(api.putTrayItems).toHaveBeenCalledWith([{ tool: "dimensionar" }]));
  });

  it("um material que saiu do catálogo fica, dito em palavras, sem link", async () => {
    api.getTray.mockResolvedValue(
      tray([item({ name: "Material indisponível", detail: null, href: null, unavailable: true })]),
    );
    renderTray();
    const panel = await openPanel();
    expect(await within(panel).findByText(t.unavailable)).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: "Material indisponível" })).not.toBeInTheDocument();
  });

  it("esvaziar tem Desfazer, que devolve o que podia ser lido", async () => {
    api.getTray.mockResolvedValue(tray([item({}), COST]));
    api.clearTray.mockResolvedValue(tray([]));
    api.putTrayItems.mockResolvedValue(tray([item({}), COST]));
    const user = userEvent.setup();
    renderTray();
    const panel = await openPanel();
    await user.click(await within(panel).findByRole("button", { name: t.clear }));
    await waitFor(() => expect(api.clearTray).toHaveBeenCalled());
    await user.click(await within(panel).findByRole("button", { name: ptBR.snackbar.undo }));
    await waitFor(() =>
      expect(api.putTrayItems).toHaveBeenCalledWith([
        { material_id: 7, compartment: "material" },
        { tool: "custo", compartment: "ferramenta" },
      ]),
    );
  });

  it("a recusa do servidor aparece no painel", async () => {
    api.getTray.mockResolvedValue(tray([item({})]));
    api.removeTrayItem.mockRejectedValue(Object.assign(new Error("fora do ar"), { status: 503 }));
    const user = userEvent.setup();
    renderTray();
    const panel = await openPanel();
    await user.click(await within(panel).findByRole("button", { name: t.itemMenu("Pinho") }));
    await user.click(await screen.findByRole("menuitem", { name: t.remove }));
    expect(await within(panel).findByRole("alert")).toBeInTheDocument();
  });
});

describe('"Levar para a bandeja" (D-258)', () => {
  const target = { kind: "material" as const, id: 9, name: "Aço 1020" };

  it("leva, avisa com a porta para a bandeja, e o botão passa a dizer que já está lá", async () => {
    api.getTray.mockResolvedValue(tray([]));
    api.putTrayItems.mockResolvedValue(tray([STEEL]));
    const user = userEvent.setup();
    renderTray(<TakeToTrayButton target={target} />);
    const button = await screen.findByRole("button", { name: t.takeNamed("Aço 1020") });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await user.click(button);
    await waitFor(() => expect(api.putTrayItems).toHaveBeenCalledWith([{ material_id: 9 }]));
    expect(await screen.findByText(t.taken("Aço 1020"))).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Aço 1020: na bandeja/ })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: t.show }));
    expect(await screen.findByRole("dialog", { name: t.title })).toBeInTheDocument();
  });

  it("o que já está lá não é pedido de novo ao servidor", async () => {
    api.getTray.mockResolvedValue(tray([STEEL]));
    const user = userEvent.setup();
    renderTray(<TakeToTrayButton target={target} />);
    await user.click(await screen.findByRole("button", { name: /Aço 1020: na bandeja/ }));
    expect(await screen.findByText(t.already("Aço 1020"))).toBeInTheDocument();
    expect(api.putTrayItems).not.toHaveBeenCalled();
  });

  it("fora do app (sem o cache de dados) o comando não é oferecido, e nada quebra", () => {
    const { container } = renderPlain(<TakeToTrayButton target={target} />);
    expect(container).toBeEmptyDOMElement();
  });
});
