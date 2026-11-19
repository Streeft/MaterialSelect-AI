import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { laudoText as t } from "@/lib/i18n-laudo";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { IssuedLaudo, LaudoDelivery, LaudoInputs } from "@/lib/api";
import { SnackbarProvider } from "@/components/ui/Snackbar";

const getStudy = vi.fn();
const listLaudoVersions = vi.fn<(id: number) => Promise<IssuedLaudo[]>>();
const issueLaudo = vi.fn<(id: number, inputs: LaudoInputs) => Promise<IssuedLaudo>>();
const listLaudoDeliveries = vi.fn<(id: number) => Promise<LaudoDelivery[]>>();
const listSignedPdfs = vi.fn(() => Promise.resolve([]));

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getStudy: (id: number) => getStudy(id),
  listLaudoVersions: (id: number) => listLaudoVersions(id),
  issueLaudo: (id: number, inputs: LaudoInputs) => issueLaudo(id, inputs),
  listLaudoDeliveries: (id: number) => listLaudoDeliveries(id),
  listSignedPdfs: () => listSignedPdfs(),
  getEmailStatus: () => Promise.resolve({ email_provider: "smtp", email_configured: true }),
  previewLaudoEmail: () =>
    Promise.resolve({
      subject: "Laudo",
      html: "<p>Olá,</p>",
      text: "Olá,",
      attachment_name: "laudo.html",
      provider: "smtp",
      email_configured: true,
    }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/selecao/laudo",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams("estudo=7"),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { LaudoScreen } = await import("./LaudoScreen");

function version(n: number): IssuedLaudo {
  return {
    id: n,
    study_id: 7,
    study_name: "Suporte leve",
    version: n,
    engineer_name: "Ana Souza",
    engineer_title: "Engenheira mecânica",
    engineer_registration: "CREA-SP 1",
    art_number: null,
    city: "São Carlos",
    issue_date: "2026-11-16",
    client_name: null,
    client_project: null,
    content_sha256: `${n}`.repeat(64).slice(0, 64),
    short_code: `ABCD-EF0${n}-1234`,
    verify_url: "http://api/api/laudos/verificar/x",
    issued_at: "2026-11-16T13:00:00Z",
  };
}

function mount(studyId: number | null = 7) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <LaudoScreen studyId={studyId} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

async function fillRequired() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(new RegExp(`^${t.engineerName}`)), "Ana Souza");
  await user.type(screen.getByLabelText(new RegExp(`^${t.engineerTitleField}`)), "Engenheira");
  await user.type(screen.getByLabelText(new RegExp(`^${t.registration}`)), "CREA-SP 1");
  await user.type(screen.getByLabelText(new RegExp(`^${t.city}`)), "São Carlos");
  return user;
}

beforeEach(() => {
  getStudy.mockReset().mockResolvedValue({ id: 7, name: "Suporte leve" });
  listLaudoVersions.mockReset().mockResolvedValue([]);
  issueLaudo.mockReset();
  listLaudoDeliveries.mockReset().mockResolvedValue([]);
});

describe("LaudoScreen (D-241)", () => {
  it("asks for a saved study when none is in the address", async () => {
    const { container } = mount(null);
    expect(screen.getByText(t.noStudyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.goToSelection })).toHaveAttribute("href", "/app/selecao");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("shows the empty list and an accessible form", async () => {
    const { container } = mount();
    expect(await screen.findByText(t.versionsEmpty)).toBeInTheDocument();
    expect(await screen.findByText("Suporte leve")).toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("keeps Emitir off and says which fields are missing", async () => {
    mount();
    await screen.findByText(t.versionsEmpty);
    expect(screen.getByRole("button", { name: t.issue })).toBeDisabled();
    expect(screen.getByText(/Para emitir, preencha: nome, título profissional/)).toBeInTheDocument();
  });

  it("builds the preview link from the form", async () => {
    mount();
    await screen.findByText(t.versionsEmpty);
    const user = await fillRequired();
    await user.type(screen.getByLabelText(new RegExp(`^${t.partMass}`)), "1.5");
    const link = screen.getByRole("link", { name: t.preview });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("/api/exports/estudos/7/laudo.html?");
    expect(href).toContain("responsavel=Ana+Souza");
    expect(href).toContain("massa=1.5");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("confirms before issuing, then lists the new version", async () => {
    issueLaudo.mockResolvedValue(version(1));
    mount();
    await screen.findByText(t.versionsEmpty);
    const user = await fillRequired();
    await user.click(screen.getByRole("button", { name: t.issue }));
    const dialog = await screen.findByRole("dialog", { name: t.confirmTitle(1) });
    expect(within(dialog).getByText(t.confirmMessage)).toBeInTheDocument();
    expect(issueLaudo).not.toHaveBeenCalled();

    listLaudoVersions.mockResolvedValue([version(1)]);
    await user.click(within(dialog).getByRole("button", { name: t.confirmLabel }));
    await waitFor(() => expect(issueLaudo).toHaveBeenCalledTimes(1));
    const [, sent] = issueLaudo.mock.calls[0]!;
    expect(sent.engineer_name).toBe("Ana Souza");
    expect(sent.part_mass_kg).toBeNull();
    expect(await screen.findByText(t.issued(1, "ABCD-EF01-1234"))).toBeInTheDocument();
    const open = await screen.findByRole("link", { name: t.openLabel(1) });
    expect(open).toHaveAttribute("href", expect.stringContaining("/laudo/versoes/1.html"));
  });

  it("shows the server's refusal in words", async () => {
    issueLaudo.mockRejectedValue(new Error("boom"));
    mount();
    await screen.findByText(t.versionsEmpty);
    const user = await fillRequired();
    await user.click(screen.getByRole("button", { name: t.issue }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: t.confirmLabel }));
    expect(await screen.findByText(t.issueErrorTitle)).toBeInTheDocument();
  });

  it("lists issued versions with an accessible table", async () => {
    listLaudoVersions.mockResolvedValue([version(2), version(1)]);
    const { container } = mount();
    expect(await screen.findByText("ABCD-EF02-1234")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /para imprimir$/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /ao cliente por e-mail$/ })).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByText(t.noDeliveries)).toHaveLength(2));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("opens the send dialog from a version and shows what was already sent", async () => {
    listLaudoVersions.mockResolvedValue([version(2), version(1)]);
    listLaudoDeliveries.mockImplementation(async (id) =>
      id === 2
        ? [
            {
              id: 9,
              issued_report_id: 2,
              recipients: ["cliente@empresa.com.br"],
              cc: [],
              subject: "Laudo",
              message: null,
              status: "enviado",
              provider: "smtp",
              error: null,
              created_at: "2026-11-16T15:40:00Z",
              sent_by: "ana@exemplo.com",
            },
          ]
        : [],
    );
    mount();
    expect(await screen.findByText("1 envio")).toBeInTheDocument();
    expect(screen.getByText("Enviado")).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: t.sendLabel(2) }));
    const dialog = await screen.findByRole("dialog", { name: t.sendTitle(2) });
    expect(within(dialog).getByText(t.historyTitle)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t.cancel }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers the Word and PowerPoint copies, with the typed fields in the link", async () => {
    mount();
    await screen.findByText(t.versionsEmpty);
    const user = await fillRequired();
    await user.type(screen.getByLabelText(new RegExp(`^${t.partMass}`)), "1.5");
    const word = screen.getByRole("link", { name: t.docx });
    const deck = screen.getByRole("link", { name: t.pptx });
    expect(word).toHaveAttribute("href", expect.stringContaining("/api/exports/estudos/7/laudo.docx?"));
    expect(word.getAttribute("href")).toContain("responsavel=Ana+Souza");
    expect(word.getAttribute("href")).toContain("massa=1.5");
    expect(word).toHaveAttribute("download");
    expect(deck).toHaveAttribute("href", expect.stringContaining("/laudo.pptx?"));
    // They are plain links in the header now, not tucked in a menu.
    expect(screen.queryByRole("button", { name: /Formatos editáveis/ })).not.toBeInTheDocument();
  });

  it("the header copies say they are of today's study; each version has its own from the frozen laudo (D-252)", async () => {
    listLaudoVersions.mockResolvedValue([version(2), version(1)]);
    mount();
    expect(await screen.findByText("Versão 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.docx })).toHaveTextContent(/do estudo atual/);
    const word = screen.getByRole("link", { name: t.versionWordLabel(2) });
    expect(word).toHaveAttribute("href", expect.stringMatching(/\/api\/exports\/estudos\/7\/laudo\/versoes\/2\.docx$/));
    expect(word).toHaveAttribute("download");
    const deck = screen.getByRole("link", { name: t.versionPptxLabel(1) });
    expect(deck).toHaveAttribute("href", expect.stringMatching(/\/laudo\/versoes\/1\.pptx$/));
    // A frozen copy carries no form fields: they are the version's own.
    expect(word.getAttribute("href")).not.toContain("?");
  });

  it("shows a send waiting in the queue in the version row", async () => {
    listLaudoDeliveries.mockResolvedValue([
      {
        id: 9,
        issued_report_id: 2,
        recipients: ["cliente@empresa.com.br"],
        cc: [],
        subject: "Laudo",
        message: null,
        status: "na_fila",
        provider: "smtp",
        error: "O servidor de e-mail não respondeu.",
        created_at: "2026-11-19T15:40:00Z",
        sent_by: null,
        link_state: "sem_link",
        attempts: 1,
        max_attempts: 5,
        next_attempt_at: "2026-11-19T15:45:00Z",
      },
    ]);
    listLaudoVersions.mockResolvedValue([version(2)]);
    mount();
    expect(await screen.findByText("1 envio")).toBeInTheDocument();
    expect(screen.getByText(t.statusLabels.na_fila!)).toBeInTheDocument();
    expect(screen.getByText(t.queuedCount(1))).toBeInTheDocument();
    // Nothing has gone, so no link is counted as active and nothing is "aberto".
    expect(screen.queryByText(/link ativo/)).not.toBeInTheDocument();
  });

  it("shows the signed PDF and the link openings in the version row", async () => {
    listLaudoVersions.mockResolvedValue([
      {
        ...version(1),
        signed_pdf: {
          id: 3,
          issued_report_id: 1,
          filename: "a.pdf",
          size_bytes: 10,
          sha256: "e".repeat(64),
          short_sha256: "EEEE-EEEE-EEEE",
          uploaded_at: "2026-11-16T15:00:00Z",
          uploaded_by: null,
          current: true,
        },
        signed_pdf_count: 1,
      },
      version(2),
    ]);
    listLaudoDeliveries.mockImplementation(async (id) =>
      id === 1
        ? [
            {
              id: 9,
              issued_report_id: 1,
              recipients: ["cliente@empresa.com.br"],
              cc: [],
              subject: "Laudo",
              message: null,
              status: "enviado",
              provider: "smtp",
              error: null,
              created_at: "2026-11-16T15:40:00Z",
              sent_by: null,
              link_state: "ativo",
              expires_at: "2027-02-14T15:40:00Z",
              open_count: 3,
              last_opened_at: "2026-11-17T09:30:00Z",
            },
          ]
        : [],
    );
    const { container } = mount();
    expect(await screen.findByText(t.signedShort("EEEE-EEEE-EEEE"))).toBeInTheDocument();
    expect(screen.getByText(t.signedNone)).toBeInTheDocument();
    expect(await screen.findByText(/^Aberto 3× · última em /)).toBeInTheDocument();
    expect(screen.getByText("1 link ativo")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Enviar ou ver o PDF assinado/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Ver os envios da versão/ })).toHaveLength(2);
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("opens the signed-PDF and the deliveries dialogs from a version", async () => {
    listLaudoVersions.mockResolvedValue([version(1)]);
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: t.signedActionLabel(1) }));
    expect(await screen.findByRole("dialog", { name: t.signedTitle(1) })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.done }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: t.deliveriesActionLabel(1) }));
    expect(await screen.findByRole("dialog", { name: t.deliveriesTitle(1) })).toBeInTheDocument();
  });

  it("says when the versions cannot be listed", async () => {
    listLaudoVersions.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByText(t.versionsError)).toBeInTheDocument();
  });
});
