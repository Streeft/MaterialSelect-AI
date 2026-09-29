import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { NotebookCitation, StudioDeckContent } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { PRINTING_CLASS, SlideFrame, SlidesView } from "./DeckView";
import type { Cites } from "./views";

const t = ptBR.notebooks.studio;

const citation = (number: number, source_id: number): NotebookCitation => ({
  number,
  chunk_id: number * 10,
  source_id,
  source_title: `Fonte ${number}`,
  heading: null,
  page_start: null,
  page_end: null,
  excerpt: `Trecho ${number}.`,
});

const cites: Cites = {
  byNumber: new Map([
    [1, citation(1, 7)],
    [2, citation(2, 8)],
  ]),
  liveSourceIds: new Set([7, 8]),
};

const deck: StudioDeckContent = {
  title: "Corrosão",
  slides: [
    {
      title: "O que é corrosão",
      bullets: ["Oxidação do metal", "Perda de massa"],
      notes: "Abrir com um exemplo.",
      citations: [1],
    },
    {
      title: "Proteção catódica",
      bullets: ["Ânodo de sacrifício"],
      notes: "",
      citations: [2],
    },
    {
      title: "Resumo",
      bullets: ["Escolha o revestimento"],
      notes: "Fechar.",
      citations: [],
    },
  ],
};

function renderDeck(props: Partial<Parameters<typeof SlidesView>[0]> = {}) {
  return render(
    <SlidesView
      content={deck}
      title="Aula de corrosão"
      cites={cites}
      {...props}
    />,
  );
}

const currentTitle = () =>
  screen.getByRole("heading", { level: 4 }).textContent;
const liveRegion = () => screen.getByText(/^Slide \d+ de \d+$/);

describe("SlideFrame", () => {
  it("draws the title, the bullets, the chips and the optional caption and overlay", () => {
    render(
      <SlideFrame
        slide={deck.slides[0]!}
        index={0}
        cites={cites}
        caption={<p>Legenda da cena</p>}
      >
        <span>sobreposto</span>
      </SlideFrame>,
    );
    expect(
      screen.getByRole("heading", { name: "O que é corrosão" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Oxidação do metal")).toBeInTheDocument();
    expect(screen.getByText("Perda de massa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fonte 1/ })).toBeInTheDocument();
    expect(screen.getByText("Legenda da cena")).toBeInTheDocument();
    expect(screen.getByText("sobreposto")).toBeInTheDocument();
  });
});

describe("SlidesView (D-98)", () => {
  const originalPrint = window.print;
  beforeEach(() => {
    window.print = vi.fn();
  });
  afterEach(() => {
    window.print = originalPrint;
    document.body.classList.remove(PRINTING_CLASS);
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      value: null,
    });
  });

  it("moves with the buttons and says where it is in a polite live region", () => {
    renderDeck();
    expect(currentTitle()).toBe("O que é corrosão");
    expect(liveRegion()).toHaveTextContent(t.slidePosition(1, 3));
    expect(liveRegion()).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByRole("button", { name: t.previousSlide }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: t.nextSlide }));
    expect(currentTitle()).toBe("Proteção catódica");
    expect(liveRegion()).toHaveTextContent("Slide 2 de 3");

    fireEvent.click(screen.getByRole("button", { name: t.nextSlide }));
    expect(currentTitle()).toBe("Resumo");
    expect(screen.getByRole("button", { name: t.nextSlide })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: t.previousSlide }));
    expect(currentTitle()).toBe("Proteção catódica");
  });

  it("answers ← and → on the focused deck only, and stops at the ends", () => {
    renderDeck();
    const frame = screen.getByRole("region", {
      name: t.deckLabel("Aula de corrosão"),
    });
    expect(frame).toHaveAttribute("tabindex", "0");

    // A key pressed elsewhere on the page is not the deck's.
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(currentTitle()).toBe("O que é corrosão");
    // Nor is one pressed on a chip inside it.
    fireEvent.keyDown(screen.getByRole("button", { name: /Fonte 1/ }), {
      key: "ArrowRight",
    });
    expect(currentTitle()).toBe("O que é corrosão");

    fireEvent.keyDown(frame, { key: "ArrowLeft" });
    expect(currentTitle()).toBe("O que é corrosão");
    fireEvent.keyDown(frame, { key: "ArrowRight" });
    fireEvent.keyDown(frame, { key: "ArrowRight" });
    fireEvent.keyDown(frame, { key: "ArrowRight" });
    expect(currentTitle()).toBe("Resumo");
    expect(liveRegion()).toHaveTextContent("Slide 3 de 3");
    fireEvent.keyDown(frame, { key: "ArrowLeft" });
    expect(currentTitle()).toBe("Proteção catódica");
  });

  it("opens and closes the speaker notes, and offers none on a slide without them", () => {
    renderDeck();
    const toggle = screen.getByRole("button", { name: t.showNotes });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Abrir com um exemplo.")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const hide = screen.getByRole("button", { name: t.hideNotes });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    const notes = screen.getByRole("region", { name: t.speakerNotes });
    expect(hide).toHaveAttribute("aria-controls", notes.id);
    expect(
      within(notes).getByText("Abrir com um exemplo."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t.nextSlide }));
    expect(
      screen.queryByRole("button", { name: t.hideNotes }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: t.speakerNotes }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t.nextSlide }));
    expect(screen.getByText("Fechar.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.hideNotes }));
    expect(screen.queryByText("Fechar.")).not.toBeInTheDocument();
  });

  it("hides the full-screen button where the browser has no full screen", () => {
    renderDeck();
    expect(
      screen.queryByRole("button", { name: t.fullscreen }),
    ).not.toBeInTheDocument();
  });

  it("asks the deck's container for full screen and relabels the button inside it", () => {
    Object.defineProperty(document, "fullscreenEnabled", {
      configurable: true,
      value: true,
    });
    const request = vi.fn(() => Promise.resolve());
    const exit = vi.fn(() => Promise.resolve());
    const originalRequest = HTMLElement.prototype.requestFullscreen;
    const originalExit = document.exitFullscreen;
    HTMLElement.prototype.requestFullscreen = request;
    document.exitFullscreen = exit;
    try {
      renderDeck();
      fireEvent.click(screen.getByRole("button", { name: t.fullscreen }));
      expect(request).toHaveBeenCalledTimes(1);
      const stage = request.mock.instances[0] as unknown as HTMLElement;
      expect(stage).toContainElement(
        screen.getByRole("region", { name: t.deckLabel("Aula de corrosão") }),
      );
      expect(stage).toContainElement(
        screen.getByRole("button", { name: t.nextSlide }),
      );

      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: stage,
      });
      act(() => {
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      fireEvent.click(screen.getByRole("button", { name: t.exitFullscreen }));
      expect(exit).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, "fullscreenElement", {
        configurable: true,
        value: null,
      });
      act(() => {
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      expect(
        screen.getByRole("button", { name: t.fullscreen }),
      ).toBeInTheDocument();
    } finally {
      HTMLElement.prototype.requestFullscreen = originalRequest;
      document.exitFullscreen = originalExit;
    }
  });

  it("prints every slide and the notices from a portal, with the body class only while printing", () => {
    let atPrint: { printing: boolean; slides: number; text: string } | null =
      null;
    window.print = vi.fn(() => {
      const portal = document.body.querySelector(".deck-print");
      atPrint = {
        printing: document.body.classList.contains(PRINTING_CLASS),
        slides: portal?.querySelectorAll(".deck-print-slide").length ?? 0,
        text: portal?.textContent ?? "",
      };
    });
    renderDeck({
      withheld: ["Um slide foi omitido: número fora do trecho citado."],
    });
    expect(document.body.querySelector(".deck-print")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.printDeck }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(atPrint).not.toBeNull();
    const seen = atPrint!;
    expect(seen.printing).toBe(true);
    expect(seen.slides).toBe(3);
    for (const slide of deck.slides) expect(seen.text).toContain(slide.title);
    expect(seen.text).toContain("Ânodo de sacrifício");
    expect(seen.text).toContain(ptBR.limitation.full);
    expect(seen.text).toContain(ptBR.notebooks.accuracy);
    expect(seen.text).toContain(
      "Um slide foi omitido: número fora do trecho citado.",
    );
    expect(seen.text).toContain("[1] Fonte 1");
    expect(seen.text).toContain("[2] Fonte 2");
    expect(seen.text).not.toContain(t.noCitations);
    // The portal hangs from <body>, outside the view, where the print CSS can find it.
    expect(document.body.querySelector(":scope > .deck-print")).not.toBeNull();
    expect(document.body.querySelector(":scope > .deck-print")).toHaveAttribute(
      "data-theme",
      "light",
    );

    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(document.body.classList.contains(PRINTING_CLASS)).toBe(false);
    expect(document.body.querySelector(".deck-print")).toBeNull();
  });

  it("says in words that nothing was cited when the printed deck has no sources (D-24)", () => {
    let text = "";
    window.print = vi.fn(() => {
      text = document.body.querySelector(".deck-print")?.textContent ?? "";
    });
    renderDeck({ cites: { byNumber: new Map(), liveSourceIds: new Set() } });
    fireEvent.click(screen.getByRole("button", { name: t.printDeck }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(text).toContain(t.sources);
    expect(text).toContain(t.noCitations);
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
  });

  it("prints when the export menu asks, once per request", () => {
    const { rerender } = renderDeck({ printRequest: 0 });
    expect(window.print).not.toHaveBeenCalled();
    rerender(
      <SlidesView
        content={deck}
        title="Aula de corrosão"
        cites={cites}
        printRequest={1}
      />,
    );
    expect(window.print).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    rerender(
      <SlidesView
        content={deck}
        title="Aula de corrosão"
        cites={cites}
        printRequest={1}
      />,
    );
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("says what the check left out", () => {
    renderDeck({ withheld: ["Um slide foi omitido."] });
    expect(screen.getByText(t.withheldTitle)).toBeInTheDocument();
    expect(screen.getByText("Um slide foi omitido.")).toBeInTheDocument();
  });

  it("marks the slide content for the fade, keyed by position", () => {
    const { container } = renderDeck();
    expect(container.querySelector(".deck-slide-enter")).toHaveAttribute(
      "data-slide-index",
      "0",
    );
    fireEvent.click(screen.getByRole("button", { name: t.nextSlide }));
    expect(container.querySelector(".deck-slide-enter")).toHaveAttribute(
      "data-slide-index",
      "1",
    );
  });

  it("has no automatically detectable accessibility violations, notes open", async () => {
    const { container } = renderDeck({ withheld: ["Um slide foi omitido."] });
    fireEvent.click(screen.getByRole("button", { name: t.showNotes }));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
