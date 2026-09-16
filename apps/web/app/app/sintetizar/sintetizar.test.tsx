import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor, within } from "@testing-library/react";
// Ver a nota em components/layout/layout.test.tsx: papéis do MWC vivem dentro de
// um shadow root, invisíveis para as consultas normais.
import { screen } from "shadow-dom-testing-library";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ptBR } from "@/lib/i18n";
import type {
  MaterialClass,
  MaterialListItem,
  SynthesisKindInfo,
  SynthesisPreview,
  SynthesisRequest,
  SynthesisResult,
} from "@/lib/types";
import { selectMwcOption } from "@/lib/testing/mwc";

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
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/lib/api", () => ({
  listMaterials: () => Promise.resolve(materials),
  listClasses: () => Promise.resolve(classes),
  listSynthesisKinds: () => Promise.resolve(kinds),
  previewSynthesis: (payload: SynthesisRequest) => previewSynthesis(payload),
  createSynthesis: (payload: SynthesisRequest) => createSynthesis(payload),
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

async function runPreview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByShadowRole("button", { name: t.preview }),
  );
  await screen.findByRole("heading", { name: t.previewStep });
}

beforeEach(() => {
  previewSynthesis.mockReset();
  previewSynthesis.mockResolvedValue(preview);
  createSynthesis.mockReset();
  createSynthesis.mockResolvedValue(saved);
});

describe("Sintetizar material", () => {
  it("diz de saída que nada ali é inventado", async () => {
    // É a frase que justifica a tela existir (princípio 1), e ela vem antes de
    // qualquer campo.
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

  it("troca os campos ao escolher espuma", async () => {
    const user = userEvent.setup();
    await open();

    selectMwcOption(
      await screen.findByShadowRole("combobox", { name: t.kindLabel }),
      "espuma",
    );

    expect(
      await screen.findByShadowLabelText(/Densidade relativa/),
    ).toBeInTheDocument();
    await runPreview(user);

    const sent = previewSynthesis.mock.calls[0]![0]!;
    expect(sent.kind).toBe("espuma");
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
    await open();

    expect(
      screen.queryByRole("heading", { name: t.identityStep }),
    ).not.toBeInTheDocument();
  });

  it("exige nome para gravar, mas não para prever", async () => {
    const user = userEvent.setup();
    await open();

    await runPreview(user);

    await screen.findByRole("heading", { name: t.identityStep });
    expect(
      await screen.findByShadowRole("button", { name: t.save }),
    ).toBeDisabled();
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

  it("mostra a nota do tipo escolhido", async () => {
    await open();

    expect(
      screen.getByText(/par de limites porque depende da direção/),
    ).toBeInTheDocument();
  });
});

describe("Painel sanduíche", () => {
  it("pede as duas espessuras e não a fração", async () => {
    const user = userEvent.setup();
    await open();

    selectMwcOption(
      await screen.findByShadowRole("combobox", { name: t.kindLabel }),
      "painel",
    );

    expect(
      await screen.findByShadowLabelText(new RegExp(t.faceThicknessLabel)),
    ).toBeInTheDocument();
    expect(
      screen.queryByShadowLabelText(/Fração volumétrica/),
    ).not.toBeInTheDocument();

    await runPreview(user);

    const sent = previewSynthesis.mock.calls[0]![0]!;
    expect(sent.kind).toBe("painel");
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

    selectMwcOption(
      await screen.findByShadowRole("combobox", { name: t.kindLabel }),
      "painel",
    );
    await screen.findByShadowLabelText(new RegExp(t.faceThicknessLabel));
    await runPreview(user);

    expect(previewSynthesis.mock.calls[0]![0]!.parent_b_id).toBe(2);
  });

  it("nomeia os pais por papel: face e núcleo", async () => {
    // "Primeiro constituinte" não diz qual dos dois é a casca fina e rígida, e
    // trocá-los muda o resultado inteiro.
    await open();

    selectMwcOption(
      await screen.findByShadowRole("combobox", { name: t.kindLabel }),
      "painel",
    );

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

    selectMwcOption(
      await screen.findByShadowRole("combobox", { name: t.kindLabel }),
      "painel",
    );

    // `findAllBy…`: o texto de apoio do campo aparece no host e dentro do
    // shadow root do MWC, como a nota do topo deste arquivo explica.
    expect(
      (await screen.findAllByShadowText(/só a razão/)).length,
    ).toBeGreaterThan(0);
  });
});
