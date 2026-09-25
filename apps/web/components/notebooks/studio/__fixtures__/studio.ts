/**
 * Studio data for tests (D-94): a catalogue shaped like the API's and one
 * artifact of each tool, plus one running and one failed. Shared by the
 * notebook tests and the accessibility audit, so both look at the same states.
 */
import type {
  NotebookCitation,
  StudioArtifact,
  StudioArtifactSummary,
  StudioCatalog,
  StudioList,
} from "@/lib/types";

const choice = (slug: string, label: string, description: string, extra = {}) => ({
  slug,
  label,
  description,
  instructions: "",
  columns: [],
  amount: null,
  ...extra,
});

const difficulties = [
  choice("facil", "Fácil", "Definições e fatos diretos das fontes."),
  choice("medio", "Médio", "Relacionar ideias e aplicar conceitos."),
  choice("dificil", "Difícil", "Comparar, justificar e raciocinar sobre casos."),
];

export const studioCatalog: StudioCatalog = {
  max_columns: 8,
  tools: [
    {
      slug: "report",
      label: "Relatório",
      description: "Um documento em seções, cada parágrafo com as fontes citadas.",
      formats: [
        choice("corrido", "Texto corrido", "Parágrafos, como um texto de apostila."),
        choice("topicos", "Tópicos", "Itens curtos, para revisar rápido."),
      ],
      templates: [
        choice("visao_geral", "Visão geral", "Do que as fontes tratam.", {
          instructions: "Escreva uma visão geral das fontes.",
        }),
        choice("guia_estudo", "Guia de estudo", "Conceitos-chave explicados.", {
          instructions: "Escreva um guia de estudo para um aluno de graduação.",
        }),
        choice("personalizado", "Crie o seu", "Descreva a estrutura, o estilo e o público."),
      ],
      counts: [],
      difficulties: [],
      columns: false,
      exports: ["docx"],
    },
    {
      slug: "flashcards",
      label: "Cartões didáticos",
      description: "Frente e verso para memorizar, cada cartão com a fonte.",
      formats: [
        choice("pergunta", "Pergunta e resposta", "A frente pergunta; o verso responde."),
        choice("termo", "Termo e definição", "A frente é um termo; o verso, a definição."),
      ],
      templates: [],
      counts: [
        choice("menos", "Menos", "10 cartões", { amount: 10 }),
        choice("padrao", "Padrão", "15 cartões", { amount: 15 }),
        choice("mais", "Mais", "25 cartões", { amount: 25 }),
      ],
      difficulties,
      columns: false,
      exports: ["csv", "docx"],
    },
    {
      slug: "quiz",
      label: "Teste",
      description: "Questões com gabarito, dica e explicação citada.",
      formats: [
        choice("multipla", "Múltipla escolha", "Quatro alternativas, uma correta."),
        choice("vf", "Verdadeiro ou falso", "Uma afirmação para julgar."),
      ],
      templates: [],
      counts: [
        choice("menos", "Menos", "5 questões", { amount: 5 }),
        choice("padrao", "Padrão", "10 questões", { amount: 10 }),
        choice("mais", "Mais", "15 questões", { amount: 15 }),
      ],
      difficulties,
      columns: false,
      exports: ["docx", "csv"],
    },
    {
      slug: "table",
      label: "Tabela de dados",
      description: "Dados copiados das fontes para colunas que você escolhe.",
      formats: [],
      templates: [
        choice("propriedades", "Propriedades de materiais", "Um material por linha.", {
          columns: ["Material", "Propriedade", "Valor"],
        }),
        choice("personalizado", "Crie a sua", "Você escolhe as colunas."),
      ],
      counts: [],
      difficulties: [],
      columns: true,
      exports: ["xlsx", "csv"],
    },
    {
      slug: "mindmap",
      label: "Mapa mental",
      description: "As ideias das fontes em árvore, cada ramo com a fonte.",
      formats: [
        choice("visao_geral", "Visão geral", "Dois níveis abaixo do tema.", { amount: 2 }),
        choice("detalhado", "Detalhado", "Três níveis abaixo do tema.", { amount: 3 }),
      ],
      templates: [],
      counts: [],
      difficulties: [],
      columns: false,
      exports: ["svg"],
    },
  ],
};

export const studioCitation: NotebookCitation = {
  number: 1,
  chunk_id: 90,
  source_id: 11,
  source_title: "Aula de aços",
  heading: "Aços",
  page_start: null,
  page_end: null,
  excerpt: "O aço carbono tem densidade de 7850 kg/m³.",
};

const base = {
  source_count: 1,
  error: null,
  created_at: "2026-09-25T10:05:00Z",
  updated_at: "2026-09-25T10:05:00Z",
  citations: [studioCitation],
  withheld: [],
  layout: null,
};

export const reportArtifact: StudioArtifact = {
  ...base,
  id: 21,
  tool: "report",
  format: "corrido",
  template: "guia_estudo",
  title: "Guia de estudo — aços",
  status: "pronto",
  item_count: 1,
  options: { format: "corrido", template: "guia_estudo" },
  exports: ["docx"],
  content: {
    sections: [
      { heading: "Aços carbono", paragraphs: [{ text: "O aço carbono tem 7850 kg/m³.", citations: [1] }] },
    ],
  },
};

export const flashcardsArtifact: StudioArtifact = {
  ...base,
  id: 22,
  tool: "flashcards",
  format: "pergunta",
  template: null,
  title: "Cartões — aços",
  status: "pronto",
  item_count: 2,
  options: { format: "pergunta", count: "menos", difficulty: "medio" },
  exports: ["csv", "docx"],
  content: {
    cards: [
      { front: "Qual a densidade do aço carbono?", back: "7850 kg/m³.", citations: [1] },
      { front: "O que é o aço carbono?", back: "Uma liga de ferro e carbono.", citations: [1] },
    ],
  },
};

export const quizArtifact: StudioArtifact = {
  ...base,
  id: 23,
  tool: "quiz",
  format: "multipla",
  template: null,
  title: "Teste — aços",
  status: "pronto",
  item_count: 1,
  options: { format: "multipla", count: "menos", difficulty: "medio" },
  exports: ["docx", "csv"],
  withheld: [
    "Uma questão foi omitida porque citava números que não aparecem nos trechos citados: 999.",
  ],
  content: {
    questions: [
      {
        prompt: "Qual a densidade do aço carbono?",
        options: ["7850 kg/m³", "2700 kg/m³"],
        answer_index: 0,
        hint: "Veja a aula de aços.",
        explanation: "A fonte diz 7850 kg/m³.",
        citations: [1],
      },
    ],
  },
};

export const tableArtifact: StudioArtifact = {
  ...base,
  id: 24,
  tool: "table",
  format: null,
  template: "propriedades",
  title: "Densidades",
  status: "pronto",
  item_count: 1,
  options: { template: "propriedades", columns: ["Material", "Propriedade", "Valor"] },
  exports: ["xlsx", "csv"],
  content: {
    columns: ["Material", "Propriedade", "Valor"],
    rows: [
      {
        cells: [
          { text: "Aço carbono", citations: [1], status: "ok" },
          { text: null, citations: [], status: "ausente" },
          { text: null, citations: [], status: "omitida" },
        ],
      },
    ],
  },
};

export const mindmapArtifact: StudioArtifact = {
  ...base,
  id: 25,
  tool: "mindmap",
  format: "visao_geral",
  template: null,
  title: "Mapa — aços",
  status: "pronto",
  item_count: 2,
  options: { format: "visao_geral" },
  exports: ["svg"],
  content: {
    root: {
      label: "Materiais estruturais",
      citations: [],
      children: [
        {
          label: "Aços carbono",
          citations: [1],
          children: [{ label: "Densidade", citations: [1], children: [] }],
        },
      ],
    },
  },
  layout: {
    width: 520,
    height: 120,
    nodes: [
      { id: 1, parent: null, label: "Materiais estruturais", lines: ["Materiais estruturais"], depth: 0, x: 16, y: 40, width: 180, height: 35, citations: [] },
      { id: 2, parent: 1, label: "Aços carbono", lines: ["Aços carbono"], depth: 1, x: 244, y: 40, width: 120, height: 35, citations: [1] },
      { id: 3, parent: 2, label: "Densidade", lines: ["Densidade"], depth: 2, x: 412, y: 40, width: 90, height: 35, citations: [1] },
    ],
    edges: [
      { source: 1, target: 2, x1: 196, y1: 57.5, x2: 244, y2: 57.5 },
      { source: 2, target: 3, x1: 364, y1: 57.5, x2: 412, y2: 57.5 },
    ],
  },
};

const summaryOf = ({ content: _c, citations: _ci, withheld: _w, exports: _e, layout: _l, ...summary }: StudioArtifact): StudioArtifactSummary =>
  summary;

export const runningArtifact: StudioArtifactSummary = {
  ...summaryOf(reportArtifact),
  id: 26,
  title: "Relatório",
  status: "gerando",
  item_count: null,
};

export const failedArtifact: StudioArtifactSummary = {
  ...summaryOf(flashcardsArtifact),
  id: 27,
  title: "Cartões didáticos",
  status: "falhou",
  item_count: null,
  error: "Limite do plano gratuito atingido (429).",
};

export const readyArtifacts = [
  reportArtifact,
  flashcardsArtifact,
  quizArtifact,
  tableArtifact,
  mindmapArtifact,
];

export const studioList: StudioList = {
  artifacts: [runningArtifact, failedArtifact, ...readyArtifacts.map(summaryOf)],
  usage: { used: 5, limit: 10, remaining: 4 },
};

export function artifactById(id: number): StudioArtifact | undefined {
  return readyArtifacts.find((a) => a.id === id);
}
