import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { laudoText as t } from "@/lib/i18n-laudo";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ApiError, type IssuedLaudo, type LaudoDelivery } from "@/lib/api";
import { SnackbarProvider } from "@/components/ui/Snackbar";

const listLaudoDeliveries = vi.fn<(id: number) => Promise<LaudoDelivery[]>>();
const revokeLaudoDelivery = vi.fn<(id: number) => Promise<LaudoDelivery>>();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listLaudoDeliveries: (id: number) => listLaudoDeliveries(id),
  revokeLaudoDelivery: (id: number) => revokeLaudoDelivery(id),
}));

const { DeliveriesDialog } = await import("./DeliveriesDialog");

const issued: IssuedLaudo = {
  id: 5,
  study_id: 7,
  study_name: "Suporte leve",
  version: 2,
  engineer_name: "Ana Souza",
  engineer_title: null,
  engineer_registration: null,
  art_number: null,
  city: null,
  issue_date: null,
  client_name: null,
  client_project: null,
  content_sha256: "a".repeat(64),
  short_code: "AAAA-AAAA-AAAA",
  verify_url: "http://api/x",
  issued_at: "2026-11-16T13:00:00Z",
};

function delivery(over: Partial<LaudoDelivery> = {}): LaudoDelivery {
  return {
    id: 1,
    issued_report_id: 5,
    recipients: ["cliente@empresa.com.br"],
    cc: [],
    subject: "Laudo",
    message: null,
    status: "enviado",
    provider: "smtp",
    error: null,
    created_at: "2026-11-16T15:40:00Z",
    sent_by: "ana@exemplo.com",
    link_state: "ativo",
    expires_at: "2027-02-14T15:40:00Z",
    revoked_at: null,
    open_count: 3,
    first_opened_at: "2026-11-16T16:00:00Z",
    last_opened_at: "2026-11-17T09:30:00Z",
    attached_pdf_sha256: null,
    ...over,
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <DeliveriesDialog issued={issued} open onClose={() => undefined} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listLaudoDeliveries.mockReset().mockResolvedValue([]);
  revokeLaudoDelivery.mockReset();
});

describe("DeliveriesDialog (D-243)", () => {
  it("shows the empty state", async () => {
    mount();
    expect(await screen.findByText(t.historyEmpty)).toBeInTheDocument();
  });

  it("shows each link's state, validity and openings in words", async () => {
    listLaudoDeliveries.mockResolvedValue([
      delivery({ id: 3 }),
      delivery({ id: 2, link_state: "vencido", expires_at: "2026-11-01T00:00:00Z", open_count: 0, last_opened_at: null, first_opened_at: null, attached_pdf_sha256: "d".repeat(64) }),
      delivery({ id: 1, link_state: "revogado", revoked_at: "2026-11-17T10:00:00Z" }),
    ]);
    const { container } = mount();
    const list = await screen.findByRole("list", { name: t.historyTable });
    const items = within(list).getAllByRole("listitem");
    expect(within(items[0]!).getByText(t.linkStates.ativo!)).toBeInTheDocument();
    expect(within(items[0]!).getByText(/^Válido até /)).toBeInTheDocument();
    expect(within(items[0]!).getByText(/^Aberto 3× · última em /)).toBeInTheDocument();
    expect(within(items[0]!).getByText(t.htmlAttached)).toBeInTheDocument();
    expect(within(items[1]!).getByText(t.linkStates.vencido!)).toBeInTheDocument();
    expect(within(items[1]!).getByText(/^Venceu em /)).toBeInTheDocument();
    expect(within(items[1]!).getByText(t.notOpened)).toBeInTheDocument();
    expect(within(items[1]!).getByText(t.pdfAttached)).toBeInTheDocument();
    expect(within(items[2]!).getByText(t.linkStates.revogado!)).toBeInTheDocument();
    expect(within(items[2]!).getByText(/^Revogado em /)).toBeInTheDocument();
    // Only an active link can be revoked.
    expect(screen.getAllByRole("button", { name: /^Revogar o link/ })).toHaveLength(1);
    expect(screen.getByText(t.openedNote)).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("a failed send has no link to show or revoke", async () => {
    listLaudoDeliveries.mockResolvedValue([
      delivery({ status: "falhou", error: "O servidor recusou.", link_state: "sem_link", expires_at: null, open_count: 0 }),
    ]);
    mount();
    expect(await screen.findByText("O servidor recusou.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Revogar/ })).not.toBeInTheDocument();
    expect(screen.queryByText(t.notOpened)).not.toBeInTheDocument();
  });

  it("asks before revoking, then revokes and refreshes", async () => {
    listLaudoDeliveries.mockResolvedValue([delivery()]);
    revokeLaudoDelivery.mockResolvedValue(delivery({ link_state: "revogado", revoked_at: "2026-11-17T10:00:00Z" }));
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: t.revokeLabel("cliente@empresa.com.br") }));
    const confirm = await screen.findByRole("dialog", { name: t.revokeTitle });
    expect(within(confirm).getByText(t.revokeMessage)).toBeInTheDocument();
    expect(revokeLaudoDelivery).not.toHaveBeenCalled();

    listLaudoDeliveries.mockResolvedValue([delivery({ link_state: "revogado", revoked_at: "2026-11-17T10:00:00Z" })]);
    await user.click(within(confirm).getByRole("button", { name: t.revokeConfirm }));
    await waitFor(() => expect(revokeLaudoDelivery).toHaveBeenCalledWith(1));
    expect(await screen.findByText(t.revokedToast)).toBeInTheDocument();
    expect(await screen.findByText(t.linkStates.revogado!)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Revogar o link/ })).not.toBeInTheDocument();
  });

  it("cancelling the confirmation revokes nothing", async () => {
    listLaudoDeliveries.mockResolvedValue([delivery()]);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Revogar o link/ }));
    const confirm = await screen.findByRole("dialog", { name: t.revokeTitle });
    await user.click(within(confirm).getByRole("button", { name: "Cancelar" }));
    expect(revokeLaudoDelivery).not.toHaveBeenCalled();
  });

  it("shows the server's refusal when revoking fails", async () => {
    listLaudoDeliveries.mockResolvedValue([delivery()]);
    revokeLaudoDelivery.mockRejectedValue(new ApiError("Envio não encontrado.", 404));
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /^Revogar o link/ }));
    const confirm = await screen.findByRole("dialog", { name: t.revokeTitle });
    await user.click(within(confirm).getByRole("button", { name: t.revokeConfirm }));
    expect(await screen.findByText(t.revokeErrorTitle)).toBeInTheDocument();
  });
});
