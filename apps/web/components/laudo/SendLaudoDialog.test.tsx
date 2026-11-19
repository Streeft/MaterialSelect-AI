import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { laudoText as t } from "@/lib/i18n-laudo";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type {
  EmailStatus,
  IssuedLaudo,
  LaudoDelivery,
  LaudoEmailPreview,
  LaudoSendRequest,
} from "@/lib/api";
import { SnackbarProvider } from "@/components/ui/Snackbar";

const getEmailStatus = vi.fn<() => Promise<EmailStatus>>();
const previewLaudoEmail = vi.fn<(id: number, body: object) => Promise<LaudoEmailPreview>>();
const sendLaudo = vi.fn<(id: number, body: LaudoSendRequest) => Promise<LaudoDelivery>>();
const listLaudoDeliveries = vi.fn<(id: number) => Promise<LaudoDelivery[]>>();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getEmailStatus: () => getEmailStatus(),
  previewLaudoEmail: (id: number, body: object) => previewLaudoEmail(id, body),
  sendLaudo: (id: number, body: LaudoSendRequest) => sendLaudo(id, body),
  listLaudoDeliveries: (id: number) => listLaudoDeliveries(id),
}));

const { SendLaudoDialog } = await import("./SendLaudoDialog");

const issued: IssuedLaudo = {
  id: 5,
  study_id: 7,
  study_name: "Suporte leve",
  version: 2,
  engineer_name: "Ana Souza",
  engineer_title: "Engenheira mecânica",
  engineer_registration: "CREA-SP 1",
  art_number: null,
  city: "São Carlos",
  issue_date: "2026-11-16",
  client_name: null,
  client_project: null,
  content_sha256: "a".repeat(64),
  short_code: "AAAA-AAAA-AAAA",
  verify_url: "http://api/api/laudos/verificar/x",
  issued_at: "2026-11-16T13:00:00Z",
};

function delivery(over: Partial<LaudoDelivery> = {}): LaudoDelivery {
  return {
    id: 1,
    issued_report_id: 5,
    recipients: ["cliente@empresa.com.br"],
    cc: [],
    subject: "Laudo de engenharia — Suporte leve (versão 2)",
    message: null,
    status: "enviado",
    provider: "smtp",
    error: null,
    created_at: "2026-11-16T15:40:00Z",
    sent_by: "ana@exemplo.com",
    ...over,
  };
}

function mount(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <SendLaudoDialog issued={issued} open onClose={onClose} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
  return { ...view, onClose };
}

/** jsdom cannot run axe inside a frame; the frame itself (its title) is still checked. */
const NO_IFRAME_CONTENT = { iframes: false } as const;

/** A label by its start, with the "(opcional)" parentheses taken literally. */
const named = (text: string) => new RegExp(`^${text.replace(/[()]/g, "\\$&")}`);

const sendButton = () => screen.getByRole("button", { name: t.sendAction });

beforeEach(() => {
  getEmailStatus.mockReset().mockResolvedValue({ email_provider: "smtp", email_configured: true });
  previewLaudoEmail.mockReset().mockResolvedValue({
    subject: "Laudo de engenharia — Suporte leve (versão 2)",
    html: "<!doctype html><html><body><p>Olá,</p></body></html>",
    text: "Olá,",
    attachment_name: "laudo-suporte-leve-v2.html",
    provider: "smtp",
    email_configured: true,
  });
  sendLaudo.mockReset();
  listLaudoDeliveries.mockReset().mockResolvedValue([]);
});

describe("SendLaudoDialog (D-242)", () => {
  it("opens as an accessible dialog with the preview in a sandboxed frame", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: t.sendTitle(2) });
    const frame = await within(dialog).findByTitle(t.previewFrame);
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame.getAttribute("srcdoc")).toContain("Olá,");
    expect(within(dialog).getByText(/laudo-suporte-leve-v2\.html/)).toBeInTheDocument();
    expect(await within(dialog).findByText(t.historyEmpty)).toBeInTheDocument();
    const violations = await findA11yViolations(dialog, NO_IFRAME_CONTENT);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("warns honestly when the server only simulates the e-mail", async () => {
    getEmailStatus.mockResolvedValue({ email_provider: "mock", email_configured: false });
    mount();
    expect(await screen.findByText(t.notConfiguredTitle)).toBeInTheDocument();
    expect(screen.getByText(/apenas simulado/)).toBeInTheDocument();
  });

  it("does not warn when the e-mail is configured", async () => {
    mount();
    await screen.findByTitle(t.previewFrame);
    expect(screen.queryByText(t.notConfiguredTitle)).not.toBeInTheDocument();
  });

  it("keeps Enviar off until there is a valid recipient", async () => {
    mount();
    await screen.findByTitle(t.previewFrame);
    expect(sendButton()).toBeDisabled();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(named(t.to)), "nao-e-email{Enter}");
    expect(await screen.findByText(t.addressInvalid("nao-e-email"))).toBeInTheDocument();
    expect(sendButton()).toBeDisabled();
  });

  it("turns Enter, commas and pasted lists into chips, and removes them", async () => {
    mount();
    await screen.findByTitle(t.previewFrame);
    const user = userEvent.setup();
    const field = screen.getByLabelText(named(t.to));
    await user.type(field, "um@empresa.com.br{Enter}dois@empresa.com.br,");
    await user.click(field);
    await user.paste("tres@empresa.com.br quatro@empresa.com.br; ruim");
    const list = screen.getByRole("list", { name: t.addressList(t.to) });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(field).toHaveValue("ruim");
    expect(screen.getByText(t.addressInvalid("ruim"))).toBeInTheDocument();

    await user.click(within(list).getByRole("button", { name: `${t.removeAddress}: um@empresa.com.br` }));
    expect(within(list).queryByText("um@empresa.com.br")).not.toBeInTheDocument();
  });

  it("stops at five addresses and says so", async () => {
    mount();
    await screen.findByTitle(t.previewFrame);
    const user = userEvent.setup();
    const field = screen.getByLabelText(named(t.to));
    await user.click(field);
    await user.paste("a1@x.com a2@x.com a3@x.com a4@x.com a5@x.com a6@x.com");
    const list = screen.getByRole("list", { name: t.addressList(t.to) });
    expect(within(list).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText(t.addressLimit(5))).toBeInTheDocument();
  });

  it("does not copy whoever is already a recipient", async () => {
    mount();
    await screen.findByTitle(t.previewFrame);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(named(t.to)), "ana@x.com{Enter}");
    await user.type(screen.getByLabelText(named(t.cc)), "ANA@x.com{Enter}");
    expect(screen.getByText(t.addressDuplicate("ANA@x.com"))).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: t.addressList(t.cc) })).not.toBeInTheDocument();
  });

  it("sends the chips, the subject and the message, thanks in a toast, then closes", async () => {
    sendLaudo.mockResolvedValue(delivery({ cc: ["copia@empresa.com.br"] }));
    const { onClose } = mount();
    await screen.findByTitle(t.previewFrame);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(named(t.to)), "cliente@empresa.com.br{Enter}");
    await user.type(screen.getByLabelText(named(t.cc)), "copia@empresa.com.br{Enter}");
    await user.type(screen.getByLabelText(t.subject), "Laudo do suporte");
    await user.type(screen.getByLabelText(named(t.message)), "Segue o laudo.");
    await user.click(sendButton());

    await waitFor(() => expect(sendLaudo).toHaveBeenCalledTimes(1));
    expect(sendLaudo).toHaveBeenCalledWith(5, {
      recipients: ["cliente@empresa.com.br"],
      cc: ["copia@empresa.com.br"],
      subject: "Laudo do suporte",
      message: "Segue o laudo.",
      reply_to_engineer: true,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText(t.sentToast(2))).toBeInTheDocument();
  });

  it("lets replies reach the engineer, says where, and lets that be switched off (D-249)", async () => {
    previewLaudoEmail.mockResolvedValue({
      subject: "Laudo de engenharia — Suporte leve (versão 2)",
      html: "<p>Olá,</p>",
      text: "Olá,",
      attachment_name: "laudo-suporte-leve-v2.html",
      provider: "smtp",
      email_configured: true,
      reply_to: "ana@exemplo.com",
    });
    sendLaudo.mockResolvedValue(delivery());
    mount();
    const user = userEvent.setup();
    await screen.findByTitle(t.previewFrame);
    const box = await screen.findByRole("checkbox", { name: t.replyToMe("ana@exemplo.com") });
    expect(box).toBeChecked();
    await waitFor(() =>
      expect(previewLaudoEmail).toHaveBeenLastCalledWith(5, expect.objectContaining({ reply_to_engineer: true })),
    );
    await user.click(box);
    expect(box).not.toBeChecked();
    // The preview follows the choice, after its pause.
    await waitFor(() =>
      expect(previewLaudoEmail).toHaveBeenLastCalledWith(5, expect.objectContaining({ reply_to_engineer: false })),
    );
    await user.type(screen.getByLabelText(named(t.to)), "cliente@empresa.com.br{Enter}");
    await user.click(sendButton());
    await waitFor(() => expect(sendLaudo).toHaveBeenCalledTimes(1));
    expect(sendLaudo.mock.calls[0]![1].reply_to_engineer).toBe(false);
  });

  it("counts an address still in the field when Enviar is pressed", async () => {
    sendLaudo.mockResolvedValue(delivery());
    mount();
    await screen.findByTitle(t.previewFrame);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(named(t.to)), "cliente@empresa.com.br");
    await user.click(sendButton());
    await waitFor(() => expect(sendLaudo).toHaveBeenCalled());
    expect(sendLaudo.mock.calls[0]![1].recipients).toEqual(["cliente@empresa.com.br"]);
  });

  it("says a simulated send was only simulated", async () => {
    getEmailStatus.mockResolvedValue({ email_provider: "mock", email_configured: false });
    sendLaudo.mockResolvedValue(delivery({ status: "simulado", provider: "mock" }));
    mount();
    await screen.findByText(t.notConfiguredTitle);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(named(t.to)), "cliente@empresa.com.br{Enter}");
    await user.click(sendButton());
    expect(await screen.findByText(t.simulatedToast(1))).toBeInTheDocument();
  });

  it("says a send that went into the retry queue is waiting, and when it will be tried again (D-252)", async () => {
    sendLaudo.mockResolvedValue(
      delivery({
        status: "na_fila",
        error: "O servidor de e-mail não respondeu em 10 s. Tente de novo em instantes.",
        attempts: 1,
        max_attempts: 5,
        next_attempt_at: "2026-11-19T18:15:00Z",
      }),
    );
    const { onClose } = mount();
    await screen.findByTitle(t.previewFrame);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(named(t.to)), "cliente@empresa.com.br{Enter}");
    await user.click(sendButton());
    // Not "enviado": the toast says it is queued, and the dialog closes (the history shows it).
    expect(await screen.findByText(/ficou na fila e será tentado de novo em /)).toBeInTheDocument();
    expect(screen.queryByText(t.sentToast(1))).not.toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("keeps the dialog open and says why when the send fails", async () => {
    const { ApiError } = await import("@/lib/api");
    sendLaudo.mockRejectedValue(
      new ApiError("O servidor de e-mail recusou o usuário ou a senha configurados.", 503),
    );
    const { onClose } = mount();
    await screen.findByTitle(t.previewFrame);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(named(t.to)), "cliente@empresa.com.br{Enter}");
    await user.click(sendButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(t.sendErrorTitle);
    expect(onClose).not.toHaveBeenCalled();
    expect(sendButton()).toBeEnabled();
  });

  it("lists the history of this version with each outcome in words", async () => {
    listLaudoDeliveries.mockResolvedValue([
      delivery({ id: 3, status: "falhou", error: "O servidor de e-mail não respondeu em 10 s." }),
      delivery({ id: 2, status: "simulado", provider: "mock", cc: ["copia@empresa.com.br"] }),
      delivery({ id: 1 }),
    ]);
    const { container } = mount();
    const history = await screen.findByRole("list", { name: t.historyTable });
    expect(within(history).getAllByRole("listitem")).toHaveLength(3);
    expect(within(history).getByText("Falhou")).toBeInTheDocument();
    expect(within(history).getByText("Simulado")).toBeInTheDocument();
    expect(within(history).getByText("Enviado")).toBeInTheDocument();
    expect(within(history).getByText(/não respondeu em 10 s/)).toBeInTheDocument();
    expect(within(history).getByText(/copia@empresa\.com\.br \(cópia\)/)).toBeInTheDocument();
    const violations = await findA11yViolations(container, NO_IFRAME_CONTENT);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("says when the preview or the history cannot be loaded", async () => {
    previewLaudoEmail.mockRejectedValue(new Error("x"));
    listLaudoDeliveries.mockRejectedValue(new Error("y"));
    mount();
    expect(await screen.findByText(t.previewError)).toBeInTheDocument();
    expect(await screen.findByText(t.historyError)).toBeInTheDocument();
  });
});
