import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioAudioContent } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { installFakeSpeech, type FakeSpeechController } from "@/lib/testing/fakeSpeech";
import { VOICE_SETTLE_MS } from "@/lib/speech/useSpeech";
import { studioCitation } from "./__fixtures__/studio";
import { AudioView } from "./AudioView";
import type { Cites } from "./views";

const t = ptBR.notebooks.studio;

// Line 0 has two sentences, so it is two segments; lines 1 and 2 are one each.
const CONTENT: StudioAudioContent = {
  title: "Aços em conversa",
  lines: [
    { speaker: 1, text: "Hoje falamos de aços. Eles são ligas de ferro.", citations: [1] },
    { speaker: 2, text: "E a densidade do aço carbono?", citations: [] },
    { speaker: 1, text: "Fica em 7850 kg/m³.", citations: [1] },
  ],
};

const CITES: Cites = {
  byNumber: new Map([[1, studioCitation]]),
  liveSourceIds: new Set([studioCitation.source_id]),
};

const PT_VOICES = [
  { name: "Ana", lang: "pt-BR" },
  { name: "Bruno", lang: "pt-BR" },
];

let fake: FakeSpeechController | null = null;

function install(voices: Array<{ name: string; lang: string }> = PT_VOICES) {
  fake = installFakeSpeech({ voices });
  return fake;
}

afterEach(() => {
  fake?.uninstall();
  fake = null;
  vi.useRealTimers();
});

function renderView(withheld: string[] = []) {
  return render(<AudioView content={CONTENT} cites={CITES} withheld={withheld} />);
}

const rows = () => within(screen.getByRole("region", { name: t.transcript })).getAllByRole("listitem");
const currentRow = () => rows().findIndex((row) => row.getAttribute("aria-current") === "true");
const lastSpoken = (f: FakeSpeechController) => f.spoken[f.spoken.length - 1]?.text;

describe("AudioView (D-98)", () => {
  it("draws the transcript with speaker labels and citation chips", () => {
    install();
    renderView();
    const list = rows();
    expect(list).toHaveLength(3);
    expect(within(list[0] as HTMLElement).getByText(t.speaker(1))).toBeInTheDocument();
    expect(within(list[1] as HTMLElement).getByText(t.speaker(2))).toBeInTheDocument();
    expect(
      within(list[2] as HTMLElement).getByRole("button", {
        name: ptBR.notebooks.citation(1, studioCitation.source_title),
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Reproduzir$/ })).toHaveLength(1);
  });

  it("play speaks the first segment, and onend advances the line and the highlight", () => {
    const f = install();
    renderView();
    expect(currentRow()).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: t.play }));
    expect(lastSpoken(f)).toBe("Hoje falamos de aços.");
    expect(screen.getByRole("button", { name: t.pause })).toBeInTheDocument();

    act(() => f.end());
    expect(lastSpoken(f)).toBe("Eles são ligas de ferro.");
    expect(currentRow()).toBe(0);

    act(() => f.end());
    expect(lastSpoken(f)).toBe("E a densidade do aço carbono?");
    expect(currentRow()).toBe(1);
    expect(screen.getByText(t.linePosition(2, 3))).toHaveAttribute("aria-live", "polite");
  });

  it("the live region says the position, never the text", () => {
    install();
    renderView();
    const live = screen.getByText(t.linePosition(1, 3));
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live.textContent).not.toContain("aços");
  });

  it("pauses and resumes from the current segment", () => {
    const f = install();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: t.play }));
    act(() => f.end());
    fireEvent.click(screen.getByRole("button", { name: t.pause }));
    expect(f.current()).toBeNull();
    const spokenBefore = f.spoken.length;

    fireEvent.click(screen.getByRole("button", { name: t.resume }));
    expect(f.spoken.length).toBe(spokenBefore + 1);
    expect(lastSpoken(f)).toBe("Eles são ligas de ferro.");
  });

  it("next and previous move by line", () => {
    const f = install();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: t.play }));
    fireEvent.click(screen.getByRole("button", { name: t.nextLine }));
    expect(lastSpoken(f)).toBe("E a densidade do aço carbono?");
    expect(currentRow()).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: t.nextLine }));
    expect(currentRow()).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: t.previousLine }));
    expect(lastSpoken(f)).toBe("E a densidade do aço carbono?");
    expect(currentRow()).toBe(1);
  });

  it("changing the speed marks the seat and re-speaks at the new rate", () => {
    const f = install();
    renderView();
    const speed = screen.getByRole("group", { name: t.speed });
    const normal = within(speed).getByRole("button", { name: t.speedValue("1") });
    expect(normal).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: t.play }));
    const fast = within(speed).getByRole("button", { name: t.speedValue("1,25") });
    fireEvent.click(fast);
    expect(fast).toHaveAttribute("aria-pressed", "true");
    expect(normal).toHaveAttribute("aria-pressed", "false");
    expect(lastSpoken(f)).toBe("Hoje falamos de aços.");
    expect(f.spoken[f.spoken.length - 1]?.rate).toBeCloseTo(1.25);
  });

  it("a click on a line plays from that line, whether stopped or playing", () => {
    const f = install();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: t.playFromLineLabel(3) }));
    // Spoken once, by the click itself — never the old line first.
    expect(f.spoken.map((u) => u.text)).toEqual(["Fica em 7850 kg/m³."]);
    expect(currentRow()).toBe(2);
    expect(screen.getByRole("button", { name: t.pause })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: t.playFromLineLabel(2) }));
    expect(lastSpoken(f)).toBe("E a densidade do aço carbono?");
    expect(currentRow()).toBe(1);
  });

  it("the line buttons carry the visible hint as their title", () => {
    install();
    renderView();
    expect(screen.getByRole("button", { name: t.playFromLineLabel(1) })).toHaveAttribute(
      "title",
      t.playFromLine,
    );
  });

  it("says in words that the browser cannot speak, and keeps the transcript", () => {
    renderView();
    expect(screen.getByText(t.speechUnsupported)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.play })).not.toBeInTheDocument();
    expect(rows()).toHaveLength(3);
    expect(currentRow()).toBe(-1);
  });

  it("says in words that there is no Portuguese voice, and keeps the transcript", () => {
    install([{ name: "Emma", lang: "en-US" }]);
    renderView();
    expect(screen.getByText(t.speechNoVoice)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.play })).not.toBeInTheDocument();
    expect(rows()).toHaveLength(3);
  });

  it("an empty voice list becomes 'no voice' only after the grace period", () => {
    vi.useFakeTimers();
    install([]);
    renderView();
    expect(screen.queryByText(t.speechNoVoice)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.play })).toBeDisabled();
    act(() => vi.advanceTimersByTime(VOICE_SETTLE_MS));
    expect(screen.getByText(t.speechNoVoice)).toBeInTheDocument();
  });

  it("notes an approximate (non pt-BR) voice", () => {
    install([{ name: "Joana", lang: "pt-PT" }]);
    renderView();
    expect(screen.getByText(t.speechApproximate)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.play })).toBeEnabled();
  });

  it("pauses when the tab is hidden", () => {
    const f = install();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: t.play }));
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } finally {
      visibility.mockRestore();
    }
    expect(f.current()).toBeNull();
    expect(screen.getByRole("button", { name: t.resume })).toBeInTheDocument();
  });

  it("says an engine error in words", () => {
    const f = install();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: t.play }));
    act(() => f.error("synthesis-failed"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.resume })).toBeInTheDocument();
  });

  it("shows the backend's withheld sentences", () => {
    install();
    renderView(["Uma fala foi omitida porque o número 12 não está no trecho citado."]);
    expect(screen.getByText(t.withheldTitle)).toBeInTheDocument();
    expect(
      screen.getByText("Uma fala foi omitida porque o número 12 não está no trecho citado."),
    ).toBeInTheDocument();
  });

  it("has no automatically detectable accessibility violations", async () => {
    const f = install();
    const { container } = renderView(["Uma fala foi omitida."]);
    fireEvent.click(screen.getByRole("button", { name: t.play }));
    act(() => f.end());
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it("has no violations without a voice either", async () => {
    const { container } = renderView();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
