import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataQualityBadge,
  DataQualityLegend,
  Dialog,
  EmptyState,
  Field,
  Input,
  MissingValue,
  Popover,
  ProvenanceDetails,
  RadioGroup,
  RadioOption,
  Section,
  Select,
  Stepper,
  TBody,
  THead,
  Table,
  TableScroll,
  Tabs,
  Td,
  Th,
  ThRow,
  Tr,
  type Provenance,
} from ".";

async function expectAccessible(container: Element) {
  const violations = await findA11yViolations(container);
  expect(violations, describeViolations(violations)).toEqual([]);
}

describe("cn", () => {
  it("lets a caller's utility win over the component's default", () => {
    // Without conflict resolution the loser depends on CSS source order, which
    // makes `className` overrides work on some utilities and not others.
    expect(cn("rounded-control px-4", "rounded-full")).toBe("px-4 rounded-full");
    expect(cn("bg-brand", "bg-danger")).toBe("bg-danger");
  });

  it("resolves the project's own scales, not just Tailwind's", () => {
    expect(cn("rounded-card", "rounded-control")).toBe("rounded-control");
    expect(cn("shadow-card", "shadow-overlay")).toBe("shadow-overlay");
    expect(cn("text-2xs", "text-sm")).toBe("text-sm");
  });
});

describe("Button", () => {
  it("blocks the click while loading and says so", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Executar
      </Button>,
    );
    const button = screen.getByRole("button", { name: /executar/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it cannot submit a form by accident", () => {
    render(<Button>Adicionar</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });
});

describe("Field", () => {
  it("wires label, hint and error to the control without the call site doing it", () => {
    render(
      <Field label="Densidade" hint="Em g/cm³" error="Campo obrigatório.">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText(/densidade/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const described = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(described).toContain("Em g/cm³");
    expect(described).toContain("Campo obrigatório.");
  });

  it("does not claim invalid when there is no error", () => {
    render(
      <Field label="Nome">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Nome")).not.toHaveAttribute("aria-invalid");
  });
});

describe("qualidade do dado", () => {
  it("keeps the written label even when it is visually hidden", () => {
    // Colour and glyph are the second and third cues. The label is the one that
    // survives colour blindness, greyscale printing and a screen reader.
    render(<DataQualityBadge state="ESTIMADO" showLabel={false} />);
    expect(screen.getByText(ptBR.quality.ESTIMADO)).toBeInTheDocument();
  });

  it("renders absence as the word 'Ausente', never as a dash or a zero", () => {
    const { container } = render(<MissingValue />);
    expect(screen.getByText(ptBR.quality.AUSENTE)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/^[\s0—–-]*$/);
    expect(container.textContent).not.toContain("0");
  });

  it("names all four states in the legend", async () => {
    const { container } = render(<DataQualityLegend />);
    for (const state of ["MEDIDO", "IMPORTADO", "ESTIMADO", "AUSENTE"] as const) {
      expect(screen.getByText(ptBR.quality[state])).toBeInTheDocument();
    }
    await expectAccessible(container);
  });
});

describe("ProvenanceDetails", () => {
  const base: Provenance = {
    quality: "IMPORTADO",
    isMissing: false,
    originalValue: 3.9,
    originalUnit: "g/cm**3",
    normalizedValue: 3900,
    canonicalUnit: "kg/m**3",
    conversionMethod: "pint:g/cm**3->kg/m**3",
    uncertainty: null,
    valueMin: null,
    valueMax: null,
    valueTypical: null,
    measurementCondition: "23 °C",
    sourceLabel: "Ashby, Material Selection in Mechanical Design",
    notes: null,
  };

  it("shows the whole chain: original, canonical and the conversion between them", () => {
    render(<ProvenanceDetails p={base} />);
    expect(screen.getByText(ptBR.provenance.original)).toBeInTheDocument();
    expect(screen.getByText(ptBR.provenance.normalized)).toBeInTheDocument();
    expect(screen.getByText("pint:g/cm**3->kg/m**3")).toBeInTheDocument();
    expect(screen.getByText(base.sourceLabel as string)).toBeInTheDocument();
  });

  it("names an unrecorded source instead of leaving the row blank", () => {
    // A blank line here reads as "no source was needed", which is the opposite
    // of what an unrecorded source means.
    render(<ProvenanceDetails p={{ ...base, sourceLabel: null }} />);
    expect(screen.getByText(ptBR.provenance.unknown)).toBeInTheDocument();
  });

  it("explains absence rather than showing an empty panel", () => {
    render(<ProvenanceDetails p={{ ...base, isMissing: true, originalValue: null }} />);
    expect(screen.getByText(ptBR.provenance.missingTitle)).toBeInTheDocument();
    expect(screen.queryByText(ptBR.provenance.normalized)).not.toBeInTheDocument();
  });
});

describe("Popover", () => {
  function Harness() {
    return (
      // Inside a <p> on purpose: this is where the provenance trigger actually
      // lives, and a panel rendered in place would be invalid markup there.
      <p>
        Densidade{" "}
        <Popover label="Ver a proveniência deste valor" trigger={<span>3,9 g/cm³</span>}>
          <p>Convertido por pint</p>
        </Popover>
      </p>
    );
  }

  it("renders the panel outside the trigger's parent, so no container clips it", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: /proveni/i }));
    const panel = screen.getByRole("dialog", { name: /proveni/i });
    expect(container).not.toContainElement(panel);
    expect(document.body).toContainElement(panel);
    expect(container.querySelector("p div")).toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /proveni/i });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("Dialog", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Confirmar">
          <button type="button">Primeiro</button>
          <button type="button">Último</button>
        </Dialog>
      </>
    );
  }

  it("moves focus in, closes on Escape and gives focus back", async () => {
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await userEvent.click(opener);

    // Focus lands on the panel, so the dialog's name is announced on entry and
    // the reader does not start out sitting on "Fechar".
    const dialog = screen.getByRole("dialog", { name: "Confirmar" });
    expect(dialog).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside the dialog", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: ptBR.ui.close });

    await userEvent.tab(); // panel -> Fechar
    expect(close).toHaveFocus();
    await userEvent.tab(); // Fechar -> Primeiro
    await userEvent.tab(); // Primeiro -> Último
    await userEvent.tab(); // wraps back into the dialog, never out of it
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(close).toHaveFocus();
  });
});

describe("Tabs", () => {
  function Harness() {
    const [value, setValue] = useState("tabela");
    return (
      <Tabs
        label="Visualização"
        value={value}
        onChange={setValue}
        items={[
          { id: "tabela", label: "Tabela" },
          { id: "barras", label: "Barras" },
          { id: "radar", label: "Radar" },
        ]}
      />
    );
  }

  it("moves between tabs with the arrow keys and keeps one stop in the tab order", async () => {
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "Tabela" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    const second = screen.getByRole("tab", { name: "Barras" });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("tabindex", "-1");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Radar" })).toHaveFocus();
  });
});

describe("Stepper", () => {
  const steps = [
    { id: "funcao", label: "Função" },
    { id: "restricoes", label: "Restrições" },
    { id: "resultados", label: "Resultados", blockedReason: "Execute a seleção primeiro." },
  ] as const;

  it("marks the current step and refuses a blocked one, with the reason in words", async () => {
    const onSelect = vi.fn();
    render(
      <Stepper
        label="Etapas"
        steps={steps}
        current="restricoes"
        onSelect={onSelect}
        statusOf={(step) =>
          step.id === "funcao" ? "done" : step.id === "restricoes" ? "current" : "blocked"
        }
      />,
    );
    expect(screen.getByRole("button", { name: /restrições/i })).toHaveAttribute(
      "aria-current",
      "step",
    );
    const blocked = screen.getByRole("button", { name: /resultados/i });
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveTextContent("Execute a seleção primeiro.");
    await userEvent.click(blocked);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("acessibilidade das primitivas", () => {
  it("passes axe on a screen assembled from the system", async () => {
    const { container } = render(
      <main>
        <h1>Seleção</h1>
        <Alert tone="warning" title={ptBR.limitation.title}>
          {ptBR.limitation.full}
        </Alert>
        <Section title="Objetivo" description="Índice de mérito e critérios">
          <Card>
            <CardHeader title="Candidatos" description="Após as restrições" />
            <CardBody>
              <Field label="Nome do estudo" hint="Usado ao salvar">
                <Input />
              </Field>
              <Field label="Normalização">
                <Select>
                  <option value="minmax">Min-máx</option>
                  <option value="vector">Vetorial</option>
                </Select>
              </Field>
              <RadioGroup legend="Objetivo">
                <RadioOption name="goal" label="Maximizar" defaultChecked />
                <RadioOption name="goal" label="Minimizar" />
              </RadioGroup>
              <Button variant="primary">Executar seleção</Button>
            </CardBody>
          </Card>
        </Section>
        <TableScroll label="Ranking">
          <Table>
            <THead>
              <Tr>
                <Th>Material</Th>
                <Th numeric>Pontuação</Th>
                <Th>Qualidade</Th>
              </Tr>
            </THead>
            <TBody>
              <Tr>
                <ThRow>Liga Alumínio Demo A</ThRow>
                <Td numeric>0,84</Td>
                <Td>
                  <DataQualityBadge state="MEDIDO" />
                </Td>
              </Tr>
              <Tr>
                <ThRow>Cerâmica Demo D</ThRow>
                <Td numeric>
                  <MissingValue />
                </Td>
                <Td>
                  <DataQualityBadge state="AUSENTE" />
                </Td>
              </Tr>
            </TBody>
          </Table>
        </TableScroll>
        <EmptyState title="Nenhum candidato após as restrições." />
      </main>,
    );
    await expectAccessible(container);
  });

  it("passes axe with the dialog open", async () => {
    const { container } = render(
      <Dialog open onClose={() => {}} title="Excluir estudo" description="Não pode ser desfeito.">
        <p>Confirma?</p>
      </Dialog>,
    );
    await expectAccessible(container);
  });
});
