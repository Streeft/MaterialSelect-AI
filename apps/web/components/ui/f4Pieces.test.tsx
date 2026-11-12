import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { useLiveResult } from "@/lib/useLiveResult";
import { NumberInput } from "./Field";
import { InlineTable } from "./InlineTable";
import { SnackbarProvider } from "./Snackbar";

const t = ptBR.ds;

async function expectAccessible(container: Element) {
  const violations = await findA11yViolations(container);
  expect(violations, describeViolations(violations)).toEqual([]);
}

describe("NumberInput com unidade (D-220)", () => {
  it("writes the unit inside the field and keeps it in the accessible name", async () => {
    const { container } = render(<NumberInput label="Comprimento" unit="m" defaultValue="1,2" />);
    expect(screen.getByRole("spinbutton", { name: "Comprimento (m)" })).toBeInTheDocument();
    expect(container.querySelector(".msds-unit")).toHaveTextContent("m");
    await expectAccessible(container);
  });
});

describe("useLiveResult (D-220)", () => {
  afterEach(() => vi.useRealTimers());

  function Live({ fetcher }: { fetcher: (n: number) => Promise<string> }) {
    const [value, setValue] = useState("2");
    const n = Number(value);
    const live = useLiveResult({
      key: "teste",
      request: value !== "" && Number.isFinite(n) ? n : null,
      fetcher,
      delayMs: 50,
    });
    return (
      <div>
        <input aria-label="n" value={value} onChange={(e) => setValue(e.target.value)} />
        <p data-testid="out">{live.data ?? "nada"}</p>
        <p data-testid="state">{live.updating ? "atualizando" : "pronto"}</p>
      </div>
    );
  }

  function mount(fetcher: (n: number) => Promise<string>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <Live fetcher={fetcher} />
      </QueryClientProvider>,
    );
  }

  it("asks the server once the typing settles, and only then", async () => {
    const fetcher = vi.fn((n: number) => Promise.resolve(`servidor: ${n * 10}`));
    mount(fetcher);
    await waitFor(() => expect(screen.getByTestId("out")).toHaveTextContent("servidor: 20"));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const input = screen.getByRole("textbox", { name: "n" });
    await userEvent.clear(input);
    await userEvent.type(input, "345");
    await waitFor(() => expect(screen.getByTestId("out")).toHaveTextContent("servidor: 3450"));
    // "3", "34", "345" typed in a burst: one question, not three.
    expect(fetcher.mock.calls.map(([n]) => n)).toEqual([2, 345]);
  });

  it("keeps the last answer on screen, marked as updating, while the next one comes", async () => {
    let release: (value: string) => void = () => {};
    const fetcher = vi.fn((n: number) =>
      n === 2 ? Promise.resolve("primeira") : new Promise<string>((resolve) => (release = resolve)),
    );
    mount(fetcher);
    await waitFor(() => expect(screen.getByTestId("out")).toHaveTextContent("primeira"));
    await userEvent.type(screen.getByRole("textbox", { name: "n" }), "0");
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent("atualizando"));
    expect(screen.getByTestId("out")).toHaveTextContent("primeira");
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("out")).toHaveTextContent("primeira");
    await act(async () => release("segunda"));
    await waitFor(() => expect(screen.getByTestId("out")).toHaveTextContent("segunda"));
    expect(screen.getByTestId("state")).toHaveTextContent("pronto");
  });

  it("an incomplete brief asks nothing and shows no stale answer", async () => {
    const fetcher = vi.fn((n: number) => Promise.resolve(`r${n}`));
    mount(fetcher);
    await waitFor(() => expect(screen.getByTestId("out")).toHaveTextContent("r2"));
    await userEvent.clear(screen.getByRole("textbox", { name: "n" }));
    expect(screen.getByTestId("out")).toHaveTextContent("nada");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("InlineTable (D-220)", () => {
  interface Leg {
    key: number;
    mode: string;
    km: string;
  }

  function Legs() {
    const [legs, setLegs] = useState<Leg[]>([
      { key: 1, mode: "Caminhão", km: "100" },
      { key: 2, mode: "Navio", km: "5000" },
    ]);
    return (
      <InlineTable
        label="Trechos de transporte"
        columns={[
          { id: "mode", header: "Modal" },
          { id: "km", header: "Distância", hint: "km", numeric: true },
        ]}
        rows={legs}
        rowKey={(leg) => leg.key}
        rowName={(_leg, i) => `Trecho ${i + 1}`}
        renderCell={(leg, column, i) =>
          column.id === "mode" ? (
            <span>{leg.mode}</span>
          ) : (
            <NumberInput
              label={`Distância, trecho ${i + 1}`}
              unit="km"
              value={leg.km}
              onChange={(e) =>
                setLegs((list) => list.map((l) => (l.key === leg.key ? { ...l, km: e.target.value } : l)))
              }
            />
          )
        }
        onAdd={() => setLegs((list) => [...list, { key: list.length + 10, mode: "Trem", km: "0" }])}
        addLabel="Trecho"
        onDuplicate={(leg) => setLegs((list) => [...list, { ...leg, key: list.length + 20 }])}
        onRemove={(leg) => setLegs((list) => list.filter((l) => l.key !== leg.key))}
        onRestore={(leg, i) => setLegs((list) => [...list.slice(0, i), leg, ...list.slice(i)])}
      />
    );
  }

  it("names each control by column and row, and adds a row at the end", async () => {
    const { container } = render(
      <SnackbarProvider>
        <Legs />
      </SnackbarProvider>,
    );
    const table = screen.getByRole("table", { name: "Trechos de transporte" });
    expect(within(table).getByRole("spinbutton", { name: "Distância, trecho 2 (km)" })).toHaveValue(5000);
    await userEvent.click(screen.getByRole("button", { name: "Trecho" }));
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("Trem")).toBeInTheDocument();
    await expectAccessible(container);
  });

  it("removes a row from its ⋯ and brings it back in place with Desfazer (D-130)", async () => {
    render(
      <SnackbarProvider>
        <Legs />
      </SnackbarProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: t.rowActions("Trecho 1") }));
    await userEvent.click(screen.getByRole("menuitem", { name: t.removeRow }));
    expect(screen.queryByText("Caminhão")).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: t.undo }));
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Caminhão");
  });

  it("the last row left cannot be removed", async () => {
    function One() {
      return (
        <InlineTable
          label="Uma linha"
          columns={[{ id: "a", header: "A" }]}
          rows={[{ key: 1 }]}
          rowKey={(r) => r.key}
          rowName={() => "Linha 1"}
          renderCell={() => <span>valor</span>}
          onRemove={() => {}}
        />
      );
    }
    render(<One />);
    await userEvent.click(screen.getByRole("button", { name: t.rowActions("Linha 1") }));
    expect(screen.getByRole("menuitem", { name: t.removeRow })).toBeDisabled();
  });
});
