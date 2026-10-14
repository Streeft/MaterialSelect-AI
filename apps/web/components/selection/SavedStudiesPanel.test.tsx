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

function mount(studies: StudySummary[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SavedStudiesPanel studies={studies} onRun={vi.fn()} onLoad={vi.fn()} onDelete={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("SavedStudiesPanel (D-120)", () => {
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
