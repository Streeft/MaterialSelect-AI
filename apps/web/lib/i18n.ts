// Minimal pt-BR dictionary. Structured as a flat map so an English locale can be
// added later without touching call sites (swap the active dictionary).

export const ptBR = {
  appName: "MaterialSelect AI",
  tagline: "Apoio à seleção de materiais pela metodologia de Ashby",
  demoWarning: "Dados exclusivamente demonstrativos. Não utilizar em projetos reais.",
  demoBadge: "Demonstrativo",
  nav: {
    home: "Início",
    catalog: "Catálogo",
  },
  catalog: {
    title: "Catálogo de materiais",
    searchPlaceholder: "Buscar por nome, classe ou palavra-chave…",
    columnName: "Material",
    columnClass: "Classe",
    columnKeywords: "Palavras-chave",
    empty: "Nenhum material encontrado.",
    loading: "Carregando materiais…",
    error: "Não foi possível carregar os materiais.",
    count: (n: number) => `${n} ${n === 1 ? "material" : "materiais"}`,
  },
  detail: {
    back: "← Voltar ao catálogo",
    loading: "Carregando material…",
    error: "Não foi possível carregar o material.",
    properties: "Propriedades",
    source: "Fonte",
    quality: "Qualidade do dado",
    condition: "Condição de medição",
    original: "Valor original",
    normalized: "Valor normalizado",
    interval: "Faixa",
    typical: "Típico",
    missing: "ausente",
    uncertainty: "incerteza",
    noProperties: "Este material ainda não possui propriedades cadastradas.",
  },
  chart: {
    title: "Mapa de propriedades",
    scale: "Escala",
    linear: "Linear",
    log: "Logarítmica",
    excludedNote: (n: number) =>
      `${n} ${n === 1 ? "material foi omitido" : "materiais foram omitidos"} por não ter valor em ambos os eixos.`,
    logNote: "Escala logarítmica exige valores positivos; pontos ≤ 0 são omitidos.",
    empty: "Sem pontos suficientes para o gráfico.",
  },
  categories: {
    FISICA: "Física",
    MECANICA: "Mecânica",
    TERMICA: "Térmica",
    ELETRICA: "Elétrica",
    AMBIENTAL: "Ambiental",
    ECONOMICA: "Econômica",
  },
  quality: {
    MEDIDO: "Medido",
    IMPORTADO: "Importado",
    ESTIMADO: "Estimado",
  },
} as const;

export type Dictionary = typeof ptBR;
