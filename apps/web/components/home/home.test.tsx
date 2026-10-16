import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
// See the note in components/layout/layout.test.tsx: MWC button roles live
// inside a shadow root, invisible to plain @testing-library/react queries.
import { screen } from "shadow-dom-testing-library";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SavedStudies } from "./SavedStudies";
import { Greeting } from "./Greeting";
import { RecentRecords } from "./RecentRecords";
import { ptBR } from "@/lib/i18n";
import { findA11yViolations, describeViolations } from "@/lib/testing/axe";
import type { Bookmark, CurrentUser, MyRecords, StudySummary } from "@/lib/types";

const listStudies = vi.fn<() => Promise<StudySummary[]>>();
const getMyRecords = vi.fn<() => Promise<MyRecords>>();
const getCurrentUser = vi.fn<() => Promise<CurrentUser>>();
vi.mock("@/lib/api", () => ({
  listStudies: () => listStudies(),
  getMyRecords: () => getMyRecords(),
  getCurrentUser: () => getCurrentUser(),
}));

function makeStudy(overrides: Partial<StudySummary> = {}): StudySummary {
  return {
    id: 7,
    name: "Painel de fuselagem",
    description: null,
    created_at: "2026-03-14T10:00:00Z",
    constraint_count: 3,
    universe: "material",
    criterion_count: 1,
    stage_count: 1,
    ...overrides,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  // No retries: a test that waits out three backoffs is a test nobody runs.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("SavedStudies", () => {
  it("offers each saved study as a link that reopens it", async () => {
    listStudies.mockResolvedValue([makeStudy()]);
    render(<SavedStudies />, { wrapper });

    const resume = await screen.findByShadowRole("link", { name: ptBR.home.resume });
    expect(resume).toHaveAttribute("href", "/app/selecao?estudo=7");
    expect(screen.getByText("Painel de fuselagem")).toBeInTheDocument();
  });

  it("agrees with the number it is counting", async () => {
    listStudies.mockResolvedValue([makeStudy({ constraint_count: 1, criterion_count: 2 })]);
    render(<SavedStudies />, { wrapper });

    expect(await screen.findByText(`1 ${ptBR.home.constraintOne}`)).toBeInTheDocument();
    expect(screen.getByText(`2 ${ptBR.home.criterionMany}`)).toBeInTheDocument();
  });

  it("says there is nothing saved instead of showing an empty list", async () => {
    listStudies.mockResolvedValue([]);
    render(<SavedStudies />, { wrapper });

    expect(await screen.findByText(ptBR.home.savedEmpty)).toBeInTheDocument();
    expect(screen.getByText(ptBR.home.savedEmptyHint)).toBeInTheDocument();
  });

  it("says the list failed rather than pretending it is empty", async () => {
    listStudies.mockRejectedValue(new Error("boom"));
    render(<SavedStudies />, { wrapper });

    expect(await screen.findByText(ptBR.home.savedError)).toBeInTheDocument();
    expect(screen.queryByText(ptBR.home.savedEmpty)).not.toBeInTheDocument();
  });
});

function bookmark(overrides: Partial<Bookmark> & { name?: string; id?: number } = {}): Bookmark {
  const { name = "Aço 1020", id = 3, ...rest } = overrides;
  return {
    universe: "material",
    at: "2026-10-15T10:00:00Z",
    process: null,
    material: {
      id,
      name,
      class_name: "Metais",
      class_slug: "metais",
      subclass: null,
      is_demo: false,
      is_own_record: false,
      keywords: [],
      designations: [],
      quality: { medido: 1, importado: 0, estimado: 0, missing: 0 },
    },
    ...rest,
  };
}

const records = (recents: Bookmark[]): MyRecords => ({ favorites: [], recents, own_records: [] });

describe("Greeting (D-132)", () => {
  const user = (name: string): CurrentUser => ({
    id: 1,
    email: "a@example.com",
    name,
    avatar_url: null,
    project_id: 1,
  });

  it("greets by the first name only", async () => {
    getCurrentUser.mockResolvedValue(user("  Maria  de Souza "));
    render(<Greeting />, { wrapper });
    expect(await screen.findByText(ptBR.home.greeting("Maria"))).toBeInTheDocument();
  });

  it("draws nothing when the account has no name, instead of inventing one", async () => {
    getCurrentUser.mockResolvedValue(user("   "));
    const { container } = render(<Greeting />, { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RecentRecords (D-132)", () => {
  it("lists what the reader opened last, each one a link to its sheet", async () => {
    getMyRecords.mockResolvedValue(records([bookmark({ name: "Aço 1020", id: 3 })]));
    render(<RecentRecords />, { wrapper });

    const link = await screen.findByRole("link", { name: /Aço 1020/ });
    expect(link).toHaveAttribute("href", "/app/materiais/3");
    expect(screen.getByText(ptBR.myRecords.universeMaterial)).toBeInTheDocument();
  });

  it("shows at most six and skips a record that no longer resolves", async () => {
    const many = Array.from({ length: 8 }, (_, i) => bookmark({ name: `Material ${i + 1}`, id: i + 1 }));
    const gone: Bookmark = { universe: "material", at: "2026-10-15T10:00:00Z", material: null, process: null };
    getMyRecords.mockResolvedValue(records([gone, ...many]));
    render(<RecentRecords />, { wrapper });

    await screen.findByRole("link", { name: /Material 1/ });
    expect(screen.getAllByRole("link")).toHaveLength(6);
  });

  it("says nothing was seen yet, in words, rather than showing an empty shelf", async () => {
    getMyRecords.mockResolvedValue(records([]));
    render(<RecentRecords />, { wrapper });
    expect(await screen.findByText(ptBR.home.recentEmpty)).toBeInTheDocument();
    expect(screen.getByText(ptBR.home.recentEmptyHint)).toBeInTheDocument();
  });

  it("says the shelf failed rather than pretending it is empty", async () => {
    getMyRecords.mockRejectedValue(new Error("boom"));
    render(<RecentRecords />, { wrapper });
    expect(await screen.findByText(ptBR.home.recentError)).toBeInTheDocument();
    expect(screen.queryByText(ptBR.home.recentEmpty)).not.toBeInTheDocument();
  });

  it("has no accessibility violations with the shelf full", async () => {
    getMyRecords.mockResolvedValue(records([bookmark({ name: "Aço 1020", id: 3 })]));
    render(<RecentRecords />, { wrapper });
    await screen.findByRole("link", { name: /Aço 1020/ });
    const violations = await findA11yViolations(document.body);
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});
