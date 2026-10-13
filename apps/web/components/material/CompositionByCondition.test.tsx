import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AtomicComposition, CompositionEntry } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { atomicContent, compositionConditions } from "@/lib/composition";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { CompositionByCondition, CONDITION_PARAM } from "./CompositionByCondition";

const t = ptBR.detail;

const nav = vi.hoisted(() => ({ query: "", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.query),
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => "/app/materiais/2",
}));

beforeEach(() => {
  nav.query = "";
  nav.replace.mockReset();
});

function row(overrides: Partial<CompositionEntry>): CompositionEntry {
  return {
    element: "Cu",
    element_name: "Cobre",
    atomic_number: 29,
    state: "faixa",
    condition_label: null,
    value_min: null,
    value_max: null,
    value_nominal: 70,
    original_unit: "%",
    normalized_min: null,
    normalized_max: null,
    normalized_nominal: 70,
    canonical_unit: "percent",
    conversion_method: "identity:percent",
    notes: null,
    data_quality: "ESTIMADO",
    source_label: "Fonte A",
    citation: null,
    is_demo: false,
    ...overrides,
  };
}

const BASIS = "IUPAC/CIAAW 2021, pesos atômicos padrão abreviados";

// Two compositions: none stated (with a balance, so no atomic percent) and
// "laminado" (closes at 100 %, so the backend derived it).
const entries: CompositionEntry[] = [
  row({ condition_label: "laminado" }),
  row({
    element: "Zn",
    element_name: "Zinco",
    atomic_number: 30,
    condition_label: "laminado",
    value_nominal: 30,
    normalized_nominal: 30,
  }),
  row({ value_nominal: null, normalized_nominal: null, value_min: 60, value_max: 63, normalized_min: 60, normalized_max: 63 }),
  row({
    element: "Zn",
    element_name: "Zinco",
    atomic_number: 30,
    state: "resto",
    value_nominal: null,
    normalized_nominal: null,
    original_unit: null,
  }),
];

const atomic: AtomicComposition[] = [
  {
    condition_label: null,
    label: "derivada",
    basis: BASIS,
    entries: [],
    reason: "resto_declarado",
    message: "Zn é declarado como resto, e o resto nunca é calculado.",
  },
  {
    condition_label: "laminado",
    label: "derivada",
    basis: BASIS,
    entries: [
      { element: "Cu", atomic_min: 70.5937, atomic_max: 70.5937 },
      { element: "Zn", atomic_min: 29.4063, atomic_max: 29.4063 },
    ],
    reason: null,
    message: null,
  },
];

describe("compositionConditions", () => {
  it("puts no condition first, then the labels in the source's order", () => {
    expect(compositionConditions(entries)).toEqual([null, "laminado"]);
  });
});

describe("atomicContent", () => {
  it("writes a point once and a range with both ends", () => {
    expect(atomicContent({ element: "Cu", atomic_min: 70.5, atomic_max: 70.5 })).toBe("70,5 %");
    expect(atomicContent({ element: "Cu", atomic_min: 70.5, atomic_max: 70.6 })).toBe(
      t.atomicRange("70,5 %", "70,6 %"),
    );
  });
});

describe("CompositionByCondition (TM2-c)", () => {
  it("opens on the composition with no condition, and writes the absent atomic percent", () => {
    render(<CompositionByCondition entries={entries} atomic={atomic} materialIsDemo={false} />);
    const table = screen.getByRole("table", { name: t.compositionCaption });
    expect(within(table).getByText(t.contentBalance)).toBeInTheDocument();
    // Not a column of blanks: a sentence, with the reason.
    expect(within(table).queryByText(t.columnAtomic)).not.toBeInTheDocument();
    expect(screen.getByText(t.atomicAbsentTitle)).toBeInTheDocument();
    expect(screen.getByText(/resto nunca é calculado/)).toBeInTheDocument();
  });

  it("shows the chosen condition from the URL, with the derived atomic percent labelled", async () => {
    nav.query = `${CONDITION_PARAM}=laminado`;
    const { container } = render(
      <CompositionByCondition entries={entries} atomic={atomic} materialIsDemo={false} />,
    );
    const table = screen.getByRole("table", { name: t.conditionCaption("laminado") });
    expect(within(table).getByText(t.columnAtomic)).toBeInTheDocument();
    expect(within(table).getByText("70,5937 %")).toBeInTheDocument();
    expect(screen.getByText(t.atomicBasis(BASIS))).toBeInTheDocument();
    expect(screen.queryByText(t.atomicAbsentTitle)).not.toBeInTheDocument();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it("keeps the choice in the URL, and no condition is the absence of the parameter", async () => {
    nav.query = `${CONDITION_PARAM}=laminado&unidades=x`;
    render(<CompositionByCondition entries={entries} atomic={atomic} materialIsDemo={false} />);
    const picker = screen.getByRole("group", { name: t.conditionPicker });
    await userEvent.click(within(picker).getByRole("button", { name: t.conditionNone }));
    expect(nav.replace).toHaveBeenCalledWith("/app/materiais/2?unidades=x", { scroll: false });
  });

  it("an unknown condition in the URL falls back to the first, never to an empty table", () => {
    nav.query = `${CONDITION_PARAM}=forjado`;
    render(<CompositionByCondition entries={entries} atomic={atomic} materialIsDemo={false} />);
    expect(screen.getByRole("table", { name: t.compositionCaption })).toBeInTheDocument();
    expect(screen.queryByText(t.noComposition)).not.toBeInTheDocument();
  });

  it("a single composition has no picker", () => {
    render(
      <CompositionByCondition entries={entries.slice(2)} atomic={atomic.slice(0, 1)} materialIsDemo={false} />,
    );
    expect(screen.queryByRole("group", { name: t.conditionPicker })).not.toBeInTheDocument();
  });

  it("no composition is still written out", () => {
    render(<CompositionByCondition entries={[]} atomic={[]} materialIsDemo={false} />);
    expect(screen.getByText(t.noComposition)).toBeInTheDocument();
  });
});
