/**
 * Texts of the project assistant (D-224, D-225): the proposal card on the home
 * and in the selection wizard. Kept apart from `i18n.ts`, like
 * `i18n-compare-link.ts`, so the lanes that edit that file do not collide here.
 */
export const planText = {
  title: "Assistente de projeto",
  /** Shown while a request is on its way; the three phases follow one another. */
  phases: ["Entendendo o pedido…", "Montando a proposta…", "Buscando no catálogo…"],
  working: "O assistente está trabalhando",
  interpreting: "interpretando…",
  proposalTitle: "Proposta para sua revisão",
  proposalFor: (name: string) => `Proposta: ${name}`,
  summaryTitle: "O que entendi",
  assumptionsTitle: "Premissas",
  questionsTitle: "Perguntas em aberto",
  questionsHint: "A proposta sai mesmo sem estas respostas; respondê-las no texto a torna mais precisa.",
  scenariosTitle: "Cenários de uso considerados",
  scenarioSource: (source: string) => `Fonte: ${source}`,
  componentsTitle: "Partes do projeto",
  componentCount: (n: number) => (n === 1 ? "1 parte" : `${n} partes`),
  function: "Função",
  objective: "Objetivo",
  index: "Índice de desempenho",
  ranking: "Ordenação",
  rankingMax: (name: string) => `${name}: quanto maior, melhor`,
  rankingMin: (name: string) => `${name}: quanto menor, melhor`,
  limits: "Limites",
  noLimits: "Sem limite numérico: a ordenação usa só o índice e a existência dos dados.",
  limitSource: (source: string) => `Fonte: ${source}`,
  materials: "Melhores materiais do catálogo",
  materialRank: (rank: number) => `${rank}º`,
  funnel: (final: number, initial: number) =>
    `${final.toLocaleString("pt-BR")} de ${initial.toLocaleString("pt-BR")} materiais passam pelos limites aplicados.`,
  noMaterials: "Nenhum material do catálogo atende aos limites aplicados.",
  noMaterialsHint:
    "Abra na Seleção para afrouxar um limite ou escolher outro índice; nenhum valor foi inventado para preencher o espaço.",
  runError: "Esta parte não pôde ser executada.",
  origin: {
    user: "Você",
    scenario: (name: string) => `Cenário: ${name}`,
    scenarioUnknown: "Cenário",
    suggestion: "Sugestão da IA, revise",
    index: "Do índice",
  },
  originHint: {
    user: "Número do seu próprio texto.",
    scenario: "Faixa da tabela de cenários do projeto.",
    suggestion:
      "Faixa proposta pela IA e conferida contra o catálogo. Só entra na seleção depois que você confirmar.",
    index: "Os dados que o índice lê precisam existir; não há número aqui.",
  },
  suggestionNotApplied: "Não aplicada até você confirmar",
  suggestionApplied: "Confirmada por você",
  suggestionConfirmTitle: "Usar esta sugestão da IA?",
  suggestionConfirmMessage: (label: string) =>
    `“${label}” é uma faixa proposta pela IA, não um valor do seu texto nem de uma fonte. Ela passou pela checagem de unidade e de faixa do catálogo, mas só você sabe se serve ao projeto. Confirmar refaz a seleção com ela.`,
  suggestionConfirm: "Confirmar e refazer",
  suggestionRerunning: "Refazendo a seleção…",
  suggestionRerunError: "Não foi possível refazer a seleção com essa escolha.",
  rejectedTitle: (n: number) => (n === 1 ? "1 sugestão recusada" : `${n} sugestões recusadas`),
  rejectedHint:
    "Nada daqui foi aplicado. As regras de segurança recusam o que não existe no catálogo e qualquer número que não venha do seu texto, de um cenário ou de uma faixa conferida.",
  degradedTitle: "Proposta montada por regras locais",
  degradedDefault: "Proposta montada por regras locais porque a IA não respondeu.",
  cached: "Resposta guardada de uma consulta recente para o mesmo texto.",
  simulated: "Provedor simulado",
  openInSelection: "Abrir na Seleção",
  openInSelectionNamed: (name: string) => `Abrir na Seleção: ${name}`,
  compare: "Comparar estes materiais",
  compareNamed: (name: string) => `Comparar estes materiais: ${name}`,
  adjust: "Ajustar o pedido",
  replaceDraftTitle: "Substituir o rascunho da Seleção?",
  replaceDraftMessage:
    "Há um rascunho de estudo neste navegador. Abrir esta parte na Seleção o substitui. O estudo ainda não foi salvo no servidor.",
  replaceDraftConfirm: "Substituir e abrir",
  draftFailed:
    "Não foi possível guardar o rascunho neste navegador; a Seleção abre só com a função escrita.",
  // Home
  homeSubmitting: "Montando…",
  homeOff:
    "A IA está desligada neste ambiente. O texto vira a função de um estudo, e você escolhe os limites e o índice nas etapas.",
  retry: "Tentar de novo",
  errorTitle: "Não foi possível montar a proposta",
  // Selection
  panelTitle: "Assistente de projeto (opcional)",
  panelSubtitle:
    "Descreva o problema em português, com ou sem números. A IA propõe função, objetivo, índice e limites; cada número mostra de onde veio e nada é aplicado sem o seu clique.",
  panelOff: "Camada de IA desativada. O sistema funciona integralmente sem ela.",
  statementLabel: "Descreva o problema em português",
  statementPlaceholder:
    "Ex.: viga leve e rígida que não pode fletir muito, usada a até 80 °C, ao ar livre.",
  statementHint: (min: number) =>
    `A proposta aparece sozinha depois que você para de digitar (a partir de ${min} caracteres), ou use Interpretar.`,
  interpret: "Interpretar",
  apply: "Aplicar ao estudo",
  stale: "O texto mudou depois desta proposta. Espere a nova leitura ou clique em Interpretar.",
  applied: "Aplicado ao estudo. Revise os limites e o índice antes de executar.",
  applyHint: "Preenche função, objetivo, índice e limites. Sugestões da IA entram só se você as marcou.",
  badges: {
    optional: "Opcional",
    review: "Nada é aplicado sem sua revisão",
  },
} as const;
