/**
 * Texts of the rich panel (D-193): tabs, filters, KPIs and the new figures.
 * Kept apart from `i18n.ts` (whose `dashboard` block keeps the original
 * figures' words) so parallel lanes editing that file do not collide here.
 */
export const dashboardText = {
  tabsLabel: "Seções do painel",
  tabs: {
    visao: "Visão geral",
    propriedades: "Propriedades",
    processos: "Processos",
    qualidade: "Qualidade",
    atividade: "Minha atividade",
  },

  filters: {
    title: "Filtros do painel",
    hint: "Valem para todas as abas, menos Minha atividade. Ficam no endereço da página, então o link reproduz a vista.",
    classe: "Classe",
    allClasses: "Todas as classes",
    subclasse: "Subclasse",
    allSubclasses: "Todas as subclasses",
    nivel: "Nível",
    nivelOption: (level: number) =>
      level === 3 ? "Nível 3 (todas)" : `Nível ${level}`,
    demo: "Dados de demonstração",
    demoTodos: "Todos os materiais",
    demoDemo: "Só demonstração",
    demoReais: "Sem demonstração",
    clear: "Limpar filtros",
    active: (n: number) => (n === 1 ? "1 filtro ativo" : `${n} filtros ativos`),
    scope: (materials: number) =>
      materials === 1 ? "1 material passa pelos filtros" : `${materials.toLocaleString("pt-BR")} materiais passam pelos filtros`,
    emptyScope: "Nenhum material passa por estes filtros.",
    // D-207: o nível 3 é "todos", e é o que o chip mostra como "Qualquer".
    nivelChip: (level: number) => `Nível ${level}`,
  },

  // D-207: os blocos da visão geral, que a pessoa reordena e oculta.
  blocks: {
    label: "Blocos da visão geral",
    hint: "Arraste pela alça ⋮⋮ ou use Alt + seta para mudar a ordem; o olho oculta um bloco. A ordem fica guardada na sua conta.",
    cobertura: "Cobertura",
    indicadores: "Indicadores",
    composicao: "Composição do catálogo",
    qualidade: "Qualidade dos valores",
    classes: "Cobertura por classe",
    lacunas: "Lacunas",
    reset: "Restaurar a ordem padrão",
  },

  actions: {
    newSelection: "Nova seleção",
    openMap: "Abrir no mapa",
    openMapPair: (x: string, y: string) => `Abrir mapa ${y} × ${x}`,
    compareTop: (n: number) => `Comparar top ${n}`,
    catalogue: "Ver no catálogo",
    exportLabel: "Exportar",
    exportCsv: "Tabelas desta aba (CSV)",
    exportCsvHint: "Com os filtros aplicados; cada célula escapada no servidor",
  },

  kpi: {
    demo: "De demonstração",
    demoOf: (total: number) => `de ${total.toLocaleString("pt-BR")} materiais filtrados`,
    withProcess: "Materiais com processo",
    classes: "Classes",
    subclasses: "Subclasses",
    subclassesNote: (unnamed: number) =>
      unnamed === 0 ? "todo material com subclasse" : `${unnamed.toLocaleString("pt-BR")} materiais sem subclasse`,
    properties: "Propriedades",
    propertiesNote: (level: number) =>
      level === 3 ? "propriedades: todas as do catálogo" : `propriedades visíveis no Nível ${level}`,
    processes: "Processos",
    processesNote: (without: number) =>
      without === 0 ? "todo material com processo" : `${without.toLocaleString("pt-BR")} materiais sem processo`,
  },

  composition: {
    title: "Composição do catálogo",
    hint: "Área proporcional ao número de materiais: classes e, dentro delas, subclasses. Clique para abrir no catálogo.",
    figure: "Composição por classe e subclasse",
    unnamed: "Sem subclasse",
    columnClass: "Classe",
    columnSubclass: "Subclasse",
    columnMaterials: "Materiais",
    columnShare: "Participação",
    open: (label: string) => `${label}: abrir no catálogo`,
    empty: "Nenhum material para compor.",
  },

  property: {
    pickerLabel: "Propriedade",
    statsTitle: (name: string) => `Resumo de ${name}`,
    count: "Com valor",
    coverage: "Cobertura",
    noCoverage: "sem materiais",
    median: "Mediana",
    mean: "Média",
    range: "Faixa",
    iqr: "Quartis (Q1–Q3)",
    missing: "Declarados ausentes",
    notRecorded: "Não registrados",
    noValues: "sem valores",
    histogramTitle: "Histograma",
    histogramHint: (log: boolean) =>
      log
        ? "Faixas iguais em escala logarítmica, calculadas no servidor (Freedman–Diaconis)."
        : "Faixas iguais em escala linear, calculadas no servidor (Freedman–Diaconis).",
    histogramFigure: (name: string) => `Histograma de ${name}`,
    histogramEmpty: "Nenhum material filtrado tem valor desta propriedade.",
    bin: "Faixa",
    binCount: "Materiais",
    binRange: (lower: string, upper: string) => `${lower} a ${upper}`,
    axisCount: "Materiais",
  },

  top: {
    title: "Ranking",
    hint: "Os melhores (ou piores) materiais filtrados por uma propriedade ou por um índice de desempenho, ordenados no servidor.",
    target: "Ordenar por",
    groupProperties: "Propriedades",
    groupIndices: "Índices de desempenho",
    order: "Ordem",
    best: "Melhores",
    worst: "Piores",
    size: "Quantos",
    columnRank: "Posição",
    columnMaterial: "Material",
    columnClass: "Classe",
    columnValue: "Valor",
    direction: (direction: "maior" | "menor") =>
      direction === "maior" ? "Melhor = maior valor." : "Melhor = menor valor.",
    without: (n: number) =>
      n === 0 ? "" : n === 1 ? "1 material sem valor ficou de fora (não vira zero)." : `${n.toLocaleString("pt-BR")} materiais sem valor ficaram de fora (não viram zero).`,
    empty: "Nenhum material filtrado tem valor para ordenar.",
    demo: "demonstração",
  },

  correlation: {
    title: "Correlação entre propriedades",
    hint: (minPairs: number) =>
      `ρ de Spearman (por postos), calculado no servidor só sobre os materiais que têm as duas propriedades. Com menos de ${minPairs} pares, a célula fica sem ρ. Clique numa célula para abrir o par no mapa.`,
    figure: "Matriz de correlação de Spearman",
    pick: "Propriedades da matriz",
    pickHint: "Escolha as colunas; sem escolha, o servidor usa as 12 mais preenchidas do nível.",
    reset: "Voltar ao padrão",
    all: "Todas do nível",
    noRho: "dados insuficientes",
    pairs: (n: number) => (n === 1 ? "1 par" : `${n.toLocaleString("pt-BR")} pares`),
    columnA: "Propriedade A",
    columnB: "Propriedade B",
    columnRho: "ρ",
    columnPairs: "Pares",
    legendNeg: "−1 (inversa)",
    legendZero: "0",
    legendPos: "+1 (direta)",
    legendNone: "Sem ρ",
    strength: (rho: number) => {
      const a = Math.abs(rho);
      const kind = a >= 0.7 ? "forte" : a >= 0.4 ? "moderada" : a >= 0.2 ? "fraca" : "desprezível";
      return rho >= 0 ? `direta ${kind}` : `inversa ${kind}`;
    },
    cellAria: (a: string, b: string, value: string, pairs: string) => `${a} × ${b}: ρ ${value}, ${pairs}`,
    empty: "Escolha ao menos duas propriedades.",
  },

  processes: {
    familiesTitle: "Processos por família",
    familiesHint: "Quantos processos ativos há em cada família e quantos materiais filtrados eles alcançam.",
    familiesFigure: "Processos por família",
    columnFamily: "Família",
    columnGroup: "Grupo",
    columnProcesses: "Processos",
    columnReach: "Materiais alcançados",
    byProcessTitle: "Materiais por processo",
    byProcessHint: "Todos os processos ativos, do mais usado ao menos usado entre os materiais filtrados. Clique para abrir o processo.",
    byProcessFigure: "Materiais por processo",
    columnProcess: "Processo",
    columnMaterials: "Materiais",
    columnShare: "Dos filtrados",
    showAll: (n: number) => `Mostrar todos os ${n.toLocaleString("pt-BR")}`,
    showTop: (n: number) => `Mostrar só os ${n} primeiros`,
    byClassTitle: "Alcance por classe de material",
    columnClass: "Classe",
    columnClassMaterials: "Materiais",
    columnClassProcesses: "Processos distintos",
    empty: "Nenhum processo cadastrado.",
    open: (name: string) => `${name}: abrir o processo`,
  },

  quality: {
    sourcesTitle: "Qualidade por fonte",
    sourcesHint: "De onde vêm os valores com número e com que procedência, fonte a fonte.",
    sourcesFigure: "Qualidade por fonte",
    columnSource: "Fonte",
    columnMaterials: "Materiais",
    columnValues: "Valores",
    columnMissing: "Ausentes declarados",
    columnShare: "Dos valores",
    noSource: "Sem fonte",
    demoSource: "demonstração",
    empty: "Nenhum valor com número nos materiais filtrados.",
    propertyTableTitle: "Cobertura por propriedade",
    propertyTableHint: "Todas as propriedades do nível, da menos para a mais preenchida.",
  },

  activity: {
    intro: "Só os seus números: estudos, gráficos e cadernos que você criou, o que você alterou e quanto usou da IA.",
    studies: "Estudos",
    charts: "Gráficos salvos",
    notebooks: "Cadernos",
    ownMaterials: "Registros próprios",
    aiToday: "IA hoje",
    aiTodayNote: (used: number, limit: number) => `${used.toLocaleString("pt-BR")} de ${limit.toLocaleString("pt-BR")} consultas`,
    aiTodayDetail: (artifacts: number, fetches: number, fetchLimit: number) =>
      `${artifacts.toLocaleString("pt-BR")} artefatos · ${fetches.toLocaleString("pt-BR")} de ${fetchLimit.toLocaleString("pt-BR")} buscas externas`,
    monthsTitle: "O que você criou, mês a mês",
    monthsHint: "Estudos, gráficos salvos e cadernos dos últimos 12 meses.",
    monthsFigure: "Criações por mês",
    monthsEmpty: "Nada criado nos últimos 12 meses.",
    aiEmpty: "Nenhuma consulta à IA nos últimos 14 dias.",
    columnMonth: "Mês",
    aiTitle: "Seu uso de IA nos últimos 14 dias",
    aiHint: (limit: number) => `Consultas por dia. O limite diário é de ${limit.toLocaleString("pt-BR")} por pessoa.`,
    aiFigure: "Consultas à IA por dia",
    columnDay: "Dia",
    columnRequests: "Consultas",
    columnArtifacts: "Artefatos",
    columnFetches: "Buscas externas",
    recentTitle: "Suas últimas alterações",
    recentEmpty: "Nenhuma alteração registrada na auditoria ainda.",
    actions: { CRIADO: "Criou", ATUALIZADO: "Alterou", EXCLUIDO: "Excluiu" } as Record<string, string>,
    entities: {
      material: "material",
      material_class: "classe",
      property_definition: "propriedade",
      performance_index: "índice",
      selection_study: "estudo",
      equivalence_group: "grupo de equivalência",
    } as Record<string, string>,
    actionsSummary: (counts: Record<string, number>) => {
      const parts = Object.entries(counts).map(([k, v]) => `${v.toLocaleString("pt-BR")} ${k.toLowerCase()}`);
      return parts.length ? parts.join(" · ") : "nenhuma ação";
    },
    error: "Não foi possível carregar a sua atividade.",
    loading: "Carregando a sua atividade…",
  },

  loading: "Carregando…",
  error: "Não foi possível carregar esta parte do painel.",
} as const;
