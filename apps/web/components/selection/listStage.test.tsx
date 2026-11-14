import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";

vi.mock("react-plotly.js", () => ({ default: () => null }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    listMaterials: vi.fn().mockResolvedValue([
      { id: 1, name: "Aço 1020", class_name: "Metais", class_slug: "metais" },
      { id: 2, name: "Alumínio 6061", class_name: "Metais", class_slug: "metais" },
    ]),
  };
});

import { StageList, type StageState, emptyLimitStage, listStage, toStagePayload } from "./StageList";

const t = ptBR.selection;

function Harness({
  initial,
  onStages,
}: {
  initial: StageState[];
  onStages?: (stages: StageState[]) => void;
}) {
  const [stages, setStages] = useState<StageState[]>(initial);
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <StageList
        stages={stages}
        properties={[]}
        classes={[]}
        onChange={(next) => {
          setStages(next);
          onStages?.(next);
        }}
      />
    </QueryClientProvider>
  );
}

describe("estágio de lista (D-232)", () => {
  it("manda só os ids, e nenhum campo dos outros tipos", () => {
    const payload = toStagePayload(listStage([4, 2, 9]));
    expect(payload).toMatchObject({ kind: "list", enabled: true, material_ids: [4, 2, 9] });
    expect(payload.root_group).toBeUndefined();
    expect(payload.class_slugs).toBeUndefined();
    expect(payload.chart).toBeUndefined();
  });

  it("mostra os materiais pelo nome, diz quantos são e passa no axe", async () => {
    const { container } = render(<Harness initial={[listStage([1, 2, 77]), emptyLimitStage()]} />);

    expect(await screen.findByText("Aço 1020")).toBeInTheDocument();
    expect(screen.getByText("Alumínio 6061")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(t.stageListCount(3));
    // An id the reader cannot see is said out loud, never dropped.
    expect(screen.getByText(t.stageListUnknown(77))).toBeInTheDocument();
    expect(screen.getByText(t.stageKindList)).toBeInTheDocument();
    expect(screen.getByText(t.stageNumber(1, "list"))).toBeInTheDocument();

    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("tira um material da lista pelo chip", async () => {
    const user = userEvent.setup();
    let last: StageState[] = [];
    render(<Harness initial={[listStage([1, 2])]} onStages={(s) => (last = s)} />);

    await user.click(
      await screen.findByRole("button", { name: `${t.stageListRemove}: Aço 1020` }),
    );
    await waitFor(() => expect(last[0]).toMatchObject({ kind: "list", materialIds: [2] }));
    expect(screen.getByRole("status")).toHaveTextContent(t.stageListCount(1));
  });

  it("uma lista esvaziada avisa que não executa, em vez de valer 'todos'", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[listStage([1])]} />);
    await user.click(await screen.findByRole("button", { name: `${t.stageListRemove}: Aço 1020` }));
    expect(await screen.findByText(t.stageListEmpty)).toBeInTheDocument();
  });
});
