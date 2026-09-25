import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import {
  ChatLog,
  ChatMessage,
  CitationChip,
  FileDrop,
  PanelHeader,
  RichText,
  ToolTile,
  UploadList,
} from "@/components/ui";
import { IconReport } from "@/components/ui/icons";

async function expectAccessible(container: Element) {
  const violations = await findA11yViolations(container);
  expect(violations, describeViolations(violations)).toHaveLength(0);
}

describe("RichText (D-90)", () => {
  it("renders bold, italic, lists and paragraphs", () => {
    const { container } = render(
      <RichText text={"O **aço** é *tenaz*.\n\n- dúctil\n- barato"} />,
    );
    expect(container.querySelector("strong")?.textContent).toBe("aço");
    expect(container.querySelector("em")?.textContent).toBe("tenaz");
    expect(container.querySelectorAll("li")).toHaveLength(2);
  });

  it("never renders markup from the text", () => {
    const { container } = render(<RichText text={'<img src=x onerror="alert(1)"> <b>oi</b>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });

  it("puts the trailing content at the end of the last block", () => {
    const { container } = render(<RichText text={"Um.\n\nDois."} trailing={<sup>1</sup>} />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs[1]?.querySelector("sup")).not.toBeNull();
    expect(paragraphs[0]?.querySelector("sup")).toBeNull();
  });

  it("leaves a lone asterisk alone", () => {
    render(<RichText text="5 * 3 é produto" />);
    expect(screen.getByText("5 * 3 é produto")).toBeInTheDocument();
  });
});

describe("CitationChip (D-90)", () => {
  it("opens the passage it cites", async () => {
    const user = userEvent.setup();
    render(
      <p>
        O aço é denso.
        <CitationChip number={1} label="Trecho 1, de “Aula”" title="Aula" locator="página 3">
          Densidade 7850 kg/m³.
        </CitationChip>
      </p>,
    );
    await user.click(screen.getByRole("button", { name: "Trecho 1, de “Aula”" }));
    const panel = screen.getByRole("dialog", { name: "Trecho 1, de “Aula”" });
    expect(within(panel).getByText("Densidade 7850 kg/m³.")).toBeInTheDocument();
    expect(within(panel).getByText("página 3")).toBeInTheDocument();
  });
});

describe("ChatLog (D-90)", () => {
  it("is an announced log whose turns name their author", async () => {
    const { container } = render(
      <ChatLog label="Conversa">
        <ChatMessage from="user" author="Você">
          Qual a densidade?
        </ChatMessage>
        <ChatMessage from="assistant" author="Caderno">
          <p>7850 kg/m³.</p>
        </ChatMessage>
      </ChatLog>,
    );
    const log = screen.getByRole("log", { name: "Conversa" });
    expect(log).toHaveAttribute("aria-live", "polite");
    expect(log.textContent).toContain("Você:");
    expect(log.textContent).toContain("Caderno:");
    await expectAccessible(container);
  });
});

describe("FileDrop and UploadList (D-90)", () => {
  it("hands chosen files to onFiles and can be chosen again", async () => {
    const onFiles = vi.fn();
    const user = userEvent.setup();
    render(<FileDrop title="Arraste" buttonLabel="Escolher arquivos" onFiles={onFiles} />);
    const input = screen.getByLabelText("Escolher arquivos");
    const file = new File(["texto"], "aula.txt", { type: "text/plain" });
    await user.upload(input, file);
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("accepts dropped files", () => {
    const onFiles = vi.fn();
    const { container } = render(
      <FileDrop title="Arraste" buttonLabel="Escolher" onFiles={onFiles} />,
    );
    const file = new File(["x"], "a.pdf");
    fireEvent.drop(container.firstElementChild!, { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("shows progress while sending and the server's reason on failure", async () => {
    const { container } = render(
      <UploadList
        label="Envios"
        statusLabels={{ sending: "Enviando", reading: "Lendo", done: "Pronto", failed: "Falhou" }}
        items={[
          { key: "1", name: "a.pdf", progress: 0.4, status: "sending" },
          { key: "2", name: "b.pdf", progress: 1, status: "failed", error: "Não é um PDF." },
        ]}
      />,
    );
    expect(screen.getByRole("progressbar", { name: "a.pdf" })).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByText("Enviando 40%")).toBeInTheDocument();
    expect(screen.getByText("Não é um PDF.")).toBeInTheDocument();
    await expectAccessible(container);
  });
});

describe("ToolTile (D-90)", () => {
  it("stays focusable when unavailable, says why, and does nothing", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { container } = render(
      <ToolTile
        icon={<IconReport />}
        label="Relatórios"
        badge="Em breve"
        unavailable
        description="Chega na próxima etapa."
        onClick={onClick}
      />,
    );
    const tile = screen.getByRole("button", { name: /Relatórios/ });
    expect(tile).toHaveAttribute("aria-disabled", "true");
    await user.click(tile);
    expect(onClick).not.toHaveBeenCalled();
    expect(tile.textContent).toContain("Chega na próxima etapa.");
    await expectAccessible(container);
  });
});

describe("PanelHeader (D-90)", () => {
  it("ties the toggle to the region it folds", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(
      <section aria-labelledby="h">
        <PanelHeader
          title="Fontes"
          headingId="h"
          expanded
          onToggle={onToggle}
          toggleLabel="Recolher Fontes"
          controls="corpo"
        />
        <div id="corpo">lista</div>
      </section>,
    );
    const toggle = screen.getByRole("button", { name: "Recolher Fontes" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "corpo");
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Fontes" })).toBeInTheDocument();
  });
});
