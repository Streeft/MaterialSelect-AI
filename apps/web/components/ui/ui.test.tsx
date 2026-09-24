import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
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
  Combobox,
  DataQualityBadge,
  DataQualityLegend,
  Dialog,
  Disclosure,
  EmptyState,
  Field,
  GuidedBlock,
  Input,
  MissingValue,
  Popover,
  ProvenanceDetails,
  RadioGroup,
  RadioOption,
  RemovableChip,
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
  // D-76: `Button` now renders MSDS's `Button` directly — a plain `<button>`,
  // not a `@material/web` custom element with a shadow root — so these
  // assertions moved from `findByShadowRole`/the shadow host to a plain
  // `getByRole` query against the real DOM button, and from
  // `data-aria-busy` (the shadow aria-delegation mixin's rewrite of
  // `aria-busy`) back to the real `aria-busy` attribute MSDS's `Button`
  // writes directly on the element.
  it("blocks the click while loading and says so", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Executar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Executar" });
    expect(button).toHaveAttribute("disabled");
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("defaults to type=button so it cannot submit a form by accident", async () => {
    render(<Button>Adicionar</Button>);
    const button = screen.getByRole("button", { name: "Adicionar" });
    expect(button).toHaveAttribute("type", "button");
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
    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Abrir" });
    await userEvent.click(opener);

    // D-77: MSDS's Dialog is plain light-DOM, no shadow root — its own
    // useFocusTrap (lib/msds/msds.tsx) focuses the first focusable
    // descendant on open, in DOM order. Its own "Fechar" IconButton is
    // first in that order (rendered in the header, ahead of this
    // component's children), so that's what receives focus here — not the
    // content, unlike the old md-dialog version this replaces.
    const dialog = await screen.findByRole("dialog", { name: "Confirmar" });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(screen.getByRole("button", { name: "Fechar" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("keeps Tab inside the dialog", async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
    await screen.findByRole("dialog");
    const fechar = screen.getByRole("button", { name: "Fechar" });
    const primeiro = screen.getByRole("button", { name: "Primeiro" });
    const ultimo = screen.getByRole("button", { name: "Último" });

    await waitFor(() => expect(fechar).toHaveFocus());
    await userEvent.tab(); // Fechar -> Primeiro
    expect(primeiro).toHaveFocus();
    await userEvent.tab(); // Primeiro -> Último
    expect(ultimo).toHaveFocus();
    await userEvent.tab(); // Último wraps back to Fechar — useFocusTrap's own trap
    expect(fechar).toHaveFocus();
    await userEvent.tab({ shift: true }); // Shift+Tab wraps the other way
    expect(ultimo).toHaveFocus();
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

describe("Stepper — resumo das escolhas (D-85)", () => {
  it("shows what was chosen under a step that is not blocked", () => {
    render(
      <Stepper
        label="Etapas"
        steps={[
          { id: "a", label: "Função", summary: "Viga leve" },
          { id: "b", label: "Resultados", summary: "ignorado", blockedReason: "Execute primeiro." },
        ]}
        current="a"
        onSelect={() => {}}
        statusOf={(step) => (step.id === "a" ? "current" : "blocked")}
      />,
    );
    expect(screen.getByShadowRole("button", { name: /função/i })).toHaveTextContent("Viga leve");
    // A blocked step says why it is blocked, not a summary of nothing.
    expect(screen.getByShadowRole("button", { name: /resultados/i })).not.toHaveTextContent(
      "ignorado",
    );
  });
});

describe("Disclosure controlada (D-85)", () => {
  it("opens when the screen says so and reports the reader's toggle", async () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <Disclosure summary="Opções avançadas" open={false} onOpenChange={onOpenChange}>
        <p>Método</p>
      </Disclosure>,
    );
    const details = screen.getByText("Opções avançadas").closest("details")!;
    expect(details.open).toBe(false);

    rerender(
      <Disclosure summary="Opções avançadas" open onOpenChange={onOpenChange}>
        <p>Método</p>
      </Disclosure>,
    );
    expect(details.open).toBe(true);
  });
});

describe("GuidedBlock (D-85)", () => {
  it("keeps what was typed while collapsed, and offers Alterar when done", async () => {
    function Harness() {
      const [done, setDone] = useState(false);
      const [text, setText] = useState("");
      return (
        <GuidedBlock
          title="Índice"
          state={done ? "done" : "active"}
          summary={`Escolhido: ${text}`}
          onEdit={() => setDone(false)}
        >
          <Input label="Expressão" value={text} onChange={(e) => setText(e.target.value)} />
          <Button onClick={() => setDone(true)}>Continuar</Button>
        </GuidedBlock>
      );
    }
    render(<Harness />);
    await userEvent.type(screen.getByShadowRole("textbox", { name: "Expressão" }), "E/rho");
    await userEvent.click(screen.getByShadowRole("button", { name: "Continuar" }));

    expect(screen.getByText("Escolhido: E/rho")).toBeInTheDocument();
    await userEvent.click(screen.getByShadowRole("button", { name: ptBR.ui.change }));
    expect(screen.getByShadowRole("textbox", { name: "Expressão" })).toHaveValue("E/rho");
  });

  it("says why a locked block is waiting, instead of drawing a dead control", () => {
    render(
      <GuidedBlock title="Critérios" state="locked" lockedReason="Escolha o índice primeiro.">
        <Button>Adicionar</Button>
      </GuidedBlock>,
    );
    expect(screen.getByText("Escolha o índice primeiro.")).toBeInTheDocument();
    expect(screen.queryByShadowRole("button", { name: "Adicionar" })).not.toBeInTheDocument();
  });
});

describe("Combobox (D-85)", () => {
  const options = [
    { value: "modulo_young", label: "Módulo de Young" },
    { value: "densidade", label: "Densidade", keywords: ["rho"] },
    { value: "limite_escoamento", label: "Limite de escoamento" },
  ];

  function Harness({ clearOnSelect = false }: { clearOnSelect?: boolean }) {
    const [value, setValue] = useState("");
    return (
      <>
        <Combobox
          label="Propriedade"
          options={options}
          value={value}
          onChange={setValue}
          clearOnSelect={clearOnSelect}
        />
        <output>{value}</output>
      </>
    );
  }

  it("finds an option without the accent and chooses it with the keyboard", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Propriedade" });
    await userEvent.type(input, "modulo");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    expect(document.querySelector("output")).toHaveTextContent("modulo_young");
    expect(input).toHaveValue("Módulo de Young");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("matches on keywords and says so when nothing matches", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Propriedade" });
    await userEvent.type(input, "rho");
    expect(screen.getByRole("option", { name: "Densidade" })).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "xyz");
    expect(screen.getByText(ptBR.ui.comboboxNoMatch("xyz"))).toBeInTheDocument();
  });

  it("restores the chosen label on Escape", async () => {
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Propriedade" });
    await userEvent.click(input);
    await userEvent.click(screen.getByRole("option", { name: "Densidade" }));
    await userEvent.type(input, "lim");
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("Densidade");
    expect(document.querySelector("output")).toHaveTextContent("densidade");
  });

  it("empties itself after a choice in 'add' mode", async () => {
    render(<Harness clearOnSelect />);
    const input = screen.getByRole("combobox", { name: "Propriedade" });
    await userEvent.type(input, "dens");
    await userEvent.keyboard("{Enter}");
    expect(document.querySelector("output")).toHaveTextContent("densidade");
    expect(input).toHaveValue("");
  });

  it("passes axe with the list open", async () => {
    const { container } = render(<Harness />);
    await userEvent.click(screen.getByRole("combobox", { name: "Propriedade" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await expectAccessible(container);
    await expectAccessible(document.body);
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

describe("RemovableChip", () => {
  it("names its remove button after the item and reports the removal", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ul aria-label="Escolhidos">
        <li>
          <RemovableChip onRemove={onRemove}>Aço 1020</RemovableChip>
        </li>
      </ul>,
    );
    await user.click(screen.getByRole("button", { name: `${ptBR.actions.remove}: Aço 1020` }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    await expectAccessible(container);
  });
});
