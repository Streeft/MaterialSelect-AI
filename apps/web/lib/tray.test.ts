import type { DragEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  TRAY_DRAG_EVENT,
  TRAY_DRAG_TYPE,
  carriesTrayTarget,
  isInTray,
  readTrayDrag,
  targetInput,
  trayDragProps,
  trayMaterials,
} from "./tray";
import type { Tray, TrayItem } from "./types";

/** A minimal DataTransfer: jsdom has none. */
function transfer(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    effectAllowed: "none",
    get types() {
      return [...data.keys()];
    },
    setData: (type: string, value: string) => void data.set(type, value),
    getData: (type: string) => data.get(type) ?? "",
  };
}
const dragEvent = (dataTransfer: ReturnType<typeof transfer>) =>
  ({ dataTransfer }) as unknown as DragEvent<HTMLElement>;

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

describe("arrastar para a bandeja (D-258)", () => {
  it("o que se arrasta leva tipo, id e nome, e nenhum valor de material", () => {
    const data = transfer();
    const heard = vi.fn();
    window.addEventListener(TRAY_DRAG_EVENT, heard);
    const props = trayDragProps({ kind: "material", id: 7, name: "Pinho" });
    props.onDragStart(dragEvent(data));

    expect(props.draggable).toBe(true);
    expect(JSON.parse(data.getData(TRAY_DRAG_TYPE))).toEqual({ kind: "material", id: 7, name: "Pinho" });
    // Outside the app the drop is just the name.
    expect(data.getData("text/plain")).toBe("Pinho");
    expect(data.effectAllowed).toBe("copy");
    expect((heard.mock.calls[0]![0] as CustomEvent).detail).toBe(true);

    props.onDragEnd();
    expect((heard.mock.calls[1]![0] as CustomEvent).detail).toBe(false);
    window.removeEventListener(TRAY_DRAG_EVENT, heard);
  });

  it("lê de volta o que foi arrastado e reconhece o tipo durante o arrasto", () => {
    const data = transfer({ [TRAY_DRAG_TYPE]: JSON.stringify({ kind: "process", id: 3, name: "Fundição" }) });
    expect(carriesTrayTarget(dragEvent(data))).toBe(true);
    expect(readTrayDrag(dragEvent(data))).toEqual({ kind: "process", id: 3, name: "Fundição" });
    expect(carriesTrayTarget(dragEvent(transfer({ "text/plain": "x" })))).toBe(false);
  });

  it.each([
    ["texto que não é JSON", "<b>oi</b>"],
    ["um tipo que não se carrega", JSON.stringify({ kind: "tool", id: 1, name: "Custo" })],
    ["um id que não é inteiro positivo", JSON.stringify({ kind: "material", id: "7; DROP", name: "x" })],
    ["um id negativo", JSON.stringify({ kind: "material", id: -1, name: "x" })],
    ["nada", ""],
  ])("recusa %s", (_what, raw) => {
    expect(readTrayDrag(dragEvent(transfer({ [TRAY_DRAG_TYPE]: raw })))).toBeNull();
  });

  it("um nome que não é texto vira vazio, e o resto vale", () => {
    const raw = JSON.stringify({ kind: "material", id: 7, name: { html: "x" } });
    expect(readTrayDrag(dragEvent(transfer({ [TRAY_DRAG_TYPE]: raw })))).toEqual({ kind: "material", id: 7, name: "" });
  });
});

describe("leituras da bandeja (D-258)", () => {
  it("sabe se um registro já está lá, por tipo e id", () => {
    const full = tray([item({}), item({ id: 2, kind: "process", record_id: 7, compartment: "ferramenta" })]);
    expect(isInTray(full, { kind: "material", id: 7, name: "" })).toBe(true);
    expect(isInTray(full, { kind: "process", id: 7, name: "" })).toBe(true);
    expect(isInTray(full, { kind: "material", id: 8, name: "" })).toBe(false);
    expect(isInTray(undefined, { kind: "material", id: 7, name: "" })).toBe(false);
  });

  it("os materiais utilizáveis são os que ainda podem ser lidos, fixações incluídas", () => {
    const full = tray([
      item({}),
      item({ id: 2, record_id: 8, compartment: "fixacao", name: "Aço" }),
      item({ id: 3, record_id: 9, unavailable: true }),
      item({ id: 4, kind: "tool", record_id: null, tool: "custo", compartment: "ferramenta" }),
    ]);
    expect(trayMaterials(full).map((i) => i.name)).toEqual(["Pinho", "Aço"]);
  });

  it("o pedido leva só o alvo", () => {
    expect(targetInput({ kind: "material", id: 7, name: "Pinho" })).toEqual({ material_id: 7 });
    expect(targetInput({ kind: "process", id: 3, name: "Fundição" })).toEqual({ process_id: 3 });
  });
});
