import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
// MWC's button/dialog-close roles live inside a shadow root, invisible to
// plain @testing-library/react queries (see the note in layout.test.tsx).
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { InputHTMLAttributes } from "react";
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
  SelectOption,
  Stepper,
  useWiring,
  TBody,
  THead,
  Table,
  TableScroll,
  Tabs,
  Td,
  Th,
  RowHeader,
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
    const button = await screen.findByShadowRole("button", { name: "Executar" });
    // getByShadowRole resolves to the shadow-internal <button>; the host
    // custom element is where @material/web's aria-delegation mixin and our
    // own `disabled`/`type` props actually land — see the Dialog test's note.
    const host = (button.getRootNode() as ShadowRoot).host as HTMLElement;
    expect(host).toHaveAttribute("disabled");
    // @material/web's aria-delegation mixin moves aria-* off the host onto
    // data-aria-* (then re-applies it inside the shadow root) to avoid
    // duplicate announcements — see vitest.config.ts's resolve.conditions note.
    expect(host).toHaveAttribute("data-aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it cannot submit a form by accident", async () => {
    render(<Button>Adicionar</Button>);
    const button = await screen.findByShadowRole("button", { name: "Adicionar" });
    const host = (button.getRootNode() as ShadowRoot).host as HTMLElement;
    expect(host).toHaveProperty("type", "button");
  });
});

// `Field` now only wraps the two native-control call sites MWC has no
// equivalent for (a multi-`<select>` and a file `<input>`) — every other
// control carries its own `label`/`hint`/`error` directly, and Field itself
// went from cloning props onto its child to a context (`useWiring`) the
// child opts into, same as `ConstraintEditor.tsx`'s `ClassMultiSelect`.
function WiredInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const w = useWiring();
  return (
    <input
      id={w.id}
      aria-describedby={w.describedBy}
      aria-invalid={w.invalid || undefined}
      {...props}
    />
  );
}

describe("Field", () => {
  it("wires label, hint and error to the control without the call site doing it", () => {
    render(
      <Field label="Densidade" hint="Em g/cm³" error="Campo obrigatório.">
        <WiredInput />
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
        <WiredInput />
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
    await userEvent.click(screen.getByShadowRole("button", { name: /proveni/i }));
    const panel = screen.getByShadowRole("dialog", { name: /proveni/i });
    expect(container).not.toContainElement(panel);
    expect(document.body).toContainElement(panel);
    expect(container.querySelector("p div")).toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<Harness />);
    const trigger = screen.getByShadowRole("button", { name: /proveni/i });
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByShadowRole("dialog")).not.toBeInTheDocument();
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
    const { container } = render(<Harness />);
    const opener = screen.getByShadowRole("button", { name: "Abrir" });
    await userEvent.click(opener);

    // md-dialog has no dialog-role container we can put tabIndex/focus on
    // ourselves; the light-DOM content wrapper (marked `autofocus`, see
    // Dialog.tsx) is what actually receives focus on open, so the assertion
    // is containment within the host rather than focus on the role itself.
    await screen.findByShadowRole("dialog", { name: "Confirmar" });
    const host = container.querySelector("md-dialog") as HTMLElement;
    expect(host.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByShadowRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside the dialog", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByShadowRole("button", { name: "Abrir" }));
    await screen.findByShadowRole("dialog");
    // md-dialog has no built-in "Fechar" — closing an M3 dialog is via
    // Escape, the scrim, or an explicit action; this harness's own content
    // is what Tab should cycle across.
    const primeiro = screen.getByShadowRole("button", { name: "Primeiro" });
    const ultimo = screen.getByShadowRole("button", { name: "Último" });

    await userEvent.tab(); // content wrapper (autofocus, tabIndex -1) -> Primeiro
    expect(primeiro).toHaveFocus();
    await userEvent.tab(); // Primeiro -> Último
    expect(ultimo).toHaveFocus();
    // md-dialog's own wrap-around (Último -> a sentinel div -> back to
    // Primeiro) lives inside its shadow root. @testing-library/user-event
    // computes the next Tab stop via document.querySelectorAll (see
    // getTabDestination.js), which never crosses a shadow boundary, so it
    // cannot see those sentinels — this step is not exercisable here.
    // Verified live in a real browser instead; see the M3 migration plan's
    // Etapa 6 note.
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
      >
        Painel de {value}
      </Tabs>
    );
  }

  it("moves between tabs with the arrow keys and keeps one stop in the tab order", async () => {
    render(<Harness />);
    // md-primary-tab's role is set via ElementInternals in its constructor,
    // and the jsdom polyfill that reflects it as a real `role` attribute
    // (vitest.setup.ts) only runs on a queued microtask after the element
    // connects — the very first query after render() has to wait for it.
    const first = await screen.findByShadowRole("tab", { name: "Tabela" });
    first.focus();
    await userEvent.keyboard("{ArrowRight}");
    const second = screen.getByShadowRole("tab", { name: "Barras" });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveAttribute("tabindex", "-1");
    await userEvent.keyboard("{End}");
    expect(screen.getByShadowRole("tab", { name: "Radar" })).toHaveFocus();
  });

  it("links the selected tab to a panel that exists", async () => {
    render(<Harness />);

    // The bug this pins: the panel used to be a sibling component with its own
    // id, so `aria-controls` referred to nothing at all.
    const panel = screen.getByShadowRole("tabpanel", { name: "Tabela" });
    // Same microtask wait as the previous test — this is the first query in
    // this test that depends on md-primary-tab's ElementInternals role.
    const selected = await screen.findByShadowRole("tab", { name: "Tabela" });
    expect(selected).toHaveAttribute("aria-controls", panel.id);

    selected.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByShadowRole("tabpanel", { name: "Barras" })).toHaveTextContent("Painel de barras");
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
    expect(screen.getByShadowRole("button", { name: /restrições/i })).toHaveAttribute(
      "aria-current",
      "step",
    );
    const blocked = screen.getByShadowRole("button", { name: /resultados/i });
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
              <Input label="Nome do estudo" hint="Usado ao salvar" />
              <Select label="Normalização">
                <SelectOption value="minmax">Min-máx</SelectOption>
                <SelectOption value="vector">Vetorial</SelectOption>
              </Select>
              <RadioGroup legend="Objetivo">
                <RadioOption name="goal" label="Maximizar" checked />
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
                <RowHeader>Liga Alumínio Demo A</RowHeader>
                <Td numeric>0,84</Td>
                <Td>
                  <DataQualityBadge state="MEDIDO" />
                </Td>
              </Tr>
              <Tr>
                <RowHeader>Cerâmica Demo D</RowHeader>
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
