import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioDeckContent } from "@/lib/types";
import { ptBR } from "@/lib/i18n";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { installFakeSpeech, type FakeSpeechController } from "@/lib/testing/fakeSpeech";
import { studioCitation } from "./__fixtures__/studio";
import { VideoView } from "./VideoView";
import type { Cites } from "./views";

const t = ptBR.notebooks.studio;

// Scene 0 narrates two sentences, scene 1 one, scene 2 has blank notes (read by its title).
const CONTENT: StudioDeckContent = {
  title: "Aços em vídeo",
  slides: [
    {
      title: "O que é aço",
      bullets: ["Liga de ferro e carbono"],
      notes: "O aço é uma liga de ferro. Tem pouco carbono.",
      citations: [1],
    },
    {
      title: "Densidade",
      bullets: ["7850 kg/m³"],
      notes: "A densidade do aço carbono fica em 7850 kg/m³.",
      citations: [1],
    },
    { title: "Resumo final", bullets: [], notes: "  ", citations: [] },
  ],
};

const CITES: Cites = {
  byNumber: new Map([[1, studioCitation]]),
  liveSourceIds: new Set([studioCitation.source_id]),
};

const PT_VOICES = [{ name: "Ana", lang: "pt-BR" }];

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

function renderView() {
  return render(<VideoView content={CONTENT} cites={CITES} />);
}

const slideTitle = () => screen.getByRole("heading", { level: 4 }).textContent;
const caption = () => screen.getByText(`${t.caption}:`).parentElement?.textContent;
const lastSpoken = (f: FakeSpeechController) => f.spoken[f.spoken.length - 1]?.text;
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("VideoView (D-98)", () => {
  it("opens on the first scene with its first sentence as the caption", () => {
    install();
    renderView();
    expect(slideTitle()).toBe("O que é aço");
    expect(caption()).toBe(`${t.caption}: O aço é uma liga de ferro.`);
    expect(screen.getByText(t.scenePosition(1, 3))).toHaveAttribute("aria-live", "polite");
    expect(screen.getAllByRole("button", { name: t.playVideo })).toHaveLength(1);
    expect(screen.getByRole("button", { name: t.previousSlide })).toBeDisabled();
  });

  it("play reads the first scene, and the caption follows each sentence", () => {
    const f = install();
    renderView();
    click(t.playVideo);
    expect(lastSpoken(f)).toBe("O aço é uma liga de ferro.");
    expect(screen.getByRole("button", { name: t.pause })).toBeInTheDocument();

    act(() => f.end());
    expect(lastSpoken(f)).toBe("Tem pouco carbono.");
    expect(slideTitle()).toBe("O que é aço");
    expect(caption()).toBe(`${t.caption}: Tem pouco carbono.`);
  });

  it("moves to the next slide when the scene's last sentence ends", () => {
    const f = install();
    renderView();
    click(t.playVideo);
    act(() => f.end());
    act(() => f.end());
    expect(slideTitle()).toBe("Densidade");
    expect(screen.getByText(t.scenePosition(2, 3))).toBeInTheDocument();
    expect(lastSpoken(f)).toBe("A densidade do aço carbono fica em 7850 kg/m³.");

    // A scene with blank notes is read by its title, so it is still a stop.
    act(() => f.end());
    expect(slideTitle()).toBe("Resumo final");
    expect(lastSpoken(f)).toBe("Resumo final");

    act(() => f.end());
    expect(slideTitle()).toBe("Resumo final");
    expect(screen.getByRole("button", { name: t.playVideo })).toBeInTheDocument();
  });

  it("next and previous go by scene, and speak at once while playing", () => {
    const f = install();
    renderView();
    click(t.nextSlide);
    expect(slideTitle()).toBe("Densidade");
    expect(f.spoken).toHaveLength(0);

    click(t.playVideo);
    expect(lastSpoken(f)).toBe("A densidade do aço carbono fica em 7850 kg/m³.");
    click(t.nextSlide);
    expect(slideTitle()).toBe("Resumo final");
    expect(lastSpoken(f)).toBe("Resumo final");
    expect(screen.getByRole("button", { name: t.nextSlide })).toBeDisabled();

    click(t.previousSlide);
    click(t.previousSlide);
    expect(slideTitle()).toBe("O que é aço");
    expect(lastSpoken(f)).toBe("O aço é uma liga de ferro.");
    expect(f.queue).toHaveLength(1);
  });

  it("pauses and resumes the current sentence", () => {
    const f = install();
    renderView();
    click(t.playVideo);
    click(t.pause);
    expect(f.current()).toBeNull();
    click(t.resume);
    expect(f.spoken.map((u) => u.text)).toEqual([
      "O aço é uma liga de ferro.",
      "O aço é uma liga de ferro.",
    ]);
  });

  it("offers the audio's speeds, and a new speed restarts the sentence at that rate", () => {
    const f = install();
    const { container } = renderView();
    const speed = screen.getByRole("group", { name: t.speed });
    expect(within(speed).getAllByRole("button").map((b) => b.textContent)).toEqual(
      ["0,75", "1", "1,25", "1,5"].map((value) => t.speedValue(value)),
    );
    const normal = within(speed).getByRole("button", { name: t.speedValue("1") });
    expect(normal).toHaveAttribute("aria-pressed", "true");

    // Stopped: the speed is kept for later, nothing is spoken.
    const slow = within(speed).getByRole("button", { name: t.speedValue("0,75") });
    fireEvent.click(slow);
    expect(slow).toHaveAttribute("aria-pressed", "true");
    expect(f.spoken).toHaveLength(0);

    click(t.playVideo);
    act(() => f.end());
    expect(lastSpoken(f)).toBe("Tem pouco carbono.");
    expect(f.spoken[f.spoken.length - 1]?.rate).toBeCloseTo(0.75);

    // Playing: the sentence being read starts over at the new rate, same scene.
    const fast = within(speed).getByRole("button", { name: t.speedValue("1,5") });
    fireEvent.click(fast);
    expect(fast).toHaveAttribute("aria-pressed", "true");
    expect(normal).toHaveAttribute("aria-pressed", "false");
    expect(lastSpoken(f)).toBe("Tem pouco carbono.");
    expect(f.spoken[f.spoken.length - 1]?.rate).toBeCloseTo(1.5);
    expect(f.queue).toHaveLength(1);
    expect(slideTitle()).toBe("O que é aço");

    // The speed control adds no second primary button (D-91).
    expect(container.querySelectorAll(".msds-btn-primary")).toHaveLength(1);
  });

  it("toggles the transcript with every scene's narration and its chips", () => {
    install();
    renderView();
    const toggle = screen.getByRole("button", { name: t.showTranscript });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("region", { name: t.transcript })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const hide = screen.getByRole("button", { name: t.hideTranscript });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    const region = screen.getByRole("region", { name: t.transcript });
    expect(hide.getAttribute("aria-controls")).toBe(region.id);
    const items = within(region).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveAttribute("aria-current", "true");
    expect(within(items[1] as HTMLElement).getByText(/7850 kg\/m³\./)).toBeInTheDocument();
    expect(
      within(items[1] as HTMLElement).getByRole("button", {
        name: ptBR.notebooks.citation(1, studioCitation.source_title),
      }),
    ).toBeInTheDocument();

    fireEvent.click(hide);
    expect(screen.queryByRole("region", { name: t.transcript })).not.toBeInTheDocument();
  });

  it("without a voice, says so and becomes a deck navigated by hand, captions kept", () => {
    vi.useFakeTimers();
    install([{ name: "Emma", lang: "en-US" }]);
    renderView();
    expect(screen.getByText(t.videoManual)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.playVideo })).not.toBeInTheDocument();
    // The whole narration of the scene, not one sentence.
    expect(caption()).toBe(`${t.caption}: O aço é uma liga de ferro. Tem pouco carbono.`);

    // Nothing to speed up without a voice.
    expect(screen.queryByRole("group", { name: t.speed })).not.toBeInTheDocument();

    // No timer advances it.
    act(() => vi.advanceTimersByTime(60_000));
    expect(slideTitle()).toBe("O que é aço");

    click(t.nextSlide);
    expect(slideTitle()).toBe("Densidade");
    expect(caption()).toBe(`${t.caption}: A densidade do aço carbono fica em 7850 kg/m³.`);
    expect(screen.getByText(t.scenePosition(2, 3))).toBeInTheDocument();
    click(t.previousSlide);
    expect(slideTitle()).toBe("O que é aço");
  });

  it("without speech synthesis at all, still navigates by hand", () => {
    renderView();
    expect(screen.getByText(t.videoManual)).toBeInTheDocument();
    click(t.nextSlide);
    expect(slideTitle()).toBe("Densidade");
  });

  it("pauses when the tab is hidden", () => {
    const f = install();
    renderView();
    click(t.playVideo);
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
    click(t.playVideo);
    act(() => f.error("not-allowed"));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.resume })).toBeInTheDocument();
  });

  it("has no automatically detectable accessibility violations", async () => {
    const f = install();
    const { container } = renderView();
    click(t.playVideo);
    act(() => f.end());
    fireEvent.click(screen.getByRole("button", { name: t.showTranscript }));
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });

  it("has no violations without a voice either", async () => {
    const { container } = renderView();
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toHaveLength(0);
  });
});
