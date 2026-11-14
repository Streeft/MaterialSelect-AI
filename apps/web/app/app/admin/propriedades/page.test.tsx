import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";
import { suggestText } from "@/lib/i18n-suggest";
import type { SuggestionsOut } from "@/lib/types";

const deleteProperty = vi.fn().mockResolvedValue(undefined);
const createProperty = vi.fn().mockResolvedValue({});

const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  ApiError: class ApiError extends Error {},
  createProperty: (p: unknown) => createProperty(p),
  deleteProperty: (id: number) => deleteProperty(id),
  listProperties: () =>
    Promise.resolve([
      { id: 1, name: "Densidade", slug: "densidade", category: "FISICA", canonical_unit: "kg/m**3", symbol: "ρ", value_count: 0 },
    ]),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/admin/propriedades" }));
vi.mock("@/components/auth/CatalogReadOnlyNotice", () => ({ CatalogReadOnlyNotice: () => null }));

import PropertiesAdminPage from "./page";

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <SnackbarProvider>
        <PropertiesAdminPage />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { user, ...view };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  deleteProperty.mockClear();
  createProperty.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("admin/propriedades (D-222)", () => {
  it("valida nome, repetição e unidade no campo, sem enviar", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await user.click(screen.getByRole("button", { name: ptBR.admin.newProperty }));
    expect(screen.getByText(ptBR.admin.errorNameRequired)).toBeInTheDocument();
    expect(screen.getByText(ptBR.admin.errorUnitRequired)).toBeInTheDocument();

    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), "densidade");
    expect(screen.getByText(ptBR.admin.errorPropertyDuplicate)).toBeInTheDocument();
    expect(createProperty).not.toHaveBeenCalled();
  });

  it("confirma e deixa desfazer antes de excluir", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Excluir: Densidade" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Excluir" }));
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
    expect(deleteProperty).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(8100));
    expect(deleteProperty).toHaveBeenCalledWith(1);
  });

  it("não tem violações de acessibilidade", async () => {
    const { container } = setup();
    await screen.findAllByRole("row");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});

describe("admin/propriedades — Sugestão da IA (D-230b)", () => {
  const answer: SuggestionsOut = {
    tool: "admin_propriedades",
    summary: "Sugestões para a propriedade que você está editando.",
    suggestions: [
      {
        title: "Rascunho da descrição",
        body: "Um rascunho para a descrição; ajuste antes de gravar.",
        actions: [
          {
            type: "fill_text",
            label: "Preencher a descrição",
            field: "description",
            text: "Resistividade elétrica, expressa em ohm*m. Diga como é medida.",
          },
          { type: "open_route", label: "Ver o glossário", path: "/app/glossario" },
        ],
      },
    ],
    rejected: [],
    degraded: false,
    cached: false,
    notice: null,
    provider: "mock",
    simulated: true,
    disclaimer: "",
  };

  beforeEach(() => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
  });

  it("sem o nome o botão fica desligado e diz por quê; nada é perguntado", async () => {
    setup();
    await screen.findAllByRole("row");
    expect(screen.getByRole("button", { name: suggestText.button })).toBeDisabled();
    expect(screen.getByText(suggestText.needsName)).toBeInTheDocument();
    expect(suggest.fn).not.toHaveBeenCalled();
  });

  it("preenche a descrição sem gravar e manda a descrição ao servidor só quando a pessoa grava", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), "Resistividade elétrica");
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.admin.canonicalUnit}`)), "ohm*m");
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByRole("button", { name: "Preencher a descrição" });
    expect(suggest.fn).toHaveBeenCalledWith("admin_propriedades", {
      name: "Resistividade elétrica",
      canonical_unit: "ohm*m",
      description: "",
    });
    const field = screen.getByLabelText(new RegExp(`^${ptBR.form.description}`)) as HTMLTextAreaElement;
    expect(field.value).toBe("");

    await user.click(screen.getByRole("button", { name: "Preencher a descrição" }));
    expect(field.value).toBe("Resistividade elétrica, expressa em ohm*m. Diga como é medida.");
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    expect(field).toHaveAttribute("data-ai-changed", "true");
    expect(createProperty).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: ptBR.admin.newProperty }));
    expect(createProperty).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Resistividade elétrica",
        canonical_unit: "ohm*m",
        description: "Resistividade elétrica, expressa em ohm*m. Diga como é medida.",
      }),
    );
  });

  it("sem descrição escrita, a propriedade segue sendo enviada sem ela, como antes", async () => {
    const { user } = setup();
    await screen.findAllByRole("row");
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), "Resistividade elétrica");
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.admin.canonicalUnit}`)), "ohm*m");
    await user.click(screen.getByRole("button", { name: ptBR.admin.newProperty }));
    expect(createProperty).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
  });

  it("não tem violações de acessibilidade com o painel aberto", async () => {
    const { user, container } = setup();
    await screen.findAllByRole("row");
    await user.type(screen.getByLabelText(new RegExp(`^${ptBR.form.name}`)), "Resistividade elétrica");
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByRole("button", { name: "Preencher a descrição" });
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  }, 30_000);
});
