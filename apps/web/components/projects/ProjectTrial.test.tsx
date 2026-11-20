import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnnouncerProvider } from "@/components/ui/Announcer";
import { ptBR } from "@/lib/i18n";
import type { AssemblyTrial, PartTrial } from "@/lib/types";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { renderWithQuery } from "@/lib/testing/queryWrapper";
import { ProjectTrial } from "./ProjectTrial";

const api = vi.hoisted(() => ({ getAssemblyTrial: vi.fn() }));
vi.mock("@/lib/api", () => api);

const t = ptBR.projects.trial;

const LIMIT = { kind: "limite", required_value: null, declared_value: null, unit: null, detail: null } as const;

function part(over: Partial<PartTrial>): PartTrial {
  return {
    part_id: 1,
    name: "Tampo",
    status: "passa",
    status_label: "Passa em todos os requisitos",
    reason: null,
    material_name: "Pinho",
    study: { id: 3, name: "Leve e rígido" },
    requirements: [{ label: "Densidade ≤ 5 g/cm³", verdict: "passa", verdict_label: "Passa", ...LIMIT }],
    ...over,
  };
}
function answer(over: Partial<AssemblyTrial>): AssemblyTrial {
  return {
    assembly_id: 7,
    solved: false,
    verdict_label: "Ainda não solucionado",
    summary: "De 3: 1 peça passa, 1 não passa, 1 não pôde ser aprovada.",
    part_count: 3,
    passed_count: 1,
    failed_count: 1,
    pending_count: 1,
    parts: [
      part({}),
      part({
        part_id: 2,
        name: "Perna",
        status: "falha",
        status_label: "Não passa",
        material_name: "Aço 1020",
        requirements: [
          { label: "Densidade ≤ 5 g/cm³", verdict: "falha", verdict_label: "Não passa", ...LIMIT },
          { label: "Fadiga ≥ 1 MPa", verdict: "sem_dado", verdict_label: "Sem dado", ...LIMIT },
        ],
      }),
      part({
        part_id: 3,
        name: "Prego",
        status: "sem_estudo",
        status_label: "Sem requisitos",
        reason: "A peça não tem um estudo da Seleção: não há requisito contra o qual ensaiar.",
        study: null,
        requirements: [],
      }),
    ],
    method_note: "Dado ausente não aprova.",
    ...over,
  };
}

function renderTrial(stamp = "a", hasParts = true) {
  return renderWithQuery(
    <AnnouncerProvider>
      <ProjectTrial assemblyId={7} stamp={stamp} hasParts={hasParts} />
    </AnnouncerProvider>,
  );
}

afterEach(() => api.getAssemblyTrial.mockReset());

describe("o ensaio do projeto (D-260)", () => {
  it("só pergunta quando se pede, e imprime o veredito do servidor por peça e por requisito", async () => {
    api.getAssemblyTrial.mockResolvedValue(answer({}));
    const user = userEvent.setup();
    const { container } = renderTrial();
    expect(api.getAssemblyTrial).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: t.run }));

    const result = await screen.findByRole("region", { name: t.result });
    expect(within(result).getByText("Ainda não solucionado")).toHaveAttribute("data-solved", "false");
    expect(within(result).getByText("De 3: 1 peça passa, 1 não passa, 1 não pôde ser aprovada.")).toBeInTheDocument();

    const leg = within(within(result).getByRole("list", { name: t.requirementsOf("Perna") })).getAllByRole("listitem");
    expect(leg.map((li) => li.textContent)).toEqual(["Densidade ≤ 5 g/cm³Não passa", "Fadiga ≥ 1 MPaSem dado"]);
    // What could not be tried says why, in the server's words, and lists no requirement.
    expect(within(result).getByText(/não há requisito contra o qual ensaiar/)).toBeInTheDocument();
    expect(within(result).queryByRole("list", { name: t.requirementsOf("Prego") })).toBeNull();
    expect(within(result).getAllByRole("link", { name: t.openStudy("Leve e rígido") })[0]).toHaveAttribute(
      "href",
      "/app/selecao?estudo=3",
    );
    expect(within(result).getByText("Dado ausente não aprova.")).toBeInTheDocument();
    expect(api.getAssemblyTrial).toHaveBeenCalledWith(7);

    const found = await findA11yViolations(container);
    expect(found, describeViolations(found)).toEqual([]);
  });

  it("o carimbo Solucionado é o que o servidor disse, e é anunciado", async () => {
    api.getAssemblyTrial.mockResolvedValue(
      answer({ solved: true, verdict_label: "Solucionado", summary: "A peça passa em todos os requisitos.", parts: [part({})] }),
    );
    const user = userEvent.setup();
    renderTrial();
    await user.click(screen.getByRole("button", { name: t.run }));
    expect(await screen.findByText("Solucionado")).toHaveAttribute("data-solved", "true");
    await waitFor(() =>
      expect(screen.getByText("Solucionado. A peça passa em todos os requisitos.")).toBeInTheDocument(),
    );
  });

  it("depois de pedido, acompanha o projeto: uma mudança pergunta de novo, e o botão também", async () => {
    api.getAssemblyTrial.mockResolvedValue(answer({}));
    const user = userEvent.setup();
    const view = renderTrial("a");
    await user.click(screen.getByRole("button", { name: t.run }));
    await screen.findByRole("region", { name: t.result });
    expect(api.getAssemblyTrial).toHaveBeenCalledTimes(1);

    view.rerender(
      <AnnouncerProvider>
        <ProjectTrial assemblyId={7} stamp="b" hasParts />
      </AnnouncerProvider>,
    );
    await waitFor(() => expect(api.getAssemblyTrial).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("button", { name: t.again }));
    await waitFor(() => expect(api.getAssemblyTrial).toHaveBeenCalledTimes(3));
  });

  it("sem peças não há o que ensaiar; e a recusa do servidor aparece", async () => {
    const empty = renderTrial("a", false);
    expect(screen.getByText(t.empty)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.run })).toBeNull();
    empty.unmount();

    api.getAssemblyTrial.mockRejectedValue(new Error("fora do ar"));
    const user = userEvent.setup();
    renderTrial();
    await user.click(screen.getByRole("button", { name: t.run }));
    expect(await screen.findByText(t.error)).toBeInTheDocument();
  });

  it("no caso de carga, mostra as duas massas que o servidor mandou e o motivo do que falta (D-261)", async () => {
    api.getAssemblyTrial.mockResolvedValue(
      answer({
        parts: [
          part({
            requirements: [
              {
                label: "Caso de carga: Tirante em tração",
                verdict: "falha",
                verdict_label: "Não passa",
                kind: "carga",
                required_value: 2.5,
                declared_value: 1.25,
                unit: "kg",
                detail: null,
              },
              {
                label: "Caso de carga: Viga em flexão",
                verdict: "sem_dado",
                verdict_label: "Sem dado",
                kind: "carga",
                required_value: null,
                declared_value: null,
                unit: "kg",
                detail: "O material não tem: Módulo de Young.",
              },
            ],
          }),
        ],
      }),
    );
    const user = userEvent.setup();
    renderTrial();
    await user.click(screen.getByRole("button", { name: t.run }));
    const lines = within(await screen.findByRole("list", { name: t.requirementsOf("Tampo") })).getAllByRole("listitem");
    expect(lines[0]).toHaveTextContent("Massa mínima: 2,5 kg; massa informada: 1,25 kg.");
    expect(lines[0]).toHaveTextContent("Não passa");
    // An absent number is said as absent, never as zero.
    expect(lines[1]).toHaveTextContent(`${t.minimumUnknown}; ${t.declaredUnknown}.`);
    expect(lines[1]).toHaveTextContent("O material não tem: Módulo de Young.");
  });
});