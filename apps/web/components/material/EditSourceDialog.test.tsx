import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SnackbarProvider } from "@/components/ui/Snackbar";
import type { SourceReference } from "@/lib/types";
import { curadoriaText } from "@/lib/i18n-curadoria";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { SourcesSection } from "./SourcesSection";

const t = curadoriaText.editSource;

const patchSource = vi.fn();
vi.mock("@/lib/api", () => ({
  patchSource: (id: number, patch: unknown) => patchSource(id, patch),
}));

const source: SourceReference = {
  id: 4,
  label: "Ashby 2011",
  reference: null,
  authors: "ASHBY, Michael F.",
  title: "Materials selection in mechanical design",
  publisher: null,
  year: 2011,
  url: null,
  accessed_on: null,
  abnt: "ASHBY, Michael F. Materials selection in mechanical design. 2011.",
};

function setup(canEdit = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <SourcesSection sources={[source]} canEdit={canEdit} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { user, invalidate, ...view };
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: t.actionFor("Ashby 2011") }));
  return screen.findByRole("dialog", { name: t.title("Ashby 2011") });
}

beforeEach(() => {
  patchSource.mockReset();
  patchSource.mockResolvedValue({ ...source });
});
afterEach(() => vi.clearAllMocks());

describe("Editar fonte (D-236)", () => {
  it("quem não pode editar o catálogo não vê o botão", () => {
    setup(false);
    expect(screen.queryByRole("button", { name: t.actionFor("Ashby 2011") })).toBeNull();
  });

  it("o formulário traz os seis campos com rótulo e o que já está cadastrado", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    expect(within(dialog).getByLabelText(t.authors)).toHaveValue("ASHBY, Michael F.");
    expect(within(dialog).getByLabelText(t.titleField)).toHaveValue(source.title);
    expect(within(dialog).getByLabelText(t.publisher)).toHaveValue("");
    expect(within(dialog).getByLabelText(t.year)).toHaveValue("2011");
    expect(within(dialog).getByLabelText(t.url)).toHaveValue("");
    expect(within(dialog).getByLabelText(t.accessedOn)).toHaveValue("");
  });

  it("manda só o que mudou e, em branco, manda nulo; depois recarrega a ficha e avisa", async () => {
    const { user, invalidate } = setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(t.publisher), "Butterworth-Heinemann");
    await user.clear(within(dialog).getByLabelText(t.authors));
    await user.type(within(dialog).getByLabelText(t.url), "https://exemplo.org/livro");
    await user.click(within(dialog).getByRole("button", { name: t.save }));

    await waitFor(() => expect(patchSource).toHaveBeenCalledTimes(1));
    expect(patchSource).toHaveBeenCalledWith(4, {
      authors: null,
      publisher: "Butterworth-Heinemann",
      url: "https://exemplo.org/livro",
    });
    expect(await screen.findByText(t.saved("Ashby 2011"))).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["material"] });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("valida ao enviar: ano implausível, endereço sem http e acesso no futuro", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    const year = within(dialog).getByLabelText(t.year);
    await user.clear(year);
    await user.type(year, "3000");
    await user.type(within(dialog).getByLabelText(t.url), "exemplo.org");
    const accessed = within(dialog).getByLabelText(t.accessedOn);
    // A date input takes the value, not typing, in jsdom.
    await user.click(within(dialog).getByRole("button", { name: t.save }));

    expect(await within(dialog).findByText(t.errorYear(new Date().getUTCFullYear()))).toBeInTheDocument();
    expect(within(dialog).getByText(t.errorUrl)).toBeInTheDocument();
    expect(year).toHaveAttribute("aria-invalid", "true");
    expect(accessed).not.toHaveAttribute("aria-invalid");
    expect(patchSource).not.toHaveBeenCalled();

    // The message follows the typing: fixing the year clears it.
    await user.clear(year);
    await user.type(year, "2012");
    expect(within(dialog).queryByText(t.errorYear(new Date().getUTCFullYear()))).toBeNull();
  });

  it("recusa a data de acesso anterior ao ano de publicação", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    const accessed = within(dialog).getByLabelText(t.accessedOn) as HTMLInputElement;
    await user.type(accessed, "2010-05-01");
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    expect(await within(dialog).findByText(t.errorAccessedBeforeYear)).toBeInTheDocument();
    expect(patchSource).not.toHaveBeenCalled();
  });

  it("sem mudança, diz que nada mudou e não chama o servidor", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    expect(await within(dialog).findByText(t.nothingToSave)).toBeInTheDocument();
    expect(patchSource).not.toHaveBeenCalled();
  });

  it("a recusa do servidor aparece no diálogo, que continua aberto", async () => {
    patchSource.mockRejectedValue(
      Object.assign(new Error("O ano deve estar entre 1000 e 2026; deixe em branco."), { status: 400 }),
    );
    const { user } = setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText(t.publisher), "Editora");
    await user.click(within(dialog).getByRole("button", { name: t.save }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "O ano deve estar entre 1000 e 2026",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("Escape fecha sem salvar", async () => {
    const { user } = setup();
    await openDialog(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(patchSource).not.toHaveBeenCalled();
  });

  it("o diálogo aberto não tem violações de acessibilidade", async () => {
    const { user, container } = setup();
    await openDialog(user);
    const violations = await findA11yViolations(container, {
      rules: {
        "color-contrast": { enabled: false },
        region: { enabled: false },
        "heading-order": { enabled: false },
      },
    });
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
