import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider, useSnackbar, type SnackbarOptions } from "./Snackbar";
import { useUndoableDelete, withoutChild, withoutId } from "@/lib/useUndoableDelete";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";

let notify: (options: SnackbarOptions) => void = () => {};
function Probe({ onReady }: { onReady: (fn: typeof notify) => void }) {
  const api = useSnackbar();
  useEffect(() => onReady(api.notify), [api.notify, onReady]);
  return null;
}
const capture = (fn: typeof notify) => {
  notify = fn;
};

function setup() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <SnackbarProvider>
      <Probe onReady={capture} />
    </SnackbarProvider>,
  );
  return user;
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("Snackbar (D-130)", () => {
  it("shows one message with its single action, in a live region", () => {
    setup();
    act(() => notify({ message: "Estudo excluído", action: { label: "Desfazer", onAction: vi.fn() } }));
    expect(screen.getByRole("status")).toHaveTextContent("Estudo excluído");
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeInTheDocument();
  });

  it("taking the action runs it and does NOT expire the message", async () => {
    const user = setup();
    const onAction = vi.fn();
    const onExpire = vi.fn();
    act(() => notify({ message: "x", action: { label: "Desfazer", onAction }, onExpire }));
    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(onAction).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(20000));
    expect(onExpire).not.toHaveBeenCalled();
    expect(screen.queryByText("x")).not.toBeInTheDocument();
  });

  it("expires on its own after the time, and only once", () => {
    setup();
    const onExpire = vi.fn();
    act(() => notify({ message: "x", action: { label: "Desfazer", onAction: vi.fn() }, onExpire }));
    act(() => vi.advanceTimersByTime(7900));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(200));
    expect(onExpire).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(20000));
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("a new one replaces the current, which is confirmed rather than dropped", () => {
    setup();
    const first = vi.fn();
    act(() => notify({ message: "primeiro", onExpire: first }));
    act(() => notify({ message: "segundo" }));
    expect(first).toHaveBeenCalledOnce();
    expect(screen.queryByText("primeiro")).not.toBeInTheDocument();
    expect(screen.getByText("segundo")).toBeInTheDocument();
  });

  it("hovering pauses the clock so slow readers keep the message", async () => {
    const user = setup();
    const onExpire = vi.fn();
    act(() => notify({ message: "lento", action: { label: "Desfazer", onAction: vi.fn() }, onExpire }));
    await user.hover(screen.getByText("lento"));
    act(() => vi.advanceTimersByTime(60000));
    expect(onExpire).not.toHaveBeenCalled();
    await user.unhover(screen.getByText("lento"));
    act(() => vi.advanceTimersByTime(9000));
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("leaving the page confirms the pending message", () => {
    setup();
    const onExpire = vi.fn();
    act(() => notify({ message: "x", onExpire }));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("has no accessibility violations while open", async () => {
    setup();
    act(() => notify({ message: "Estudo excluído", action: { label: "Desfazer", onAction: vi.fn() } }));
    vi.useRealTimers();
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("useUndoableDelete (D-130)", () => {
  function Harness({ commit }: { commit: () => Promise<unknown> }) {
    const undoableDelete = useUndoableDelete();
    return (
      <button
        onClick={() =>
          undoableDelete({
            what: ptBR.snackbar.study,
            hide: [{ queryKey: ["studies"], remove: withoutId(1) }],
            commit,
          })
        }
      >
        apagar
      </button>
    );
  }

  function mount(commit: () => Promise<unknown>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["studies"], [{ id: 1 }, { id: 2 }]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <Harness commit={commit} />
        </SnackbarProvider>
      </QueryClientProvider>,
    );
    return { client, user };
  }

  it("hides the row at once and calls the API only after the time", async () => {
    const commit = vi.fn(() => Promise.resolve());
    const { client, user } = mount(commit);
    await user.click(screen.getByRole("button", { name: "apagar" }));
    expect(client.getQueryData(["studies"])).toEqual([{ id: 2 }]);
    expect(screen.getByRole("status")).toHaveTextContent("Estudo excluído");
    expect(commit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(8100));
    expect(commit).toHaveBeenCalledOnce();
  });

  it("Desfazer never calls the API", async () => {
    const commit = vi.fn(() => Promise.resolve());
    const { user } = mount(commit);
    await user.click(screen.getByRole("button", { name: "apagar" }));
    await user.click(screen.getByRole("button", { name: ptBR.snackbar.undo }));
    act(() => vi.advanceTimersByTime(20000));
    expect(commit).not.toHaveBeenCalled();
  });

  it("says so when the server refuses, instead of claiming the deletion", async () => {
    const commit = vi.fn(() => Promise.reject(new Error("não")));
    const { user } = mount(commit);
    await user.click(screen.getByRole("button", { name: "apagar" }));
    await act(async () => {
      vi.advanceTimersByTime(8100);
    });
    expect(await screen.findByText(ptBR.snackbar.deleteFailed)).toBeInTheDocument();
  });

  it("withoutChild takes a row out of the list a record holds", () => {
    expect(withoutChild("sources", 2)({ id: 9, sources: [{ id: 1 }, { id: 2 }] })).toEqual({
      id: 9,
      sources: [{ id: 1 }],
    });
    expect(withoutChild("sources", 2)(undefined)).toBeUndefined();
  });
});
