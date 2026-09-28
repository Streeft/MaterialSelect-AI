import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  InfographicLayout,
  InfographicStyle,
  NotebookCitation,
  StudioArtifact,
  StudioInfographicContent,
} from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { INFOGRAPHIC_TONES, InfographicView, toneOf } from "./InfographicView";
import type { Cites } from "./views";

const t = ptBR.notebooks.studio;

const citation: NotebookCitation = {
  number: 1,
  chunk_id: 90,
  source_id: 11,
  source_title: "Aula de aços",
  heading: "Aços",
  page_start: null,
  page_end: null,
  excerpt: "O aço carbono tem densidade de 7850 kg/m³.",
};

const cites: Cites = { byNumber: new Map([[1, citation]]), liveSourceIds: new Set([11]) };

const content: StudioInfographicContent = {
  title: "Aços estruturais",
  subtitle: "O que as fontes dizem",
  stats: [
    { value: "7850 kg/m³", label: "densidade do aço carbono", citations: [1] },
    { value: "210 GPa", label: "módulo de Young", citations: [1] },
  ],
  points: [{ heading: "Soldabilidade", text: "Cai com o teor de carbono.", citations: [1] }],
  steps: [
    { text: "Laminar a chapa", citations: [] },
    { text: "Soldar as partes", citations: [1] },
  ],
};

const style = (over: Partial<InfographicStyle>): InfographicStyle => ({
  pad_x: 18,
  pad_y: 16,
  heading_size: 15,
  heading_line: 20,
  heading_char: 0.6,
  heading_max_lines: 3,
  body_size: 13,
  body_line: 18,
  body_char: 0.55,
  body_max_lines: 12,
  gap: 8,
  ...over,
});

const layout: InfographicLayout = {
  width: 1200,
  height: 600,
  orientation: "paisagem",
  styles: {
    title: style({ pad_x: 0, pad_y: 0, heading_size: 30, heading_line: 36, gap: 0 }),
    subtitle: style({ pad_x: 0, pad_y: 0, body_size: 17, body_line: 24, gap: 0 }),
    stat: style({ heading_size: 30, heading_line: 36, gap: 6 }),
    point: style({}),
    step: style({}),
  },
  blocks: [
    { kind: "title", x: 40, y: 40, width: 1120, height: 36, heading_lines: ["Aços estruturais"], body_lines: [], citations: [], tone: 0, index: 0 },
    { kind: "subtitle", x: 40, y: 88, width: 1120, height: 24, heading_lines: [], body_lines: ["O que as fontes dizem"], citations: [], tone: 0, index: 0 },
    { kind: "stat", x: 40, y: 144, width: 262, height: 94, heading_lines: ["7850 kg/m³"], body_lines: ["densidade do aço carbono"], citations: [1], tone: 0, index: 0 },
    { kind: "stat", x: 326, y: 144, width: 262, height: 94, heading_lines: ["210 GPa"], body_lines: ["módulo de Young"], citations: [1], tone: 1, index: 1 },
    { kind: "point", x: 40, y: 270, width: 548, height: 80, heading_lines: ["Soldabilidade"], body_lines: ["Cai com o teor de carbono."], citations: [1], tone: 0, index: 0 },
    { kind: "step", x: 40, y: 382, width: 540, height: 80, heading_lines: ["1"], body_lines: ["Laminar a chapa"], citations: [], tone: 0, index: 0 },
    { kind: "step", x: 620, y: 382, width: 540, height: 80, heading_lines: ["2"], body_lines: ["Soldar as partes"], citations: [1], tone: 1, index: 1 },
  ],
  connectors: [{ x1: 580, y1: 422, x2: 620, y2: 422 }],
};

const artifact = (over: Partial<StudioArtifact> = {}): StudioArtifact => ({
  id: 31,
  tool: "infographic",
  format: "paisagem",
  template: null,
  title: "Infográfico — aços",
  status: "pronto",
  error: null,
  source_count: 1,
  item_count: 5,
  options: { format: "paisagem" },
  created_at: "2026-09-25T10:05:00Z",
  updated_at: "2026-09-25T10:05:00Z",
  content,
  citations: [citation],
  withheld: [],
  exports: ["svg"],
  layout: null,
  infographic: layout,
  ...over,
});

async function expectAccessible(container: Element) {
  const violations = await findA11yViolations(container);
  expect(violations, describeViolations(violations)).toHaveLength(0);
}

describe("InfographicView", () => {
  it("draws every block of the API's layout, with its lines, as a named image", () => {
    const { container } = render(<InfographicView artifact={artifact()} cites={cites} />);
    const svg = screen.getByRole("img", { name: t.infographicLabel("Infográfico — aços") });
    expect(svg.getAttribute("viewBox")).toBe("0 0 1200 600");
    expect(container.querySelectorAll("g[data-kind]")).toHaveLength(7);
    expect(container.querySelectorAll('rect[data-part="card"]')).toHaveLength(5);
    expect(container.querySelectorAll('line[data-part="connector"]')).toHaveLength(1);
    const texts = [...svg.querySelectorAll("text")].map((node) => node.textContent);
    for (const line of ["Aços estruturais", "7850 kg/m³", "densidade do aço carbono", "Soldabilidade", "1", "2"]) {
      expect(texts).toContain(line);
    }
    // The citation marks and a legend of chips below the drawing.
    expect(texts).toContain("[1]");
    expect(screen.getByText(t.sources)).toBeInTheDocument();
  });

  it("places text with the API's typesetting, not its own", () => {
    const { container } = render(<InfographicView artifact={artifact()} cites={cites} />);
    const stat = container.querySelectorAll('g[data-kind="stat"]')[0] as SVGGElement;
    const [value, label] = [...stat.querySelectorAll("text")];
    // x = block.x + pad_x; heading baseline = y + pad_y + 0.75·heading_line.
    expect(value?.getAttribute("x")).toBe("58");
    expect(value?.getAttribute("y")).toBe(String(144 + 16 + 0.75 * 36));
    expect(value?.getAttribute("font-size")).toBe("30");
    // Body after one heading line plus the gap.
    expect(label?.getAttribute("y")).toBe(String(144 + 16 + 36 + 6 + 0.75 * 18));
    expect(label?.getAttribute("font-size")).toBe("13");
  });

  it("colours cards by tone through token classes, never raw colours", () => {
    const { container } = render(<InfographicView artifact={artifact()} cites={cites} />);
    const cards = [...container.querySelectorAll('rect[data-part="card"]')];
    const [first, second] = cards;
    expect(first?.getAttribute("class")).toBe(INFOGRAPHIC_TONES[0].card);
    expect(second?.getAttribute("class")).toBe(INFOGRAPHIC_TONES[1].card);
    for (const node of container.querySelectorAll("svg *")) {
      for (const attr of ["fill", "stroke", "style"]) {
        expect(node.getAttribute(attr) ?? "").not.toMatch(/#|rgb\(\d/);
      }
    }
    for (const tone of INFOGRAPHIC_TONES) {
      expect(tone.card).toMatch(/^fill-[a-z0-9-]+ stroke-[a-z0-9-]+$/);
      expect(tone.accent).toMatch(/^fill-[a-z0-9-]+$/);
    }
    expect(toneOf(6)).toBe(INFOGRAPHIC_TONES[0]);
    expect(toneOf(-1)).toBe(INFOGRAPHIC_TONES[5]);
  });

  it("toggles to the text alternative: headed lists with chips, steps numbered", () => {
    render(<InfographicView artifact={artifact()} cites={cites} />);
    fireEvent.click(screen.getByRole("button", { name: t.viewAsText }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t.stats })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t.points })).toBeInTheDocument();
    const steps = screen.getByRole("heading", { name: t.steps }).nextElementSibling as HTMLElement;
    expect(steps.tagName).toBe("OL");
    expect(within(steps).getAllByRole("listitem")).toHaveLength(2);
    const stats = screen.getByRole("heading", { name: t.stats }).nextElementSibling as HTMLElement;
    const first = within(stats).getAllByRole("listitem")[0] as HTMLElement;
    expect(first).toHaveTextContent("7850 kg/m³ — densidade do aço carbono");
    expect(within(first).getByRole("button")).toBeInTheDocument(); // the chip
    fireEvent.click(screen.getByRole("button", { name: t.viewAsImage }));
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("says what was withheld, in the API's sentences", () => {
    render(
      <InfographicView
        artifact={artifact({ withheld: ["O dado em destaque 3 foi omitido: número fora do trecho citado."] })}
        cites={cites}
      />,
    );
    expect(screen.getByText(t.infographicWithheldTitle)).toBeInTheDocument();
    expect(screen.getByText(/dado em destaque 3 foi omitido/)).toBeInTheDocument();
  });

  it("without a layout, says so in words and still gives the content as text", () => {
    render(<InfographicView artifact={artifact({ infographic: null })} cites={cites} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/não tem desenho/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: t.stats })).toBeInTheDocument();
  });

  it("has no automatically detectable accessibility violations, in both views", async () => {
    const { container } = render(<InfographicView artifact={artifact()} cites={cites} />);
    await expectAccessible(container);
    fireEvent.click(screen.getByRole("button", { name: t.viewAsText }));
    await expectAccessible(container);
  });
});
