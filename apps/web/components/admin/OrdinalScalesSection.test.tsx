import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { curadoriaText } from "@/lib/i18n-curadoria";
import type { OrdinalProperty, OrdinalScale, OrdinalScaleUpdate } from "@/lib/types";

const t = curadoriaText.ordinalScale;

const PROPERTY: OrdinalProperty = {
  slug: "durabilidade-agua-doce",
  name: "Durabilidade em água doce",
  description: null,
  kind: "ORDINAL",
  levels: ["Pobre", "Aceitável", "Bom"],
  scale_text: "Pobre < Aceitável < Bom",
  is_demo: false,
};

const level = (
  id: number,
  label: string,
  rank: number,
  extra: Partial<OrdinalScale["levels"][number]> = {},
) => ({ id, label, rank, value_count: 0, study_count: 0, scenario_count: 0, ...extra });

let scale: OrdinalScale;
const getOrdinalScale = vi.fn<(slug: string) => Promise<OrdinalScale>>();
const updateOrdinalScale = vi.fn<(slug: string, body: OrdinalScaleUpdate) => Promise<OrdinalScale>>();

vi.mock("@/lib/api", () => ({
  listOrdinalProperties: () => Promise.resolve([PROPERTY]),
  getOrdinalScale: (slug: string) => getOrdinalScale(slug),
  updateOrdinalScale: (slug: string, body: OrdinalScaleUpdate) => updateOrdinalScale(slug, body),
}));

import { OrdinalScalesSection } from "./OrdinalScalesSection";

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <OrdinalScalesSection />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { user, ...view };
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: t.actionFor(PROPERTY.name) }));
  return screen.findByRole("dialog", { name: t.dialogTitle(PROPERTY.name) });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  getOrdinalScale.mockReset();
  updateOrdinalScale.mockReset();
  scale = {
    slug: PROPERTY.slug,
    name: PROPERTY.name,
    description: null,
    scale_text: PROPERTY.scale_text,
    is_demo: false,
    levels: [
      level(1, "Pobre", 0, { value_count: 2 }),
      level(2, "Aceitável", 1),
      level(3, "Bom", 2),
    ],
  };
  getOrdinalScale.mockImplementation(async () => scale);
  updateOrdinalScale.mockImplementation(async () => scale);
});
afterEach(() => vi.useRealTimers());

describe("admin: escala de uma propriedade ordinal (D-251, ORD-c)", () => {
  it("lista as propriedades ordinais com a escala escrita do pior ao melhor", async () => {
    setup();
    expect(await screen.findByText("Pobre < Aceitável < Bom")).toBeInTheDocument();
  });

  it("mostra o que depende de cada nível e liga só as edições que o servidor aceita", async () => {
    const { user } = setup();
    const dialog = await open(user);
    // "Pobre" is held by two materials: it cannot be removed, and the reason is written.
    expect(within(dialog).getByText(new RegExp(t.held(2)))).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: t.remove("Pobre") })).toBeDisabled();
    // The others are free.
    expect(within(dialog).getByRole("button", { name: t.remove("Bom") })).toBeEnabled();
    // Nothing changed: nothing to save.
    expect(within(dialog).getByRole("button", { name: t.save })).toBeDisabled();
  });

  it("um nível pedido por um estudo não se renomeia e trava a ordem", async () => {
    scale.levels = [level(1, "Pobre", 0), level(2, "Aceitável", 1, { study_count: 1 }), level(3, "Bom", 2)];
    const { user } = setup();
    const dialog = await open(user);
    expect(within(dialog).getByText(t.lockedOrder)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(new RegExp(`^${t.levelLabel(2)}`))).toBeDisabled();
    expect(within(dialog).getByText(new RegExp(t.asked(1, 0)))).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: t.moveDown("Pobre") })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: t.remove("Aceitável") })).toBeDisabled();
  });

  it("insere um nível novo e manda a escala inteira, com id nos que já existiam", async () => {
    const { user } = setup();
    const dialog = await open(user);
    await user.click(within(dialog).getByRole("button", { name: t.add }));
    const fresh = within(dialog).getByLabelText(new RegExp(`^${t.levelLabel(4)}`));
    await user.type(fresh, "Excelente");
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    await waitFor(() => expect(updateOrdinalScale).toHaveBeenCalledTimes(1));
    expect(updateOrdinalScale).toHaveBeenCalledWith(PROPERTY.slug, {
      levels: [
        { id: 1, label: "Pobre" },
        { id: 2, label: "Aceitável" },
        { id: 3, label: "Bom" },
        { label: "Excelente" },
      ],
    });
    expect(await screen.findByText(t.saved(PROPERTY.name))).toBeInTheDocument();
  });

  it("reordena sem estudo pedindo, renomeia e manda só o que mudou no nome e na descrição", async () => {
    const { user } = setup();
    const dialog = await open(user);
    await user.click(within(dialog).getByRole("button", { name: t.moveUp("Bom") }));
    const second = within(dialog).getByLabelText(new RegExp(`^${t.levelLabel(2)}`));
    expect(second).toHaveValue("Bom");
    await user.clear(second);
    await user.type(second, "Muito bom");
    await user.type(within(dialog).getByLabelText(new RegExp(`^${t.description}`)), "Texto.");
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    await waitFor(() => expect(updateOrdinalScale).toHaveBeenCalled());
    expect(updateOrdinalScale).toHaveBeenCalledWith(PROPERTY.slug, {
      levels: [
        { id: 1, label: "Pobre" },
        { id: 3, label: "Muito bom" },
        { id: 2, label: "Aceitável" },
      ],
      description: "Texto.",
    });
  });

  it("recusa no formulário nome em branco, repetido e escala com um nível só, sem enviar", async () => {
    const { user } = setup();
    const dialog = await open(user);
    // Duplicate (case-insensitive).
    const first = within(dialog).getByLabelText(new RegExp(`^${t.levelLabel(1)}`));
    await user.clear(first);
    await user.type(first, "bom");
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    expect(await within(dialog).findByText(t.duplicate)).toBeInTheDocument();
    // Blank.
    await user.clear(first);
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    expect(await within(dialog).findByText(t.blank)).toBeInTheDocument();
    expect(updateOrdinalScale).not.toHaveBeenCalled();
  });

  it("diz o motivo que o servidor deu quando recusa", async () => {
    updateOrdinalScale.mockRejectedValue(
      Object.assign(new Error("“Bom” é pedido por 1 estudo salvo: renomeá-lo deixaria esses pedidos sem nível."), {
        status: 409,
      }),
    );
    const { user } = setup();
    const dialog = await open(user);
    await user.click(within(dialog).getByRole("button", { name: t.remove("Bom") }));
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    expect(await within(dialog).findByText(/é pedido por 1 estudo salvo/)).toBeInTheDocument();
  });

  it("não tem violação de acessibilidade com o editor aberto", async () => {
    const { user } = setup();
    const dialog = await open(user);
    const violations = await findA11yViolations(dialog);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});
