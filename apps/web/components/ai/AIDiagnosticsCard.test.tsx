import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { ptBR } from "@/lib/i18n";
import type { AIDiagnostico, AIStatus } from "@/lib/types";
import { AIDiagnosticsCard } from "./AIDiagnosticsCard";

const getAIStatus = vi.fn<() => Promise<AIStatus>>();
const runAIDiagnostico = vi.fn<() => Promise<AIDiagnostico>>();
vi.mock("@/lib/api", () => ({
  getAIStatus: () => getAIStatus(),
  runAIDiagnostico: () => runAIDiagnostico(),
}));

const t = ptBR.aiDiagnostics;

const GEMINI: AIStatus = {
  enabled: true,
  provider: "openai-compat",
  simulated: false,
  disclaimer: "x",
  model: "gemini-flash-lite-latest",
  host: "generativelanguage.googleapis.com",
  json_mode: "schema",
  embedding_model: "gemini-embedding-001",
  capabilities: [
    { key: "texto", label: "Texto", configured: true, detail: "openai-compat com o modelo gemini-flash-lite-latest." },
    { key: "json_estrito", label: "JSON estrito", configured: true, detail: "Schema estrito." },
    { key: "embeddings", label: "Embeddings", configured: true, detail: "gemini-embedding-001." },
    { key: "busca_web", label: "Busca na web", configured: false, detail: "Desligada: defina WEB_SEARCH_PROVIDER=gemini." },
  ],
};

afterEach(() => {
  getAIStatus.mockReset();
  runAIDiagnostico.mockReset();
});

describe("Diagnóstico da IA (D-228)", () => {
  it("shows the model, the host and each capability — never a key", async () => {
    getAIStatus.mockResolvedValue(GEMINI);
    render(<AIDiagnosticsCard />);
    expect(await screen.findByText(/gemini-flash-lite-latest · generativelanguage\.googleapis\.com/)).toBeTruthy();
    expect(screen.getByText("Busca na web")).toBeTruthy();
    expect(screen.getAllByText(t.notConfigured)).toHaveLength(1);
  });

  it("runs the test and reports each capability with its latency", async () => {
    getAIStatus.mockResolvedValue(GEMINI);
    runAIDiagnostico.mockResolvedValue({
      ok: false,
      provider: "openai-compat",
      simulated: false,
      model: "gemini-flash-lite-latest",
      host: "generativelanguage.googleapis.com",
      checked_at: "2026-11-12T22:00:00Z",
      remaining: 4,
      checks: [
        { key: "json", label: "Texto e JSON", status: "ok", latency_ms: 1840, message: "Respondeu." },
        {
          key: "embeddings",
          label: "Embeddings",
          status: "erro",
          latency_ms: 210,
          message: "A cota gratuita do Google acabou por agora; tente em 37 s.",
        },
        { key: "busca_web", label: "Busca na web", status: "nao_configurado", latency_ms: null, message: "Desligada." },
      ],
    });
    const user = userEvent.setup();
    render(<AIDiagnosticsCard />);
    await user.click(await screen.findByRole("button", { name: t.run }));
    expect(await screen.findByText(t.someFailed)).toBeTruthy();
    expect(screen.getByText("1.840 ms")).toBeTruthy();
    expect(screen.getByText(/cota gratuita do Google acabou por agora/)).toBeTruthy();
    expect(screen.getByText(t.statusLabel.erro)).toBeTruthy();
    expect(screen.getByText(t.remaining(4))).toBeTruthy();
  });

  it("says why when the test itself is refused", async () => {
    getAIStatus.mockResolvedValue(GEMINI);
    const refused = Object.assign(new Error("Você já rodou 6 diagnósticos da IA nesta hora."), { status: 429 });
    runAIDiagnostico.mockRejectedValue(refused);
    const user = userEvent.setup();
    render(<AIDiagnosticsCard />);
    await user.click(await screen.findByRole("button", { name: t.run }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("states a disabled layer instead of failing", async () => {
    getAIStatus.mockResolvedValue({ enabled: false, provider: "", simulated: true, disclaimer: "" });
    render(<AIDiagnosticsCard />);
    expect(await screen.findByText(t.off)).toBeTruthy();
  });
});
