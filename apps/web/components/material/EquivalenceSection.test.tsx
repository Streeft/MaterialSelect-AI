import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EquivalenceGroup, MaterialEquivalences } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";

const t = ptBR.equivalences;

const api = vi.hoisted(() => ({ listMaterialEquivalences: vi.fn() }));
vi.mock("@/lib/api", () => ({
  listMaterialEquivalences: api.listMaterialEquivalences,
}));

const { EquivalenceSection } = await import("./EquivalenceSection");

const group: EquivalenceGroup = {
  id: 1,
  kind: "APROXIMADA",
  kind_label: "Aproximada",
  kind_meaning:
    "A fonte declara uma correspondência aproximada, com diferenças.",
  source_id: 9,
  source_label: "Dataset Demo MaterialSelect",
  license_label: null,
  citation: null,
  note: null,
  is_demo: true,
  members: [
    {
      designation_id: 1,
      system: "ABNT",
      system_label: "ABNT NBR",
      code: "DEMO-AL-61",
      region: null,
      material_id: 2,
      material_name: "Liga Alumínio Demo A",
      material_is_active: true,
      is_self: true,
    },
    {
      designation_id: 2,
      system: "ABNT",
      system_label: "ABNT NBR",
      code: "DEMO-6061-T6",
      region: null,
      material_id: 7,
      material_name: "Liga de Alumínio 6061-T6",
      material_is_active: false,
      is_self: false,
    },
  ],
};

function mount(
  data: MaterialEquivalences | Error | "pending",
  materialIsDemo = false,
) {
  if (data === "pending")
    api.listMaterialEquivalences.mockReturnValue(new Promise(() => {}));
  else if (data instanceof Error)
    api.listMaterialEquivalences.mockRejectedValue(data);
  else api.listMaterialEquivalences.mockResolvedValue(data);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <EquivalenceSection materialId={2} materialIsDemo={materialIsDemo} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.listMaterialEquivalences.mockReset();
});

describe("EquivalenceSection (D-115)", () => {
  it("says it is loading", async () => {
    mount("pending");
    expect(screen.getByText(t.loading)).toBeInTheDocument();
  });

  it("says it failed", async () => {
    mount(new Error("x"));
    expect(await screen.findByText(t.error)).toBeInTheDocument();
  });

  it("writes 'none declared' instead of an empty table or a dash", async () => {
    const { container } = mount({ material_id: 2, groups: [] });
    expect(await screen.findByText(t.none)).toBeInTheDocument();
    expect(screen.getByText(t.noneHint)).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
  });

  it("shows kind and source in words, the other material, and absent fields labelled", async () => {
    const { container } = mount({ material_id: 2, groups: [group] });
    const table = await screen.findByRole("table", {
      name: t.groupCaption("Aproximada"),
    });
    expect(screen.getByText("Aproximada")).toBeInTheDocument();
    expect(screen.getByText(group.kind_meaning)).toBeInTheDocument();
    expect(screen.getByText("Dataset Demo MaterialSelect")).toBeInTheDocument();
    // A fictitious group on a real material says so.
    expect(screen.getByText(t.demoRow)).toBeInTheDocument();
    // Absence is written, never blank, "—" or 0.
    expect(screen.getByText(t.noLicense)).toBeInTheDocument();
    expect(screen.getByText(t.noCitation)).toBeInTheDocument();
    expect(screen.getByText(t.noNote)).toBeInTheDocument();
    expect(within(table).getByText(t.thisMaterial)).toBeInTheDocument();
    expect(
      within(table).getByRole("link", { name: "Liga de Alumínio 6061-T6" }),
    ).toHaveAttribute("href", "/app/materiais/7");
    expect(within(table).getByText(t.withdrawn)).toBeInTheDocument();
    expect(container.textContent).not.toContain("—");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it("does not repeat 'fictício' when the page already says the material is", async () => {
    mount({ material_id: 2, groups: [group] }, true);
    await screen.findByText("Aproximada");
    expect(screen.queryByText(t.demoRow)).not.toBeInTheDocument();
  });
});
