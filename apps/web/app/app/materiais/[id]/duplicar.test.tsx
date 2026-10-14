import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { flowText } from "@/lib/i18n-flow";
import type { MaterialDetail } from "@/lib/types";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5" }),
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/app/materiais/5",
}));

function detail(overrides: Partial<MaterialDetail> = {}): MaterialDetail {
  return {
    id: 5,
    name: "Liga do Bruno",
    class_id: 1,
    class_name: "Metais",
    class_slug: "metais",
    subclass: null,
    description: null,
    is_demo: false,
    is_active: true,
    is_own_record: true,
    is_official: false,
    keywords: [],
    property_groups: [],
    processes: [],
    designations: [],
    composition: [],
    ...overrides,
  };
}

const state = vi.hoisted(() => ({ current: null as unknown, duplicate: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getMaterial: () => Promise.resolve(state.current),
  listProperties: () => Promise.resolve([]),
  getChart: () => new Promise(() => {}),
  duplicateMaterial: (id: number) => state.duplicate(id),
}));
vi.mock("@/lib/billing", () => ({ useCanEditCatalog: () => false }));
vi.mock("@/components/my-records/FavoriteButton", () => ({ FavoriteButton: () => null }));
vi.mock("@/components/my-records/useRecordVisit", () => ({ useRecordVisit: () => undefined }));
vi.mock("@/components/similar/SimilarPanel", () => ({ SimilarPanel: () => null }));
vi.mock("@/components/PropertyChart", () => ({ PropertyChart: () => null }));
vi.mock("@/components/CaeExportDialog", () => ({ MaterialExportMenu: () => null }));
vi.mock("@/components/material/MaterialCurves", () => ({ MaterialCurves: () => null }));
vi.mock("@/components/material/EquivalenceSection", () => ({ EquivalenceSection: () => null }));

const { default: MaterialPage } = await import("./page");

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MaterialPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  state.duplicate = vi.fn();
  state.current = detail();
});

describe("duplicar registro próprio (D-122)", () => {
  it("duplicates an own record and opens the copy", async () => {
    state.duplicate.mockResolvedValue(detail({ id: 9, name: "Liga do Bruno (cópia)" }));
    mount();
    await userEvent.click(await screen.findByRole("button", { name: flowText.duplicate.button }));
    await waitFor(() => expect(state.duplicate).toHaveBeenCalledWith(5));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/materiais/9"));
  });

  it("says why when the server refuses, and stays on the record", async () => {
    state.duplicate.mockRejectedValue(new Error("Só é possível duplicar um registro próprio."));
    mount();
    await userEvent.click(await screen.findByRole("button", { name: flowText.duplicate.button }));
    expect(await screen.findByRole("alert")).toHaveTextContent("duplicar um registro próprio");
    expect(push).not.toHaveBeenCalled();
  });

  it("does not offer it on a shared or official record", async () => {
    state.current = detail({ is_own_record: false });
    mount();
    await screen.findByRole("heading", { name: "Liga do Bruno" });
    expect(screen.queryByRole("button", { name: flowText.duplicate.button })).toBeNull();
  });

  it("names the original on a copy, with a link back", async () => {
    state.current = detail({ id: 9, name: "Cópia", copied_from: { id: 5, name: "Liga do Bruno" } });
    mount();
    const link = await screen.findByRole("link", { name: "Liga do Bruno" });
    expect(link).toHaveAttribute("href", "/app/materiais/5");
    expect(screen.getByText(new RegExp(flowText.duplicate.copiedFrom))).toBeInTheDocument();
  });
});
