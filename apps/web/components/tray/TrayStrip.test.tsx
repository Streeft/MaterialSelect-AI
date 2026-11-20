import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import { TRAY_DRAG_TYPE } from "@/lib/tray";
import type { Tray, TrayItem } from "@/lib/types";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { renderWithQuery } from "@/lib/testing/queryWrapper";
import { TrayDropZone, TrayStrip } from "./TrayStrip";

const api = vi.hoisted(() => ({ getTray: vi.fn(), putTrayItems: vi.fn() }));
vi.mock("@/lib/api", () => api);

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
const tray = (items: TrayItem[]): Tray => ({ items, tools: [], max_items: 40 });
const STEEL = item({ id: 2, record_id: 9, name: "Aço 1020", compartment: "fixacao" });

/** What a drag carries: jsdom has no DataTransfer, and the handlers only read these. */
function transfer(payload: unknown) {
  const data = JSON.stringify(payload);
  return { types: [TRAY_DRAG_TYPE], getData: () => data, dropEffect: "none" };
}

afterEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

describe("a faixa da bandeja na bancada (D-259)", () => {
  it("mostra os materiais e as fixações que dá para ler, cada um com o comando ao lado", async () => {
    api.getTray.mockResolvedValue(
      tray([
        item({}),
        STEEL,
        item({ id: 3, kind: "tool", compartment: "ferramenta", record_id: null, tool: "custo", name: "Custo" }),
        item({ id: 4, record_id: 11, name: "Material indisponível", unavailable: true }),
      ]),
    );
    const run = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithQuery(
      <TrayStrip hint="Arraste para o mapa." actions={[{ label: "Destacar", describe: (m) => `Destacar ${m}`, run }]} />,
    );
    const strip = await screen.findByRole("group", { name: ptBR.tray.stripTitle });
    expect(within(strip).getAllByRole("listitem").map((li) => li.firstElementChild?.textContent)).toEqual(["Pinho", "Aço 1020"]);
    for (const chip of within(strip).getAllByRole("listitem")) expect(chip).toHaveAttribute("draggable", "true");

    await user.click(within(strip).getByRole("button", { name: "Destacar Aço 1020" }));
    expect(run).toHaveBeenCalledWith(9, "Aço 1020");
    const found = await findA11yViolations(container);
    expect(found, describeViolations(found)).toEqual([]);
  });

  it("um comando que não cabe agora diz o motivo e não age; um alternador diz o estado", async () => {
    api.getTray.mockResolvedValue(tray([item({}), STEEL]));
    const run = vi.fn();
    const user = userEvent.setup();
    renderWithQuery(
      <TrayStrip
        hint="x"
        actions={[
          {
            label: "Comparar",
            describe: (m) => `Comparar ${m}`,
            run,
            pressed: (id) => id === 9,
            disabledReason: (id) => (id === 7 ? "Já está na comparação." : undefined),
          },
        ]}
      />,
    );
    const blocked = await screen.findByRole("button", { name: "Comparar Pinho" });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(blocked).toHaveAttribute("title", "Já está na comparação.");
    await user.click(blocked);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Comparar Aço 1020" })).toHaveAttribute("aria-pressed", "true");
  });

  it("com a bandeja vazia, ou fora do app, não aparece", async () => {
    api.getTray.mockResolvedValue(tray([]));
    const { container } = renderWithQuery(<TrayStrip hint="x" actions={[]} />);
    await vi.waitFor(() => expect(api.getTray).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    const alone = render(<TrayStrip hint="x" actions={[]} />);
    expect(alone.container).toBeEmptyDOMElement();
  });
});

describe("onde se solta um material levado (D-259)", () => {
  it("aceita um material, mostra onde vai cair e entrega só o id e o nome", () => {
    const onMaterial = vi.fn();
    render(
      <TrayDropZone onMaterial={onMaterial}>
        <p>alvo</p>
      </TrayDropZone>,
    );
    const zone = screen.getByText("alvo").parentElement!;
    const carried = transfer({ kind: "material", id: 9, name: "Aço 1020", value: 210 });
    fireEvent.dragOver(zone, { dataTransfer: carried });
    expect(zone).toHaveAttribute("data-drop-over", "true");
    fireEvent.drop(zone, { dataTransfer: carried });
    expect(zone).not.toHaveAttribute("data-drop-over");
    expect(onMaterial).toHaveBeenCalledWith(9, "Aço 1020");
  });

  it("um processo, ou um arrasto que não é da bandeja, não é aceito", () => {
    const onMaterial = vi.fn();
    render(
      <TrayDropZone onMaterial={onMaterial}>
        <p>alvo</p>
      </TrayDropZone>,
    );
    const zone = screen.getByText("alvo").parentElement!;
    fireEvent.drop(zone, { dataTransfer: transfer({ kind: "process", id: 3, name: "Fundição" }) });
    fireEvent.dragOver(zone, { dataTransfer: { types: ["text/plain"], getData: () => "x" } });
    expect(zone).not.toHaveAttribute("data-drop-over");
    fireEvent.drop(zone, { dataTransfer: { types: ["text/plain"], getData: () => "x" } });
    expect(onMaterial).not.toHaveBeenCalled();
  });
});
