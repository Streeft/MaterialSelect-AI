import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flowText } from "@/lib/i18n-flow";
import type { StudySummary } from "@/lib/types";

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  studyExportUrl: (id: number, format: string) => `/export/${id}.${format}`,
  studyFileUrl: (id: number) => `/estudos/${id}/export`,
  importStudyFile: vi.fn(),
}));
vi.mock("@/components/ai/StudyExplanation", () => ({ StudyExplanation: () => null }));
vi.mock("@/components/EngineeringReportLink", () => ({ EngineeringReportLink: () => null }));

const { SavedStudiesPanel } = await import("./SavedStudiesPanel");

function study(id: number, name: string, has_notes: boolean): StudySummary {
  return {
    id,
    name,
    universe: "material",
    description: null,
    created_at: "2026-10-14T00:00:00Z",
    constraint_count: 1,
    criterion_count: 1,
    stage_count: 1,
    has_notes,
  };
}

function mount(
  studies: StudySummary[],
  onSaveNote?: (id: number, notes: string) => Promise<unknown>,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SavedStudiesPanel
        studies={studies}
        onRun={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        onSaveNote={onSaveNote}
      />
    </QueryClientProvider>,
  );
}

describe("SavedStudiesPanel (D-122)", () => {
  it("marks only the studies that carry notes", async () => {
    mount([study(1, "Com nota", true), study(2, "Sem nota", false)]);
    await userEvent.click(screen.getByText(/Meus estudos/i));
    expect(screen.getAllByText(flowText.notes.hasNotes)).toHaveLength(1);
  });

  it("offers the study file inside the one Exportar menu, as a download", async () => {
    mount([study(7, "Haste", false)]);
    await userEvent.click(screen.getByText(/Meus estudos/i));
    await userEvent.click(screen.getByRole("button", { name: /Exportar/ }));
    const item = await screen.findByRole("menuitem", { name: (name) => name.includes(flowText.file.exportItem) });
    expect(item).toHaveAttribute("href", "/estudos/7/export");
    expect(item).toHaveAttribute("download");
  });

  it("puts Importar estudo at the top, even with no study saved", async () => {
    mount([]);
    await userEvent.click(screen.getByText(/Meus estudos/i));
    expect(screen.getByRole("button", { name: flowText.file.importButton })).toBeInTheDocument();
  });
});

describe("SavedStudiesPanel: nota editável no lugar (FL-c, D-240)", () => {
  it("mostra a nota e salva só ela, sem abrir o estudo", async () => {
    const user = userEvent.setup();
    const onSaveNote = vi.fn().mockResolvedValue(undefined);
    mount([{ ...study(3, "Viga", true), notes: "por que 200 MPa" }], onSaveNote);
    await user.click(screen.getByText(/Meus estudos/i));
    expect(screen.getByText("por que 200 MPa")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Editar notas do estudo: Viga` }));
    const field = screen.getByRole("textbox", { name: `${flowText.notes.studyLabel} de Viga` });
    await user.clear(field);
    await user.type(field, "revisada");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSaveNote).toHaveBeenCalledWith(3, "revisada");
  });

  it("diz que não há nota, em vez de deixar o espaço vazio", async () => {
    mount([study(4, "Haste", false)], vi.fn());
    await userEvent.click(screen.getByText(/Meus estudos/i));
    expect(screen.getByText(flowText.notes.none)).toBeInTheDocument();
  });
});
