import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flowText } from "@/lib/i18n-flow";

const api = vi.hoisted(() => ({ impl: undefined as undefined | ((text: string) => Promise<unknown>) }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  importStudyFile: (text: string) => api.impl!(text),
}));
import { ApiError } from "@/lib/api";

const { ImportStudyButton, MAX_STUDY_FILE_BYTES } = await import("./ImportStudyButton");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <ImportStudyButton />
    </QueryClientProvider>,
  );
  return spy;
}

function fileInput(): HTMLInputElement {
  return screen.getByLabelText(flowText.file.importButton, { selector: "input" });
}

let importStudyFile = vi.fn();
beforeEach(() => {
  importStudyFile = vi.fn();
  api.impl = (text) => importStudyFile(text);
});

describe("ImportStudyButton", () => {
  it("sends the file text untouched to the API and announces the imported study", async () => {
    importStudyFile.mockResolvedValue({ name: "Haste (importado)" });
    const invalidate = mount();
    const body = '{"format":"materialselect-ai/estudo","version":1}';
    await userEvent.upload(fileInput(), new File([body], "estudo.json", { type: "application/json" }));
    await waitFor(() => expect(importStudyFile).toHaveBeenCalledWith(body));
    expect(await screen.findByText(flowText.file.importDone("Haste (importado)"))).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["studies"] });
  });

  it("shows the API's own message when the file is refused", async () => {
    importStudyFile.mockRejectedValue(
      new ApiError("O arquivo tem campos desconhecidos: study.hack.", 400),
    );
    mount();
    await userEvent.upload(fileInput(), new File(["{}"], "x.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("campos desconhecidos: study.hack");
  });

  it("refuses an oversized file before uploading anything", async () => {
    mount();
    const big = new File([new Uint8Array(MAX_STUDY_FILE_BYTES + 1)], "grande.json", {
      type: "application/json",
    });
    await userEvent.upload(fileInput(), big);
    expect(await screen.findByRole("alert")).toHaveTextContent(flowText.file.tooBig);
    expect(importStudyFile).not.toHaveBeenCalled();
  });

  it("refuses a file that is not .json before uploading anything", async () => {
    mount();
    await userEvent.upload(fileInput(), new File(["<html>"], "pagina.html", { type: "text/html" }), {
      applyAccept: false,
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(flowText.file.notJson);
    expect(importStudyFile).not.toHaveBeenCalled();
  });
});
