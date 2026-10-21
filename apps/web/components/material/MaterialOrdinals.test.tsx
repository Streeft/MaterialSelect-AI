import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fichaText } from "@/lib/i18n-ficha";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { emptyOrdinalValues, ordinalValues } from "./ordinalFixtures";

const t = fichaText.ordinals;

const api = vi.hoisted(() => ({ getMaterialOrdinals: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  getMaterialOrdinals: api.getMaterialOrdinals,
}));

const { MaterialOrdinals } = await import("./MaterialOrdinals");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MaterialOrdinals materialId={2} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.getMaterialOrdinals.mockReset();
});

describe("MaterialOrdinals (ORD-a, D-126)", () => {
  it("says it is loading", () => {
    api.getMaterialOrdinals.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByText(t.loading)).toBeInTheDocument();
  });

  it("says it failed, with a retry that asks again", async () => {
    api.getMaterialOrdinals.mockRejectedValueOnce(new Error("x"));
    mount();
    expect(await screen.findByText(t.error)).toBeInTheDocument();
    api.getMaterialOrdinals.mockResolvedValue(ordinalValues);
    await userEvent.click(screen.getByRole("button", { name: ptBR.ui.retry }));
    expect(await screen.findByText("Durabilidade em água doce")).toBeInTheDocument();
    expect(api.getMaterialOrdinals).toHaveBeenCalledTimes(2);
  });

  it("writes 'no ordinal property' instead of an empty list", async () => {
    api.getMaterialOrdinals.mockResolvedValue(emptyOrdinalValues);
    const { container } = mount();
    expect(await screen.findByText(t.none)).toBeInTheDocument();
    expect(screen.getByText(t.noneHint)).toBeInTheDocument();
    expect(container.querySelector("[data-ordinal]")).toBeNull();
  });

  it("shows the scale exactly as the catalogue has it and marks the level held", async () => {
    api.getMaterialOrdinals.mockResolvedValue(ordinalValues);
    const { container } = mount();
    await screen.findByText("Durabilidade em água doce");

    const block = container.querySelector('[data-ordinal="durabilidade_agua_doce"]') as HTMLElement;
    const scale = within(block).getByRole("list", {
      name: t.scaleLabel("Durabilidade em água doce"),
    });
    // Same levels, same order: the screen neither adds nor reorders a level.
    expect(within(scale).getAllByRole("listitem").map((li) => li.textContent?.replace(/\s*\(.*\)$/, ""))).toEqual(
      ordinalValues.values[0]!.scale,
    );
    const held = scale.querySelectorAll("[aria-current='true']");
    expect(held).toHaveLength(1);
    expect(held[0]!.textContent).toContain("Bom");
    expect(held[0]!.textContent).toContain(t.thisLevel);

    // The level is also a sentence, with its quality and source — not only a fill.
    expect(within(block).getByText(t.levelLabel)).toBeInTheDocument();
    expect(within(block).getByText(ptBR.quality.ESTIMADO)).toBeInTheDocument();
    expect(within(block).getByText(t.source("Dataset Demo MaterialSelect"))).toBeInTheDocument();
    expect(within(block).getByText(t.condition("Água doce, 20 °C."))).toBeInTheDocument();
    expect(within(block).getByText(t.demo)).toBeInTheDocument();
  });

  it("writes both kinds of 'no level' and never marks a level for them", async () => {
    api.getMaterialOrdinals.mockResolvedValue(ordinalValues);
    const { container } = mount();
    await screen.findByText("Durabilidade em ácido forte");

    const absent = container.querySelector('[data-ordinal="durabilidade_acido_forte"]') as HTMLElement;
    expect(absent.getAttribute("data-status")).toBe("ausente");
    expect(within(absent).getByText("Ausente na fonte (sem nível)")).toBeInTheDocument();
    expect(within(absent).getByText(t.absentHint)).toBeInTheDocument();
    expect(within(absent).getByText(ptBR.quality.AUSENTE)).toBeInTheDocument();
    expect(absent.querySelector("[aria-current]")).toBeNull();

    const noData = container.querySelector('[data-ordinal="durabilidade_solvente"]') as HTMLElement;
    expect(noData.getAttribute("data-status")).toBe("sem_dado");
    expect(within(noData).getByText("Sem dado cadastrado")).toBeInTheDocument();
    expect(within(noData).getByText(t.noDataHint)).toBeInTheDocument();
    expect(noData.querySelector("[aria-current]")).toBeNull();
    // The scale is still shown (it is the definition), with no level held on it.
    expect(within(noData).getAllByRole("listitem")).toHaveLength(5);
  });

  it("asks for the material it is on, once", async () => {
    api.getMaterialOrdinals.mockResolvedValue(ordinalValues);
    mount();
    await screen.findByText("Durabilidade em água doce");
    expect(api.getMaterialOrdinals).toHaveBeenCalledWith(2);
    expect(api.getMaterialOrdinals).toHaveBeenCalledTimes(1);
  });

  it("passes axe with the three states on screen", async () => {
    api.getMaterialOrdinals.mockResolvedValue(ordinalValues);
    const { container } = mount();
    await screen.findByText("Durabilidade em solvente orgânico");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("passes axe in the loading, failed and empty states", async () => {
    api.getMaterialOrdinals.mockResolvedValue(emptyOrdinalValues);
    const empty = mount();
    await screen.findByText(t.none);
    expect(await findA11yViolations(empty.container)).toEqual([]);
    empty.unmount();

    api.getMaterialOrdinals.mockRejectedValue(new Error("x"));
    const failed = mount();
    await screen.findByText(t.error);
    expect(await findA11yViolations(failed.container)).toEqual([]);
    failed.unmount();

    api.getMaterialOrdinals.mockReturnValue(new Promise(() => {}));
    const loading = mount();
    expect(await findA11yViolations(loading.container)).toEqual([]);
  });
});
