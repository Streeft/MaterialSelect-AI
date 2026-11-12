/**
 * Texts of the selection wizard's D-210 additions: progress, what blocks
 * "Executar", ready-made studies, the per-material explanation and the run
 * comparison. Kept apart from `i18n.ts` so parallel lanes that edit that file
 * do not collide with this one.
 */
export const wizardText = {
  // D-221: the study as a document — its name is the title, the problem its properties.
  doc: {
    untitled: "Estudo sem título",
    functionProp: "Função",
    objectiveProp: "Objetivo",
    variablesProp: "Variáveis livres",
    universeProp: "Universo",
    limitsProp: "Limites",
    notDescribed: "Ainda não descrita",
    notDescribedMasc: "Ainda não descrito",
    noLimits: "Nenhum limite ainda",
    noVariables: "Nenhuma",
    editIn: (step: string) => `Editar em ${step}`,
  },
  progress: {
    title: "Progresso do estudo",
    count: (done: number, total: number) =>
      `${done} de ${total} ${total === 1 ? "etapa pronta" : "etapas prontas"}`,
    next: (label: string) => `Continuar: ${label}`,
    ready: "Tudo pronto para executar",
    goRun: "Ir para Executar",
    segment: (label: string, done: boolean) => `${label}: ${done ? "pronta" : "a fazer"}`,
  },
  shortcut: {
    run: "Ctrl + Enter executa",
  },
  blockers: {
    title: "Para executar, falta:",
    goToField: "Ir ao campo",
    indexExpressionMissing:
      "Escreva a expressão do índice personalizado, ou escolha outro índice.",
  },
  templates: {
    title: "Modelos prontos",
    hint:
      "Formulações clássicas de Ashby: função, objetivo, limites e índice. Nenhum número de material vem no modelo — os valores saem do catálogo.",
    use: "Usar este modelo",
    useAria: (name: string) => `Usar este modelo: ${name}`,
    index: "Índice",
    constraint: "Restrição de projeto",
    freeVariables: "Variável livre",
    missing: (slugs: string) => `Indisponível: o catálogo não tem ${slugs}.`,
    loading: "Carregando os modelos",
    loadError: "Não foi possível carregar os modelos prontos.",
    applied: (name: string) =>
      `Modelo aplicado: ${name}. Os limites pedem só que os dados do índice existam; ajuste o que quiser e execute.`,
    goToConstraints: "Ver os limites",
    undo: "Desfazer",
  },
  explain: {
    tab: "Por material",
    title: "Por que cada material",
    hint:
      "Cada explicação lê só o que a execução devolveu: os limites, o índice, a classificação e a sensibilidade. Nada é recalculado na tela.",
    toggle: (name: string) => `Por que ${name}?`,
    showAll: (count: number) => `Mostrar todos (${count})`,
    selectAria: (name: string) => `Selecionar ${name}`,
    selected: (count: number) =>
      count === 0
        ? "Nenhum material selecionado"
        : `${count} ${count === 1 ? "material selecionado" : "materiais selecionados"}`,
    openMap: "Abrir no mapa",
    compareSelected: "Comparar selecionados",
    compareNeedsTwo: "Marque ao menos dois materiais para comparar.",
    mapNeedsOne: "Marque ao menos um material para abrir no mapa.",
    processNoMap: "Mapa e comparação valem para materiais; este estudo devolve processos.",
    noLimits: "Nenhum limite aplicado: continua porque o catálogo inteiro continua.",
    passedLimits: (labels: string) => `Passou em todos os limites: ${labels}.`,
    passedStages: (labels: string) => `Atravessou as etapas: ${labels}.`,
    indexValue: (name: string, value: string) => `Índice ${name}: ${value}.`,
    indexUndefined: (name: string, reason: string) => `Índice ${name} indefinido: ${reason}.`,
    indexUndefinedNoReason: (name: string) => `Índice ${name} indefinido para este material.`,
    ranked: (rank: number, total: number, score: string) =>
      `Posição ${rank} de ${total} na classificação, nota ${score}.`,
    heaviest: (parts: string) => `O que mais pesou na nota: ${parts}.`,
    winner: "É o vencedor desta execução.",
    sensitivityTop: (scenarios: string) => `Continua em 1º lugar nos cenários: ${scenarios}.`,
    excluded: (labels: string) =>
      `Passou nos limites, mas ficou fora da classificação por falta de: ${labels}.`,
    excludedTitle: "Ficaram fora da classificação",
    eliminatedNote:
      "Quem caiu num limite aparece no funil, em contagem por limite: a resposta da execução não lista um a um os eliminados.",
    empty: "Nenhum candidato passou nos limites: não há material a explicar.",
  },
  runs: {
    title: "Execução anterior × atual",
    hint:
      "Compara a classificação desta execução com a anterior do mesmo estudo, nesta sessão. As diferenças são calculadas no servidor.",
    loading: "Comparando as execuções",
    error: "Não foi possível comparar as execuções.",
    winnerChanged: (before: string, after: string) => `O vencedor mudou: ${before} → ${after}.`,
    winnerSame: (names: string) => `O vencedor continua: ${names}.`,
    noWinner: "ninguém",
    summary: (entered: number, left: number, moved: number) =>
      `${entered} entraram, ${left} saíram, ${moved} mudaram de posição.`,
    columnMaterial: "Material",
    columnBefore: "Antes",
    columnAfter: "Agora",
    columnChange: "Mudança",
    change: {
      up: (n: number) => `subiu ${n}`,
      down: (n: number) => `caiu ${n}`,
      same: "igual",
      entered: "entrou",
      left: "saiu",
      unranked: "sem posição",
    },
    onlyChanges: "Mostrar só o que mudou",
    nothingChanged: "Nada mudou entre as duas execuções.",
    unavailableNote:
      "Só a execução anterior desta sessão é guardada: o histórico de execuções salvo no servidor exige uma migração e está no TODO.",
  },
} as const;
