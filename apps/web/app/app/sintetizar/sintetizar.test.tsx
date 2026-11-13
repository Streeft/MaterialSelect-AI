import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, waitFor, within } from "@testing-library/react";
// Ver a nota em components/layout/layout.test.tsx: papéis do MWC vivem dentro de
// um shadow root, invisíveis para as consultas normais.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import { suggestText } from "@/lib/i18n-suggest";
import { describeViolations, findA11yViolations } from "@/lib/testing/axe";
import { installWideViewport } from "@/lib/testing/viewport";
import type {
  SuggestionsOut,
  MaterialClass,
  MaterialListItem,
  SynthesisKindInfo,
  SynthesisPreview,
  SynthesisRequest,
  SynthesisResult,
} from "@/lib/types";

const t = ptBR.synthesis;

const previewSynthesis =
  vi.fn<(payload: SynthesisRequest) => Promise<SynthesisPreview>>();
const createSynthesis =
  vi.fn<(payload: SynthesisRequest) => Promise<SynthesisResult>>();

const materials: MaterialListItem[] = [
  {
    id: 1,
    name: "Fibra de Carbono Demo",
    class_name: "Compósitos",
    class_slug: "compositos",
    subclass: null,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 0, importado: 0, estimado: 4, missing: 0 },
    designations: [],
  },
  {
    id: 2,
    name: "Resina Epóxi Demo",
    class_name: "Polímeros",
    class_slug: "polimeros",
    subclass: null,
    is_demo: true,
    is_own_record: false,
    keywords: [],
    quality: { medido: 0, importado: 0, estimado: 4, missing: 0 },
    designations: [],
  },
];

const classes = [
  { id: 4, name: "Compósitos", slug: "compositos" },
] as unknown as MaterialClass[];

const kinds: SynthesisKindInfo[] = [
  {
    kind: "composito",
    label: "Compósito de dois constituintes",
    note: "O módulo sai como par de limites porque depende da direção.",
    rules: {
      densidade: {
        key: "volume-linear",
        label: "Regra das misturas por volume",
        formula: "x = f·xA + (1 − f)·xB",
        basis: "exato",
        basis_label: "Exata",
      },
    },
    without_rule: {
      limite_escoamento:
        "Resistência de compósito é controlada pela interface.",
    },
  },
  {
    kind: "espuma",
    label: "Espuma de um sólido",
    note: "As escalas de Gibson–Ashby são empíricas.",
    rules: {
      modulo_young: {
        key: "gibson-ashby-modulo",
        label: "Escala de Gibson–Ashby (módulo, célula aberta)",
        formula: "E* = R² · Es",
        basis: "empirico",
        basis_label: "Empírica",
      },
    },
    without_rule: {
      condutividade_termica: "Numa espuma quem conduz é o gás das células.",
    },
  },
  {
    kind: "painel",
    label: "Painel sanduíche",
    note: "Um painel não é uma mistura, é um arranjo.",
    rules: {
      modulo_young: {
        key: "flexao-sanduiche",
        label: "Módulo de flexão equivalente do painel",
        formula: "E* = 12·[…] / (c+2t)³",
        basis: "exato",
        basis_label: "Exata",
      },
    },
    without_rule: {
      limite_escoamento:
        "A resistência de um painel é uma competição entre modos de falha.",
    },
  },
];

const preview: SynthesisPreview = {
  kind: "composito",
  kind_label: "Compósito de dois constituintes",
  kind_note: "O módulo sai como par de limites porque depende da direção.",
  parents: ["Fibra de Carbono Demo", "Resina Epóxi Demo"],
  parameters: { fracao_volumetrica: 0.6 },
  values: [
    {
      slug: "densidade",
      name: "Densidade",
      canonical_unit: "kg/m**3",
      value: 1560,
      value_min: null,
      value_max: null,
      rule: {
        key: "volume-linear",
        label: "Regra das misturas por volume",
        formula: "x = f·xA + (1 − f)·xB",
        basis: "exato",
        basis_label: "Exata",
      },
      quality: "ESTIMADO",
    },
    {
      slug: "modulo_young",
      name: "Módulo de Young",
      canonical_unit: "Pa",
      value: null,
      value_min: 8.55e9,
      value_max: 139.4e9,
      rule: {
        key: "voigt-reuss",
        label: "Limites de Voigt e Reuss",
        formula: "Reuss ≤ x ≤ Voigt",
        basis: "limites",
        basis_label: "Par de limites",
      },
      quality: "ESTIMADO",
    },
  ],
  skipped: [
    {
      slug: "limite_escoamento",
      name: "Limite de escoamento",
      reason:
        "Resistência de compósito é controlada pela interface entre fibra e matriz.",
    },
  ],
};

const saved: SynthesisResult = {
  ...preview,
  material_id: 77,
  material_name: "Compósito hipotético A",
};

// `PageHeader` lê o pathname para a paleta por rota (D-49); sem isto ele recebe
// null e o cabeçalho quebra antes de qualquer coisa renderizar.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/sintetizar",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const suggest = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock("@/lib/api", () => ({
  getAIStatus: () => Promise.resolve({ enabled: true, provider: "mock", simulated: true, disclaimer: "x" }),
  suggestNextSteps: (tool: string, context: unknown) => suggest.fn(tool, context),
  listMaterials: () => Promise.resolve(materials),
  listClasses: () => Promise.resolve(classes),
  listSynthesisKinds: () => Promise.resolve(kinds),
  previewSynthesis: (payload: SynthesisRequest) => previewSynthesis(payload),
  createSynthesis: (payload: SynthesisRequest) => createSynthesis(payload),
  // A seção "Varrer" (D-144) monta junto da página; o que ela faz tem teste próprio.
  listPerformanceIndices: () => Promise.resolve([]),
  sweepSynthesis: () => Promise.reject(new Error("não usado aqui")),
  ApiError: class ApiError extends Error {},
}));

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>;
}

const { default: SintetizarPage } = await import("./page");

async function open() {
  render(wrap(<SintetizarPage />));
  await screen.findByRole("heading", { name: t.kindStep });
}

/**
 * D-220: the preview follows the recipe — nothing to press. What appears only
 * once it has arrived is the line naming the parents it was computed from.
 */
async function runPreview(_user?: ReturnType<typeof userEvent.setup>) {
  await screen.findByText(new RegExp(`^${t.parentsLabel}:`));
}

/** The latest brief the preview asked about (the recipe changes after load). */
function lastSent() {
  return previewSynthesis.mock.calls.at(-1)![0]!;
}

/** The kind is a radio card now — the rule of each kind shows before the choice. */
async function chooseKind(label: string) {
  await userEvent.click(await screen.findByRole("radio", { name: label }));
}

beforeEach(() => {
  // The recipe lives in the URL (D-212): each test starts at a clean address.
  window.history.replaceState(null, "", "/app/sintetizar");
  previewSynthesis.mockReset();
  previewSynthesis.mockResolvedValue(preview);
  createSynthesis.mockReset();
  createSynthesis.mockResolvedValue(saved);
});

describe("Sintetizar material", () => {
  it("diz que nada ali é inventado, uma vez, no rodapé (D-220)", async () => {
    // É a frase que justifica a tela existir (princípio 1); dita uma vez, numa
    // linha, e não como faixa acima de todo campo.
    await open();

    expect(screen.getByText(t.principle)).toBeInTheDocument();
  });

  it("manda só os campos do tipo escolhido", async () => {
    // A API recusa os do outro tipo em vez de ignorá-los; mandá-los calados
    // seria um número que o leitor digitou e a conta não conteve.
    const user = userEvent.setup();
    await open();

    await runPreview(user);

    const sent = previewSynthesis.mock.calls[0]![0]!;
    expect(sent.kind).toBe("composito");
    expect(sent.volume_fraction).toBe(0.6);
    expect(sent.relative_density).toBeUndefined();
  });

  it("diz o erro da prévia e oferece tentar de novo (D-219)", async () => {
    previewSynthesis.mockRejectedValueOnce(new Error("falhou"));
    await open();
    await screen.findByShadowRole("button", { name: ptBR.ui.retry });
    await userEvent.click(screen.getByShadowRole("button", { name: ptBR.ui.retry }));
    await screen.findByText(new RegExp(`^${t.parentsLabel}:`));
    expect(previewSynthesis.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("prevê sem nome, com um nome provisório que a API aceita", async () => {
    // A API valida o mesmo corpo da gravação e recusa nome vazio; o campo de
    // nome só aparece depois da prévia. Mandar "" fazia a prévia falhar sempre.
    const user = userEvent.setup();
    await open();

    await runPreview(user);

    expect(previewSynthesis.mock.calls[0]![0]!.name).toBe(t.previewName);
    expect(createSynthesis).not.toHaveBeenCalled();
  });

  it("guarda a receita na URL e o link reabre a mesma espuma (D-212)", async () => {
    const user = userEvent.setup();
    await open();
    await chooseKind(t.kindFoam);
    const density = await screen.findByShadowLabelText(/Densidade relativa/);
    await user.clear(density);
    await user.type(density, "0.2");

    const params = new URLSearchParams(window.location.search);
    expect(params.get("tipo")).toBe("espuma");
    expect(params.get("densidade")).toBe("0.2");

    cleanup();
    await open();
    expect(screen.getByRole("radio", { name: t.kindFoam })).toBeChecked();
    expect(await screen.findByShadowLabelText(/Densidade relativa/)).toHaveValue(0.2);
  });

  it("troca os campos ao escolher espuma", async () => {
    const user = userEvent.setup();
    await open();

    await chooseKind(t.kindFoam);

    expect(
      await screen.findByShadowLabelText(/Densidade relativa/),
    ).toBeInTheDocument();
    await runPreview(user);

    await waitFor(() => expect(lastSent().kind).toBe("espuma"));
    const sent = lastSent();
    expect(sent.relative_density).toBe(0.1);
    expect(sent.volume_fraction).toBeUndefined();
    expect(sent.parent_b_id).toBeUndefined();
  });

  it("mostra a lei e a base ao lado de cada valor", async () => {
    // "Conservação de massa" e "ajuste empírico" não são a mesma afirmação
    // sobre o número, e é isso que a coluna carrega.
    const user = userEvent.setup();
    await open();

    await runPreview(user);

    expect(
      screen.getByText("Regra das misturas por volume"),
    ).toBeInTheDocument();
    expect(screen.getByText("x = f·xA + (1 − f)·xB")).toBeInTheDocument();
    expect(screen.getByText("Exata")).toBeInTheDocument();
    expect(screen.getByText("Par de limites")).toBeInTheDocument();
  });

  it("mostra o módulo como par de limites e não como um número só", async () => {
    const user = userEvent.setup();
    await open();

    await runPreview(user);

    const table = screen.getByRole("table");
    const linha = within(table)
      .getAllByRole("row")
      .find((row) => row.textContent?.includes("Módulo de Young"));
    expect(linha?.textContent).toMatch(/–/);
  });

  it("nomeia o que o registro não vai ter, com o motivo", async () => {
    // D-24: ausência com rótulo escrito, e aqui ela tem duas razões possíveis.
    const user = userEvent.setup();
    await open();

    await runPreview(user);

    await screen.findByText(t.skippedTitle);
    expect(screen.getByText(/Limite de escoamento/)).toBeInTheDocument();
    expect(screen.getByText(/interface/)).toBeInTheDocument();
  });

  it("não grava nada sem a prévia ter sido lida", async () => {
    // O passo da identidade só aparece depois da prévia: gravar primeiro e
    // explicar depois encheria o catálogo de hipóteses que ninguém leu.
    let release: (value: typeof preview) => void = () => {};
    previewSynthesis.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    await open();

    expect(
      screen.queryByRole("heading", { name: t.identityStep }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(previewSynthesis).toHaveBeenCalled());
    release(preview);
    expect(await screen.findByRole("heading", { name: t.identityStep })).toBeInTheDocument();
  });

  it("exige nome para gravar, mas não para prever", async () => {
    const user = userEvent.setup();
    await open();

    await runPreview(user);

    await screen.findByRole("heading", { name: t.identityStep });
    expect(
      await screen.findByShadowRole("button", { name: t.save }),
    ).toBeDisabled();
    // D-86: the disabled button says why.
    expect(screen.getByText(t.blocked.name)).toBeInTheDocument();
  });

  it("diz por que não prevê quando a fração sai do intervalo", async () => {
    const user = userEvent.setup();
    await open();

    const fraction = await screen.findByShadowLabelText(t.fractionLabel);
    await user.clear(fraction);
    await user.type(fraction, "1");

    // D-86/D-220: no preview button; the result card says what is wrong.
    expect(await screen.findByText(t.blocked.fraction)).toBeInTheDocument();
    expect(screen.queryByShadowRole("button", { name: t.preview })).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(previewSynthesis.mock.calls.some(([req]) => req.volume_fraction === 1)).toBe(false);
  });

  it("grava e aponta para a ficha do registro criado", async () => {
    const user = userEvent.setup();
    await open();

    await runPreview(user);
    await user.type(
      await screen.findByShadowLabelText(t.nameLabel),
      "Compósito hipotético A",
    );
    await user.click(await screen.findByShadowRole("button", { name: t.save }));

    await waitFor(() => expect(createSynthesis).toHaveBeenCalledTimes(1));
    await screen.findByText(t.savedTitle);
    expect(
      screen.getByRole("link", { name: new RegExp(t.openRecord) }),
    ).toHaveAttribute("href", "/app/materiais/77");
  });

  it("mostra a nota do tipo escolhido, um clique abaixo do desenho (D-220)", async () => {
    await open();
    // Each kind is a drawing and one line; the full rule is in "Sobre este tipo".
    expect(screen.getByText(t.kindLineComposite)).toBeInTheDocument();
    expect(screen.getByText(t.kindNoteTitle)).toBeInTheDocument();

    expect(
      screen.getByText(/par de limites porque depende da direção/),
    ).toBeInTheDocument();
  });
});

describe("Painel sanduíche", () => {
  it("pede as duas espessuras e não a fração", async () => {
    const user = userEvent.setup();
    await open();

    await chooseKind(t.kindPanel);

    expect(
      await screen.findByShadowLabelText(new RegExp(t.faceThicknessLabel)),
    ).toBeInTheDocument();
    expect(
      screen.queryByShadowLabelText(/Fração volumétrica/),
    ).not.toBeInTheDocument();

    await runPreview(user);

    await waitFor(() => expect(lastSent().kind).toBe("painel"));
    const sent = lastSent();
    expect(sent.face_thickness).toBe(1);
    expect(sent.core_thickness).toBe(18);
    expect(sent.volume_fraction).toBeUndefined();
    expect(sent.relative_density).toBeUndefined();
  });

  it("manda um segundo material, porque o núcleo é um pai", async () => {
    // Um painel tem dois pais como o compósito — e a espuma, um só. Errar isto
    // mandaria uma receita que a API recusa.
    const user = userEvent.setup();
    await open();

    await chooseKind(t.kindPanel);
    await screen.findByShadowLabelText(new RegExp(t.faceThicknessLabel));
    await runPreview(user);

    await waitFor(() => expect(lastSent().kind).toBe("painel"));
    expect(lastSent().parent_b_id).toBe(2);
  });

  it("nomeia os pais por papel: face e núcleo", async () => {
    // "Primeiro constituinte" não diz qual dos dois é a casca fina e rígida, e
    // trocá-los muda o resultado inteiro.
    await open();

    await chooseKind(t.kindPanel);

    expect(
      await screen.findByShadowRole("combobox", { name: t.faceLabel }),
    ).toBeInTheDocument();
    expect(
      await screen.findByShadowRole("combobox", { name: t.coreLabel }),
    ).toBeInTheDocument();
  });

  it("diz que só a razão entre as espessuras decide", async () => {
    // É o que torna legítimo tratar o painel como material; sem essa frase o
    // leitor procura uma unidade que a tela não pede.
    await open();

    await chooseKind(t.kindPanel);

    // `findAllBy…`: o texto de apoio do campo aparece no host e dentro do
    // shadow root do MWC, como a nota do topo deste arquivo explica.
    expect(
      (await screen.findAllByShadowText(/só a razão/)).length,
    ).toBeGreaterThan(0);
  });
});

describe("Sintetizar — Sugestão da IA (D-230b)", () => {
  installWideViewport();
  const answer: SuggestionsOut = {
    tool: "sintetizar",
    summary: "Duas ideias para a receita.",
    suggestions: [
      {
        title: "Aumente a fração de fibra",
        body: "Mais fibra eleva a rigidez da mistura.",
        actions: [
          { type: "set_param", label: "fração volumétrica: 0,5", name: "volume_fraction", value: 0.5 },
          // The value the recipe already has: applying it would change nothing.
          { type: "set_param", label: "fração volumétrica: 0,6", name: "volume_fraction", value: 0.6 },
          // A field of another kind of recipe is not on this screen.
          { type: "set_param", label: "densidade relativa: 0,2", name: "relative_density", value: 0.2 },
          { type: "set_param", label: "espessura da face: 2", name: "face_thickness", value: 2 },
        ],
      },
      {
        title: "Veja no mapa",
        body: "Depois de gravar, o material aparece nos Mapas.",
        actions: [{ type: "open_route", label: "Abrir os Mapas", path: "/app/mapas" }],
      },
    ],
    rejected: [],
    degraded: false,
    cached: false,
    notice: null,
    provider: "mock",
    simulated: true,
    disclaimer: "",
  };

  beforeEach(() => {
    suggest.fn.mockReset();
    suggest.fn.mockResolvedValue(answer);
  });

  async function ask() {
    const user = userEvent.setup();
    await open();
    await runPreview(user);
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Aumente a fração de fibra");
    return user;
  }

  it("só consulta ao clicar, com o mesmo pedido que a prévia recebe", async () => {
    const user = userEvent.setup();
    await open();
    await runPreview(user);
    expect(suggest.fn).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Aumente a fração de fibra");
    expect(suggest.fn).toHaveBeenCalledTimes(1);
    expect(suggest.fn).toHaveBeenCalledWith("sintetizar", { request: previewSynthesis.mock.calls[0]![0] });
    expect(screen.getByRole("link", { name: "Abrir os Mapas" })).toHaveAttribute("href", "/app/mapas");
  });

  it("a fração sugerida muda o campo e o endereço; o que não mudaria nada, ou é de outro tipo, não é botão", async () => {
    const user = await ask();
    expect(screen.queryByRole("button", { name: "fração volumétrica: 0,6" })).toBeNull();
    expect(screen.queryByRole("button", { name: "densidade relativa: 0,2" })).toBeNull();
    expect(screen.queryByRole("button", { name: "espessura da face: 2" })).toBeNull();
    expect(new URLSearchParams(window.location.search).has("fracao")).toBe(false);
    const callsBefore = previewSynthesis.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "fração volumétrica: 0,5" }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("fracao")).toBe("0.5"));
    const fraction = screen.getByShadowLabelText(t.fractionLabel);
    expect(fraction).toHaveValue(0.5);
    await waitFor(() => expect(fraction).toHaveAttribute("data-ai-changed", "true"));
    await waitFor(() => expect(previewSynthesis.mock.calls.length).toBeGreaterThan(callsBefore));
    expect(lastSent().volume_fraction).toBe(0.5);
    // Applying a suggestion saves nothing.
    expect(createSynthesis).not.toHaveBeenCalled();
  });

  it("no painel, a espessura sugerida vale e a fração não aparece", async () => {
    const user = userEvent.setup();
    await open();
    await chooseKind(t.kindPanel);
    await screen.findByShadowLabelText(new RegExp(t.faceThicknessLabel));
    await runPreview(user);
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Aumente a fração de fibra");
    expect(screen.queryByRole("button", { name: "fração volumétrica: 0,5" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "espessura da face: 2" }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("face")).toBe("2"));
    await waitFor(() => expect(lastSent().face_thickness).toBe(2));
  });

  it("receita incompleta: o botão fica desligado e nada é perguntado", async () => {
    window.history.replaceState(null, "", "/app/sintetizar?fracao=2");
    await open();
    expect(screen.getByRole("button", { name: suggestText.button })).toBeDisabled();
    expect(screen.getByText(suggestText.needsBrief)).toBeInTheDocument();
    expect(suggest.fn).not.toHaveBeenCalled();
  });

  it("não tem violação de acessibilidade com o painel aberto", async () => {
    const user = userEvent.setup();
    const { container } = render(wrap(<SintetizarPage />));
    await screen.findByRole("heading", { name: t.kindStep });
    await runPreview(user);
    await user.click(screen.getByRole("button", { name: suggestText.button }));
    await screen.findByText("Aumente a fração de fibra");
    const violations = await findA11yViolations(container);
    expect(violations, describeViolations(violations)).toEqual([]);
  }, 30_000);
});
