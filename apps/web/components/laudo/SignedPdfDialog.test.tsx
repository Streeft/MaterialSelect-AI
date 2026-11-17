import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { laudoText as t } from "@/lib/i18n-laudo";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ApiError, type IssuedLaudo, type SignedPdf } from "@/lib/api";
import { SnackbarProvider } from "@/components/ui/Snackbar";

const listSignedPdfs = vi.fn<(id: number) => Promise<SignedPdf[]>>();
const uploadSignedPdf =
  vi.fn<(id: number, file: File, onProgress?: (fraction: number) => void) => Promise<SignedPdf>>();

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  listSignedPdfs: (id: number) => listSignedPdfs(id),
  uploadSignedPdf: (id: number, file: File, onProgress?: (fraction: number) => void) =>
    uploadSignedPdf(id, file, onProgress),
}));

const { SignedPdfDialog } = await import("./SignedPdfDialog");

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

function pdf(over: Partial<SignedPdf> = {}): SignedPdf {
  return {
    id: 1,
    issued_report_id: 5,
    filename: "laudo-assinado.pdf",
    size_bytes: 2048,
    sha256: "b".repeat(64),
    short_sha256: "BBBB-BBBB-BBBB",
    uploaded_at: "2026-11-16T15:00:00Z",
    uploaded_by: "ana@exemplo.com",
    current: true,
    ...over,
  };
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <SignedPdfDialog issued={issued} open onClose={() => undefined} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

const input = () => screen.getByLabelText(t.dropButton, { selector: "input" }) as HTMLInputElement;

function pdfFile(name = "assinado.pdf", body = "%PDF-1.7 conteudo") {
  return new File([body], name, { type: "application/pdf" });
}

beforeEach(() => {
  listSignedPdfs.mockReset().mockResolvedValue([]);
  uploadSignedPdf.mockReset();
});

describe("SignedPdfDialog (D-243)", () => {
  it("explains the rule, shows the empty history and has no accessibility violations", async () => {
    mount();
    const dialog = await screen.findByRole("dialog", { name: t.signedTitle(2) });
    expect(within(dialog).getByText(t.dropHint)).toBeInTheDocument();
    expect(await within(dialog).findByText(t.signedHistoryEmpty)).toBeInTheDocument();
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("lists every upload with the current one marked, its hash and a download", async () => {
    listSignedPdfs.mockResolvedValue([
      pdf({ id: 9, filename: "novo.pdf", current: true }),
      pdf({ id: 4, filename: "antigo.pdf", current: false, sha256: "c".repeat(64) }),
    ]);
    mount();
    const list = await screen.findByRole("list", { name: t.signedHistoryTable });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText(t.signedCurrent)).toBeInTheDocument();
    expect(within(items[1]!).getByText(t.signedReplaced)).toBeInTheDocument();
    expect(within(items[1]!).getByText(new RegExp("c{64}"))).toBeInTheDocument();
    const link = within(items[1]!).getByRole("link", { name: t.downloadLabel("antigo.pdf") });
    expect(link).toHaveAttribute("href", expect.stringContaining("/api/exports/laudos/5/pdf/4"));
    expect(link).toHaveAttribute("download");
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it("refuses a file that is not a PDF by its bytes, without sending it", async () => {
    mount();
    const user = userEvent.setup({ applyAccept: false });
    await screen.findByText(t.signedHistoryEmpty);
    await user.upload(input(), new File(["<html>não sou PDF</html>"], "falso.pdf", { type: "application/pdf" }));
    expect(await screen.findByText(t.notPdf("falso.pdf"))).toBeInTheDocument();
    expect(uploadSignedPdf).not.toHaveBeenCalled();
  });

  it("refuses a file over 10 MB without sending it", async () => {
    mount();
    const user = userEvent.setup();
    await screen.findByText(t.signedHistoryEmpty);
    // Only the size matters to the check; no need to build 10 MB in memory.
    const big = new File(["%PDF-1.7"], "grande.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 10 * 1024 * 1024 + 1 });
    await user.upload(input(), big);
    expect(await screen.findByText(t.tooBig("grande.pdf", 10))).toBeInTheDocument();
    expect(uploadSignedPdf).not.toHaveBeenCalled();
  });

  it("sends the PDF with a progress bar, then refreshes the history", async () => {
    let finish: (value: SignedPdf) => void = () => undefined;
    uploadSignedPdf.mockImplementation(
      (_id, _file, onProgress) =>
        new Promise<SignedPdf>((resolve) => {
          onProgress?.(0.4);
          finish = resolve;
        }),
    );
    mount();
    const user = userEvent.setup();
    await screen.findByText(t.signedHistoryEmpty);
    await user.upload(input(), pdfFile());
    const bar = await screen.findByRole("progressbar", { name: "assinado.pdf" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(uploadSignedPdf).toHaveBeenCalledTimes(1);
    expect(uploadSignedPdf.mock.calls[0]![0]).toBe(5);

    listSignedPdfs.mockResolvedValue([pdf({ filename: "assinado.pdf" })]);
    finish(pdf({ filename: "assinado.pdf" }));
    expect(await screen.findByText(t.uploadStatus.done)).toBeInTheDocument();
    expect(await screen.findByText(t.uploadedToast("assinado.pdf"))).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: t.signedHistoryTable });
    expect(within(list).getByText("assinado.pdf")).toBeInTheDocument();
  });

  it("shows the server's refusal in words and lets the person try again", async () => {
    uploadSignedPdf.mockRejectedValueOnce(
      new ApiError("O PDF excede o limite de 10 MB. Reduza o arquivo e envie outra vez.", 413),
    );
    mount();
    const user = userEvent.setup();
    await screen.findByText(t.signedHistoryEmpty);
    await user.upload(input(), pdfFile());
    expect(await screen.findByText(t.uploadStatus.failed)).toBeInTheDocument();
    expect(await screen.findByText(/O PDF excede o limite de 10 MB/, { selector: "p" })).toBeInTheDocument();
    // the zone is usable again
    uploadSignedPdf.mockResolvedValueOnce(pdf());
    await user.upload(input(), pdfFile("outra.pdf"));
    await waitFor(() => expect(uploadSignedPdf).toHaveBeenCalledTimes(2));
  });

  it("says when the history cannot be listed", async () => {
    listSignedPdfs.mockRejectedValue(new Error("x"));
    mount();
    expect(await screen.findByText(t.signedHistoryError)).toBeInTheDocument();
  });
});
