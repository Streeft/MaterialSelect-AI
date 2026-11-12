import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import { ptBR } from "@/lib/i18n";

const t = ptBR.importer;

const upload = {
  job_id: 5,
  filename: "ligas.csv",
  file_format: "csv",
  sheet_names: [],
  sheet_name: null,
  headers: ["nome", "classe", "densidade"],
  sample_rows: [["Liga A", "Metais", "2,7"]],
  row_count: 2,
  suggestions: [
    { column: "nome", suggested_target: "name" },
    { column: "classe", suggested_target: "class" },
    {
      column: "densidade",
      suggested_target: "property",
      suggested_property_slug: "densidade",
      suggested_role: "value",
      suggested_unit: "g/cm**3",
    },
  ],
};

const report = {
  job_id: 5,
  status: "VALIDADO",
  row_count: 2,
  valid_count: 1,
  error_count: 1,
  duplicate_count: 0,
  rows: [
    { row_number: 1, name: "Liga A", status: "ok", issues: [], warnings: [], cells: {} },
    {
      row_number: 2,
      name: "Liga B",
      status: "error",
      issues: [{ column: "densidade", message: "Valor não numérico: abc." }],
      warnings: [],
      cells: { nome: "Liga B", classe: null, densidade: "abc" },
    },
  ],
};

const api = vi.hoisted(() => ({
  uploadImportFile: vi.fn(),
  validateImport: vi.fn(),
  listImports: vi.fn(),
  cancelImport: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  uploadImportFile: api.uploadImportFile,
  validateImport: api.validateImport,
  listImports: api.listImports,
  cancelImport: api.cancelImport,
  commitImport: vi.fn(),
  createImportTemplate: vi.fn(),
  previewImportSheet: vi.fn(),
  rollbackImport: vi.fn(),
  listClasses: vi.fn().mockResolvedValue([{ id: 1, name: "Metais", slug: "metais", parent_id: null }]),
  listProperties: vi.fn().mockResolvedValue([{ id: 1, name: "Densidade", slug: "densidade" }]),
  listImportTemplates: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/importar" }));
vi.mock("@/components/auth/CatalogReadOnlyNotice", () => ({ CatalogReadOnlyNotice: () => null }));

import ImportPage from "./page";

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ImportPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listImports.mockResolvedValue([]);
  api.uploadImportFile.mockResolvedValue(upload);
  api.validateImport.mockResolvedValue(report);
});

async function sendFile(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.upload(document.querySelector<HTMLInputElement>("input[type=file]")!, file);
}

describe("Importar (D-221)", () => {
  it("recusa, antes de enviar, o que não é CSV ou XLSX e o que passa de 5 MB", async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await sendFile(user, new File(["x"], "foto.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errorFileType);

    await sendFile(user, new File([new Uint8Array(5 * 1024 * 1024 + 1)], "grande.csv"));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errorFileSize);
    expect(api.uploadImportFile).not.toHaveBeenCalled();
  });

  it("marca a célula com erro na linha que não passou, e a vazia continua vazia", async () => {
    const user = userEvent.setup();
    renderPage();
    await sendFile(user, new File(["nome;classe;densidade"], "ligas.csv"));
    await user.click(await screen.findByRole("button", { name: t.validate }));

    const grid = await screen.findByRole("region", { name: t.cellsTitle });
    const row = within(grid).getByText("Liga B").closest("tr") as HTMLElement;
    const cell = within(row).getByText("abc").closest("td") as HTMLElement;
    expect(within(cell).getByText(/Valor não numérico: abc\./)).toBeInTheDocument();
    expect(within(cell).getByText(new RegExp(t.cellProblem))).toBeInTheDocument();
    // The empty class cell says "vazia" (never 0 or a dash) and carries no mark.
    const empty = within(row).getByText(t.emptyCell).closest("td") as HTMLElement;
    expect(empty).not.toHaveTextContent(t.cellProblem);
    // The row that passed is not in the grid.
    expect(within(grid).queryByText("Liga A")).not.toBeInTheDocument();
  });

  it("volta do relatório ao mapeamento e deste ao arquivo, sem reenviar", async () => {
    const user = userEvent.setup();
    renderPage();
    await sendFile(user, new File(["x"], "ligas.csv"));
    await user.click(await screen.findByRole("button", { name: t.validate }));
    await user.click(await screen.findByRole("button", { name: new RegExp(t.backToMapping) }));
    await user.click(screen.getByRole("button", { name: new RegExp(t.backToFile) }));

    expect(screen.getByText(t.fileKept("ligas.csv"))).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.continueWith }));
    expect(screen.getByRole("heading", { name: t.mappingTitle })).toBeInTheDocument();
    expect(api.uploadImportFile).toHaveBeenCalledTimes(1);
  });

  it("diz em palavras quando o histórico não carrega, e deixa tentar de novo", async () => {
    api.listImports.mockRejectedValueOnce(new Error("Failed to fetch"));
    renderPage();
    expect(await screen.findByText(t.historyError)).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: ptBR.ui.retry })).toBeInTheDocument();
  });

  it("mostra o vazio do histórico", async () => {
    renderPage();
    expect(await screen.findByText(t.historyEmpty)).toBeInTheDocument();
  });

  it("não tem violações de acessibilidade no relatório com a grade de células", async () => {
    const user = userEvent.setup();
    const { container } = renderPage();
    await sendFile(user, new File(["x"], "ligas.csv"));
    await user.click(await screen.findByRole("button", { name: t.validate }));
    await waitFor(() => expect(screen.getByRole("region", { name: t.cellsTitle })).toBeInTheDocument());
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
