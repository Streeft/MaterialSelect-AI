import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";

vi.mock("@/lib/api", () => ({
  listMaterials: () =>
    Promise.resolve([
      { id: 7, name: "Alumínio 6061", class_name: "Metais", class_slug: "metais" },
      { id: 9, name: "Aço 1020", class_name: "Metais", class_slug: "metais" },
    ]),
}));

const { SlashTextarea } = await import("./SlashTextarea");
const s = ptBR.notebooks.slash;

function Harness({ onValue }: { onValue?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <SlashTextarea
      label="Nota"
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
    />
  );
}

function mount(onValue?: (v: string) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness onValue={onValue} />
    </QueryClientProvider>,
  );
}

describe("nota com / (D-235)", () => {
  it("/ no começo da linha abre a lista; filtra, e Enter insere o bloco no lugar do /", async () => {
    let last = "";
    const user = userEvent.setup();
    mount((v) => (last = v));
    const field = screen.getByRole("textbox", { name: /Nota/ });
    await user.type(field, "/");
    expect(screen.getByRole("listbox", { name: s.menuLabel })).toBeInTheDocument();
    await user.type(field, "cit");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([`${s.quote}> `]);
    await user.keyboard("{Enter}");
    expect(last).toBe("> ");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("uma barra no meio de uma palavra não abre nada, e Esc fecha a lista", async () => {
    const user = userEvent.setup();
    mount();
    const field = screen.getByRole("textbox", { name: /Nota/ });
    await user.type(field, "e/ou");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(field, " /");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Ficha de material busca no catálogo e insere o link da ficha, nunca um valor", async () => {
    let last = "";
    const user = userEvent.setup();
    mount((v) => (last = v));
    const field = screen.getByRole("textbox", { name: /Nota/ });
    await user.type(field, "Ver /fic");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("listbox", { name: s.sheetLabel })).toBeInTheDocument();
    await user.type(field, "alum");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    await user.keyboard("{Enter}");
    expect(last).toBe("Ver [Alumínio 6061](/app/materiais/7)");
  });

  it("passa no axe com a lista aberta", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await user.type(screen.getByRole("textbox", { name: /Nota/ }), "/");
    expect(describeViolations(await findA11yViolations(container))).toBe("");
  });
});
