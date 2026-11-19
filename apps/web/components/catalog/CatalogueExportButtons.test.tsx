import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError, csvEndsInStreamError, downloadCatalogueFile } from "@/lib/api";
import { ptBR } from "@/lib/i18n";
import { catalogueExportText as text } from "@/lib/i18n-catalogue-export";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { CatalogueExportButtons } from "./CatalogueExportButtons";

function wrap(download: typeof downloadCatalogueFile, saveFile = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <CatalogueExportButtons download={download} saveFile={saveFile} />
    </QueryClientProvider>,
  );
  return { ...view, saveFile };
}

const whole = { blob: new Blob(["Material\r\nAço\r\n"]), filename: "catalogo.csv", truncated: false };
const cut = { ...whole, truncated: true };

async function chooseCsv(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: ptBR.exports.catalogue }));
  await user.click(screen.getByRole("menuitem", { name: new RegExp(ptBR.exports.csv) }));
}

describe("CatalogueExportButtons (D-249)", () => {
  it("saves a whole CSV under the server's name and says nothing alarming", async () => {
    const user = userEvent.setup();
    const { saveFile } = wrap(vi.fn().mockResolvedValue(whole));
    await chooseCsv(user);
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(whole.blob, "catalogo.csv"));
    expect(await screen.findByRole("status")).toHaveTextContent(text.saved("catalogo.csv"));
    expect(screen.queryByText(text.truncatedTitle)).toBeNull();
  });

  it("warns on the screen when the CSV came back cut, and still hands over the file", async () => {
    const user = userEvent.setup();
    const { saveFile } = wrap(vi.fn().mockResolvedValue(cut));
    await chooseCsv(user);
    expect(await screen.findByText(text.truncatedTitle)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(text.truncated("catalogo.csv"));
    expect(saveFile).toHaveBeenCalledWith(cut.blob, "catalogo.csv");
    // A cut file is never reported as "generated" in the same breath.
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the server's refusal when the file cannot be made", async () => {
    const user = userEvent.setup();
    const { saveFile } = wrap(vi.fn().mockRejectedValue(new ApiError("Muitas exportações.", 429)));
    await chooseCsv(user);
    expect(await screen.findByText(text.errorTitle)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Muitas exportações.");
    expect(saveFile).not.toHaveBeenCalled();
  });

  it("blocks a second request while the file is made", async () => {
    const user = userEvent.setup();
    let finish: (value: typeof whole) => void = () => {};
    const download = vi.fn(() => new Promise<typeof whole>((resolve) => (finish = resolve)));
    wrap(download);
    await chooseCsv(user);
    const busy = await screen.findByRole("button", { name: text.running });
    expect(busy).toBeDisabled();
    finish(whole);
    await waitFor(() => expect(screen.getByRole("button", { name: ptBR.exports.catalogue })).toBeEnabled());
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("keeps the other formats as plain downloads of an address", async () => {
    const user = userEvent.setup();
    const download = vi.fn();
    wrap(download);
    await user.click(screen.getByRole("button", { name: ptBR.exports.catalogue }));
    const xlsx = screen.getByRole("menuitem", { name: new RegExp(ptBR.exports.xlsx) });
    expect(xlsx).toHaveAttribute("href", expect.stringContaining("/api/exports/catalogo.xlsx"));
    expect(xlsx).toHaveAttribute("download");
    expect(download).not.toHaveBeenCalled();
  });

  it("has no accessibility violations with the warning showing", async () => {
    const user = userEvent.setup();
    const { container } = wrap(vi.fn().mockResolvedValue(cut));
    await chooseCsv(user);
    await screen.findByText(text.truncatedTitle);
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

describe("csvEndsInStreamError and downloadCatalogueFile (D-249)", () => {
  const MARK = "# ERRO: exportação interrompida; este arquivo está incompleto. Baixe novamente.";

  it("recognises the server's last line, with or without a final break", () => {
    expect(csvEndsInStreamError(`a;b\r\n1;2\r\n\r\n${MARK}\r\n`)).toBe(true);
    expect(csvEndsInStreamError(`a;b\n${MARK}`)).toBe(true);
    expect(csvEndsInStreamError(`﻿${MARK}`)).toBe(true);
  });

  it("does not take an ordinary file, or a line that merely mentions it, for a cut one", () => {
    expect(csvEndsInStreamError("a;b\r\n1;2\r\n")).toBe(false);
    expect(csvEndsInStreamError("")).toBe(false);
    // Only the LAST line counts: a note in the middle of a finished file is not an interruption.
    expect(csvEndsInStreamError(`${MARK}\r\na;b\r\n1;2\r\n`)).toBe(false);
  });

  function stub(body: string, init: ResponseInit = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(body, {
          status: 200,
          headers: { "content-disposition": 'attachment; filename="catalogo-de-materiais.csv"' },
          ...init,
        }),
      ),
    );
  }

  it("reads the end of the fetched CSV and returns the server's filename", async () => {
    stub(`Material\r\n${"x".repeat(5000)}\r\n\r\n${MARK}\r\n`);
    const result = await downloadCatalogueFile("csv");
    expect(result.truncated).toBe(true);
    expect(result.filename).toBe("catalogo-de-materiais.csv");
    stub("Material\r\nAço\r\n");
    expect((await downloadCatalogueFile("csv")).truncated).toBe(false);
    vi.unstubAllGlobals();
  });

  it("never calls a spreadsheet cut, whatever its bytes spell", async () => {
    stub(MARK);
    expect((await downloadCatalogueFile("xlsx")).truncated).toBe(false);
    vi.unstubAllGlobals();
  });

  it("turns a refusal into an ApiError with the server's sentence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: "Limite de exportações atingido." }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    await expect(downloadCatalogueFile("csv")).rejects.toMatchObject({
      status: 429,
      message: "Limite de exportações atingido.",
    });
    vi.unstubAllGlobals();
  });
});
