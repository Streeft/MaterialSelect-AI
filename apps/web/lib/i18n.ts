// Minimal pt-BR dictionary. Structured as a flat map so an English locale can be
// added later without touching call sites (swap the active dictionary).

/**
 * The word an unnamed stage is described by (P0-2).
 *
 * A table and not a ternary: with three kinds a ternary silently maps the third
 * to whichever branch is the fallback, and the stage would be labelled wrong
 * instead of visibly unlabelled.
 */
type StageKindWord = "limit" | "tree" | "process" | "material" | "chart";

const STAGE_KIND_WORDS: Record<StageKindWord, string> = {
  limit: "limites",
  tree: "classes",
  process: "processos",
  material: "materiais",
  chart: "gráfico",
};

function stageKindWord(kind: StageKindWord): string {
  return STAGE_KIND_WORDS[kind];
}

export const ptBR = {
  appName: "MaterialSelect AI",
  tagline: "Apoio à seleção de materiais pela metodologia de Ashby",
  demoWarning:
    "Dados exclusivamente demonstrativos. Não utilizar em projetos reais.",
  demoBadge: "Demonstrativo",
  nav: {
    home: "Início",
    catalog: "Catálogo",
    selection: "Seleção",
    maps: "Mapas",
    compare: "Comparar",
    solver: "Dimensionar",
    cost: "Custo",
    eco: "Eco",
    dashboard: "Painel",
    imports: "Importar",
    classes: "Classes",
    properties: "Propriedades",
    // P1-4: o segundo universo ganha porta de entrada própria. Estava acessível
    // só de dentro de um estágio de seleção e da ficha de um material — o que
    // faz do universo de processos algo que se usa, nunca algo que se navega.
    processes: "Processos",
    // P1-4: o espaço do usuário. Fica em "Dados" e não em "Estudar" porque é
    // onde os registros moram, não uma ferramenta de decidir com eles.
    myRecords: "Meus registros",
    // Eight links in a row said nothing about what belongs with what. The
    // groups are the three things someone does here, in the order they do them.
    groupStudy: "Estudar",
    groupData: "Dados",
    groupAdmin: "Administrar",
  },

  actions: {
    new: "Novo material",
    edit: "Editar",
    save: "Salvar",
    cancel: "Cancelar",
    delete: "Excluir",
    deactivate: "Desativar",
    add: "Adicionar",
    remove: "Remover",
    create: "Criar",
    /** Header of a table column that holds buttons; usually screen-reader only. */
    columnActions: "Ações",
    confirmDeactivate:
      "Desativar este material? Ele sairá do catálogo, mas poderá ser reativado.",
    confirmDelete: "Excluir definitivamente? Esta ação não pode ser desfeita.",
    saving: "Salvando…",
  },
  form: {
    name: "Nome",
    class: "Classe",
    subclass: "Subclasse",
    description: "Descrição",
    keywords: "Palavras-chave (separadas por vírgula)",
    selectClass: "Selecione uma classe",
    selectProperty: "Selecione uma propriedade",
    selectUnit: "Selecione uma unidade",
    identification: "Identificação",
    values: "Valores de propriedade",
    property: "Propriedade",
    kind: "Tipo",
    kindScalar: "Valor único",
    kindInterval: "Intervalo",
    kindMissing: "Ausente",
    value: "Valor",
    valueMin: "Mínimo",
    valueMax: "Máximo",
    valueTypical: "Típico (opcional)",
    unit: "Unidade",
    uncertainty: "Incerteza (opcional)",
    condition: "Condição (opcional)",
    source: "Fonte (opcional)",
    quality: "Qualidade",
    notes: "Observações (opcional)",
    addValue: "Adicionar propriedade",
    noValues: "Nenhuma propriedade adicionada.",
    createTitle: "Novo material",
    editTitle: "Editar material",
    required: "Campo obrigatório.",
    genericError:
      "Não foi possível salvar. Verifique os dados e tente novamente.",
  },
  admin: {
    classesTitle: "Classes de materiais",
    propertiesTitle: "Catálogo de propriedades",
    newClass: "Nova classe",
    newProperty: "Nova propriedade",
    parent: "Classe pai (opcional)",
    noParent: "Nenhuma (classe raiz)",
    materialCount: "Materiais",
    valueCount: "Valores",
    slug: "Slug (opcional)",
    symbol: "Símbolo",
    category: "Categoria",
    canonicalUnit: "Unidade canônica",
    physicalDimension: "Dimensão física (Pint)",
    acceptedUnits: "Unidades aceitas (separadas por vírgula)",
    isInterval: "Intervalar",
    betterDirection: "Direção desejável",
    allowsLog: "Permite escala log",
    inUse: "em uso",
  },
  direction: {
    HIGHER: "Maior é melhor",
    LOWER: "Menor é melhor",
    NEUTRAL: "Neutro",
  },
  importer: {
    title: "Importar materiais",
    subtitle: "Arquivo → Mapeamento → Validação → Conclusão",
    // The stepper numbers the steps itself; a "1." in the label would print twice.
    stepUpload: "Arquivo",
    stepMapping: "Mapeamento",
    stepReport: "Validação",
    stepDone: "Conclusão",
    // Why a step cannot be opened yet. Shown at the moment someone tries.
    blockedMapping: "Envie um arquivo para mapear as colunas.",
    blockedReport: "Valide o mapeamento para ver o relatório.",
    blockedDone: "Importe as linhas válidas para concluir.",
    dropHint: "Selecione um arquivo CSV ou XLSX (até 5 MB).",
    uploading: "Enviando…",
    sheet: "Aba",
    preview: "Amostra do arquivo",
    rows: (n: number) =>
      `${n} ${n === 1 ? "linha de dados" : "linhas de dados"}`,
    mappingTitle: "Mapeie as colunas",
    mappingHelp:
      "Indique o que cada coluna representa. Colunas ignoradas não serão importadas. Unidades detectadas no cabeçalho ou na célula têm prioridade.",
    columnRole: "Papel",
    columnSource: "Coluna",
    columnTarget: "Destino",
    selectProperty: "Selecione uma propriedade",
    // Each control in the mapping table repeats down the rows, so its accessible
    // name has to say which column it belongs to — otherwise a screen reader
    // hears "Destino" five times with nothing to tell them apart.
    ariaTarget: (column: string) => `Destino da coluna ${column}`,
    ariaProperty: (column: string) => `Propriedade da coluna ${column}`,
    ariaRole: (column: string) => `Papel da coluna ${column}`,
    ariaUnit: (column: string) => `Unidade da coluna ${column}`,
    ignore: "Ignorar",
    targetName: "Nome do material",
    targetClass: "Classe",
    targetSubclass: "Subclasse",
    targetDescription: "Descrição",
    targetKeywords: "Palavras-chave",
    targetProperty: "Propriedade",
    property: "Propriedade",
    unit: "Unidade",
    roleValue: "Valor",
    roleMin: "Mínimo",
    roleMax: "Máximo",
    roleTypical: "Típico",
    defaultClass: "Classe padrão (quando a coluna estiver vazia)",
    noDefaultClass: "Nenhuma",
    sourceLabel: "Fonte dos dados (opcional)",
    sourcePlaceholder: "ex.: Planilha Prof. Fulano 2026",
    errorNoNameColumn: "Indique qual coluna contém o nome do material.",
    errorPropertyWithoutSlug:
      "Há colunas de propriedade sem a propriedade selecionada.",
    errorNoClass: "Mapeie uma coluna de classe ou escolha uma classe padrão.",
    errorTemplateName: "Informe um nome para o template.",
    templates: "Template de mapeamento",
    applyTemplate: "Aplicar template…",
    saveTemplate: "Salvar como template",
    templateName: "Nome do template",
    validate: "Validar",
    validating: "Validando…",
    reportTitle: "Relatório de validação",
    ok: "Válidos",
    withError: "Com erro",
    duplicates: "Duplicados",
    total: "Total",
    row: "Linha",
    statusOk: "OK",
    statusError: "Erro",
    statusDuplicate: "Duplicado",
    columnDetails: "Detalhes",
    // Not "Erro": the status column already says that, and a second badge with
    // the same word says nothing about what it does to the line.
    issueLabel: "Impede",
    warningLabel: "Aviso",
    rowOk: "Nada a corrigir nesta linha.",
    // A dash in a preview is indistinguishable from a dash that is the data.
    emptyCell: "vazia",
    noName: "sem nome",
    reportHint:
      "Cada linha aparece com o que foi encontrado nela. O que está marcado como “Impede” bloqueia a importação daquela linha; avisos não.",
    commitHint:
      "Apenas as linhas válidas serão importadas. Linhas com erro ou duplicadas serão ignoradas.",
    commit: "Importar linhas válidas",
    committing: "Importando…",
    cancelImport: "Cancelar importação",
    doneTitle: "Importação concluída",
    doneSummary: (n: number, skipped: number) =>
      `${n} ${n === 1 ? "material importado" : "materiais importados"}; ${skipped} ${skipped === 1 ? "linha ignorada" : "linhas ignoradas"}.`,
    goCatalog: "Ver no catálogo",
    newImport: "Nova importação",
    rollback: "Reverter importação",
    rollbackConfirm:
      "Reverter esta importação? Todos os materiais criados por ela serão removidos.",
    historyTitle: "Histórico de importações",
    historyEmpty: "Nenhuma importação realizada.",
    columnFile: "Arquivo",
    columnDate: "Data",
    columnStatus: "Status",
    columnCounts: "Válidos / Erros / Duplicados",
    columnImported: "Importados",
    status: {
      PENDENTE: "Pendente",
      VALIDADO: "Validado",
      IMPORTADO: "Importado",
      CANCELADO: "Cancelado",
      REVERTIDO: "Revertido",
    },
    genericError:
      "Não foi possível concluir a operação. Verifique os dados e tente novamente.",
  },
  selection: {
    title: "Seleção de materiais",
    subtitle:
      "Função → Restrições → Objetivo → Ranking (determinístico, sem IA)",
    // The stepper numbers the steps itself; a "1." in the label would print twice.
    stepFunction: "Função",
    stepConstraints: "Restrições",
    stepObjective: "Objetivo",
    stepResults: "Resultados",
    // Why a step cannot be opened yet. Shown at the moment someone tries.
    blockedResults: "Execute a seleção para ver os resultados.",
    back: "Voltar",
    advance: "Avançar",
    functionTitle: "Descrição do problema",
    studyName: "Nome do estudo",
    functionText: "Função do componente",
    objectiveText: "Objetivo",
    freeVariables: "Variáveis livres (separadas por vírgula)",
    functionHint: "Descreva o que o componente faz e o que se deseja otimizar.",
    constraintsTitle: "Restrições",
    constraintsHint:
      "Cada restrição elimina candidatos. A contagem restante é recalculada a cada mudança.",
    combinator: "Combinar restrições com",
    addConstraint: "Adicionar restrição",
    noConstraints: "Nenhuma restrição — todos os materiais são candidatos.",
    // M6: grupos aninhados de AND/OR. Cada grupo tem seu próprio operador —
    // o rótulo abaixo nomeia esse controle quando ele não é o do grupo-raiz
    // (esse usa `combinator` acima, com o mesmo sentido).
    addGroup: "Adicionar grupo",
    removeGroup: "Remover grupo",
    groupOperatorLabel: "Operador do grupo",
    groupNumber: (n: number) => `Grupo ${n}`,
    emptyGroup: "Grupo vazio — adicione uma restrição ou um subgrupo.",
    // P0-1: a seleção é uma pilha ordenada de estágios. O padrão continua sendo
    // um único estágio de limites, então quem faz um estudo simples não vê
    // vocabulário novo — os rótulos abaixo só aparecem quando há pilha.
    // P0-3: o universo do resultado. "Universo" é o termo do método, e é o que
    // o relatório também usa — a tela e o documento não podem divergir.
    universeTitle: "Universo do resultado",
    universeHint:
      "O que a seleção devolve. Trocar reinicia os estágios: cada universo tem os seus, e um estágio do outro seria recusado.",
    universeMaterial: "Materiais",
    universeProcess: "Processos",
    universeProcessNote:
      "Um estudo de processos ainda não ranqueia nem aceita índice de desempenho: processo não tem atributo cadastrado, e a ferramenta não inventa valor.",
    stagesTitle: "Estágios da seleção",
    stagesHint:
      "Os estágios se aplicam em ordem, e o resultado é a interseção dos habilitados. Desligar um estágio mostra o efeito dele sem apagar o que você escreveu.",
    stageKindLimit: "Limites",
    stageKindTree: "Classes",
    // P0-2: o terceiro tipo. "Processos" e não "Fabricação" porque é o registro
    // que se escolhe, e é como o resto da interface e o relatório o chamam.
    stageKindProcess: "Processos",
    // P0-3: o estágio de travessia visto do lado do processo.
    stageKindMaterial: "Materiais",
    // P1-2: o quarto tipo. "Gráfico" e não "Mapa" porque é o gesto que se faz —
    // desenhar no gráfico —, e "Mapa" já nomeia a tela `/app/mapas`.
    stageKindChart: "Gráfico",
    stageNumber: (n: number, kind: StageKindWord) =>
      `Estágio ${n} (${stageKindWord(kind)})`,
    stageLabel: "Nome do estágio",
    stageLabelPlaceholder: "Opcional — ex.: Só metais leves",
    stageEnabled: "Habilitado",
    stageEnabledHint: "Um estágio desligado não estreita, mas continua salvo.",
    stageAddLimit: "Estágio de limites",
    stageAddTree: "Estágio de classes",
    stageAddProcess: "Estágio de processos",
    stageAddMaterial: "Estágio de materiais",
    stageAddChart: "Estágio de gráfico",
    stageRemove: "Remover estágio",
    stageMoveUp: (n: number) => `Mover o estágio ${n} para cima`,
    stageMoveDown: (n: number) => `Mover o estágio ${n} para baixo`,
    stageClasses: "Classes selecionadas",
    stageClassesHint: "Segure Ctrl (ou Cmd) para escolher mais de uma.",
    stageIncludeDescendants: "Incluir subclasses",
    stageIncludeDescendantsHint:
      "Marcado, escolher uma classe traz tudo o que está abaixo dela na hierarquia.",
    stageNoClasses:
      "Nenhuma classe escolhida — este estágio não estreita nada.",
    // P0-2. O estágio de processo é a junção entre as duas tabelas: dos
    // processos selecionados para os materiais que eles servem.
    stageProcesses: "Processos selecionados",
    stageProcessClasses: "Famílias de processo",
    stageProcessesHint:
      "Vale qualquer um dos escolhidos. Para exigir dois processos ao mesmo tempo, use dois estágios — a pilha os intersecta.",
    stageIncludeProcessDescendants: "Incluir subfamílias",
    stageIncludeProcessDescendantsHint:
      "Marcado, escolher uma família traz todos os processos abaixo dela.",
    stageNoProcesses:
      "Nenhum processo escolhido — este estágio não estreita nada.",
    // P0-3: o estágio de travessia num estudo de processos.
    stageMaterialClasses: "Classes de material atendidas",
    stageMaterialsHint:
      "Mantém os processos que servem algum material das classes escolhidas. Só pastas: um material não tem identificador de folha aqui.",
    stageNoMaterialClasses:
      "Nenhuma classe de material escolhida — este estágio não estreita nada.",
    stageMaterialWarning:
      "Processo sem material vinculado não passa por este estágio: não se seleciona sobre dado que não se tem.",
    stageProcessWarning:
      "Material sem processo cadastrado não passa por este estágio: não se seleciona sobre dado que não se tem.",
    // P1-2: o estágio de gráfico — a região de um plano como critério.
    stageChartHint:
      "Escolha o plano e desenhe nele: a caixa limita cada eixo, e a linha de índice admite o lado favorável. Sem caixa e sem linha, o estágio ainda exige que o registro possa ser posto neste plano.",
    stageChartAxisX: "Eixo X",
    stageChartAxisY: "Eixo Y",
    stageChartAxisKind: "O eixo é",
    stageChartAxisProperty: "Propriedade",
    stageChartAxisExpression: "Índice",
    stageChartExpression: "Expressão do índice",
    stageChartExpressionPlaceholder: "ex.: sqrt(modulo_young)/densidade",
    stageChartExpressionHint:
      "É aqui que este estágio vai além de um estágio de limites: um limite nomeia uma propriedade cadastrada e não alcança uma combinação delas.",
    stageChartMin: "Mínimo",
    stageChartMax: "Máximo",
    // D-... / ADR 0004: a caixa é lida de um eixo já desenhado em unidade
    // canônica, então não há seletor de unidade — e dizer isso é obrigação,
    // porque o campo de uma restrição, logo acima na mesma tela, tem um.
    stageChartBoundsHint: (unit: string) =>
      `Em ${unit}, a unidade canônica do eixo. Deixe em branco para não limitar esse lado — em branco não é zero.`,
    stageChartBoundsHintPlain:
      "Na unidade canônica do eixo. Deixe em branco para não limitar esse lado — em branco não é zero.",
    stageChartLine: "Linha de índice",
    stageChartLineHint:
      "Admite quem está do lado favorável da linha. A expressão e o nível andam juntos: nível sem expressão não é nível de nada, e expressão sem nível é uma linha sem posição.",
    stageChartLevel: "Nível da linha",
    stageChartGoal: "Lado favorável",
    stageChartGoalMaximize: "Maior é melhor",
    stageChartGoalMinimize: "Menor é melhor",
    stageChartNoAxes:
      "Escolha as duas propriedades (ou escreva as duas expressões) — sem os dois eixos não há plano.",
    stageChartPlottableOnly:
      "Sem caixa e sem linha: este estágio admite todo registro que possa ser desenhado neste plano, e só ele.",
    stageChartWarning:
      "Registro sem um dos dois valores não é desenhado no plano e não passa — mesmo onde a caixa não limita aquele eixo.",
    stageChartInvertedBox: (axis: string) =>
      `O mínimo do eixo ${axis} é maior que o máximo: assim nada passa.`,
    stagePassedAlone: "Admitidos sozinho",
    stageRemaining: "Restantes",
    stageDisabled: "Desligado",
    operatorAnd: "E",
    operatorOr: "OU",
    property: "Propriedade",
    operator: "Operador",
    // Symbols alone name nothing to a screen reader, and "∈ faixa" was a
    // Portuguese string living in a component file.
    operators: {
      gte: "≥ maior ou igual",
      gt: "> maior que",
      lte: "≤ menor ou igual",
      lt: "< menor que",
      between: "∈ dentro da faixa",
      outside: "∉ fora da faixa",
      exists: "tem valor cadastrado",
      not_exists: "não tem valor cadastrado",
      in_class: "∈ pertence à classe",
      not_in_class: "∉ não pertence à classe",
      text_contains: "texto contém",
      // P0-4: set membership over a discrete process attribute. Offered only in
      // a process study — no material property is discrete.
      has_any_label: "∈ tem algum dos rótulos",
      has_no_label: "∉ não tem nenhum dos rótulos",
    },
    constraintNumber: (n: number) => `Restrição ${n}`,
    selectProperty: "Selecione uma propriedade",
    // P0-4: in a process study the row selects on a process *attribute*, which
    // is a different catalogue — the field is named for what it holds.
    attribute: "Atributo do processo",
    selectAttribute: "Selecione um atributo",
    labels: "Rótulos",
    labelsPickAttributeFirst:
      "Escolha o atributo para ver os rótulos possíveis.",
    selectCriterion: "Selecione um critério",
    autoDirection: "Automática (pela propriedade)",
    value: "Valor",
    valueMin: "Mínimo",
    valueMax: "Máximo",
    unit: "Unidade",
    classes: "Classes",
    text: "Texto",
    remaining: "Candidatos restantes",
    of: "de",
    counterHint: "Atualizado a cada mudança nas restrições.",
    counterPending: "Recalculando…",
    counterError: "Não foi possível recontar os candidatos.",
    actionBar: "Ações da etapa",
    objectiveTitle: "Índice de desempenho e ranking",
    objectiveHint:
      "Escolha um índice de mérito (opcional) e defina os critérios de ranking com pesos.",
    performanceIndex: "Índice de desempenho",
    noIndex: "Nenhum índice",
    customIndex: "Expressão personalizada",
    expression: "Expressão",
    expressionHint:
      "Use os slugs das propriedades, números, + - * / ** e sqrt/cbrt/abs.",
    goal: "Objetivo",
    maximize: "Maximizar",
    minimize: "Minimizar",
    dimension: "Dimensão",
    validate: "Validar expressão",
    variablesAvailable: "Variáveis disponíveis",
    rankingTitle: "Critérios de ranking",
    rankingHint:
      "Some ponderada normalizada. Pesos são renormalizados para somar 1.",
    addCriterion: "Adicionar critério",
    useIndexCriterion: "Usar o índice como critério",
    criterion: "Critério",
    direction: "Direção",
    dirMax: "Maior é melhor",
    dirMin: "Menor é melhor",
    weight: "Peso",
    normalization: "Normalização",
    normMinmax: "Min-máx",
    normVector: "Vetorial",
    method: "Método de ranking",
    methodWeightedSum: "Soma ponderada",
    methodTopsis: "TOPSIS",
    methodPromethee: "PROMETHEE II",
    // Por que a normalização some: os dois métodos fixam a própria por
    // dentro (ver o docstring de RankingIn no backend) — mostrá-la como se
    // ainda valesse enganaria quem está montando o estudo.
    methodHint:
      "TOPSIS e PROMETHEE II combinam os critérios de outro jeito e usam normalização própria — a escolha de normalização abaixo só vale para a soma ponderada.",
    run: "Executar seleção",
    running: "Executando…",
    resultsTitle: "Resultados",
    funnel: "Funil de eliminação",
    funnelHint:
      "Cada barra mostra quantos candidatos sobrevivem à etapa, em proporção ao conjunto inicial.",
    initial: "Inicial",
    passed: "Passam",
    eliminated: "eliminados",
    candidates: "Candidatos",
    ranking: "Ranking",
    rank: "#",
    score: "Pontuação",
    indexValue: "Índice",
    indexUndefined: "Índice indefinido",
    contributions: "Contribuições por critério",
    contributionsHint:
      "Quanto cada critério pesou na pontuação. As larguras são a proporção de cada parcela no total.",
    excludedTitle: "Excluídos por dados ausentes",
    excludedHint:
      "Estes materiais não têm valor para todos os critérios e não foram ranqueados.",
    missing: "faltando",
    sensitivity: "Análise de sensibilidade",
    sensitivityHint: "Como o 1º colocado muda ao variar os pesos.",
    scenario: "Cenário",
    topMaterial: "1º colocado",
    changed: "mudou",
    unchanged: "estável",
    // The results screen is long; these are the blocks someone jumps between.
    onThisPage: "Nesta página",
    provenanceTitle: "Proveniência do resultado",
    provenanceHint:
      "O que gerou exatamente estes números. É o mesmo conteúdo que vai para o relatório exportado.",
    provCombinator: "Combinação das restrições",
    provConstraints: "Etapas de eliminação",
    provIndexExpression: "Expressão do índice",
    provIndexGoal: "Sentido do índice",
    provIndexDimension: "Dimensão do índice",
    provIndexDefined: "Materiais com índice definido",
    provCriteria: "Critérios e pesos",
    provNone: "não usado neste estudo",
    saveStudy: "Salvar estudo",
    saveNeedsName: "Dê um nome ao estudo na etapa Função para poder salvá-lo.",
    saved: "Estudo salvo.",
    savedStudies: "Estudos salvos",
    noStudies: "Nenhum estudo salvo.",
    load: "Abrir",
    delete: "Excluir",
    deleteConfirm: "Excluir este estudo salvo?",
    runSaved: "Executar",
    emptyResults: "Nenhum candidato após as restrições.",
    viewOnMap: "Ver candidatos no mapa",
    compareCandidates: "Comparar candidatos",
    genericError:
      "Não foi possível concluir a operação. Verifique os critérios e tente novamente.",
    validationOk: "Expressão válida.",
    // AHP (Analytic Hierarchy Process): uma forma alternativa de chegar aos
    // pesos dos critérios, por comparação pareada — não um quarto método de
    // ranking (esse continua sendo `method` acima).
    ahp: {
      toggle: "Derivar pesos por comparação pareada (AHP)",
      toggleHint:
        "Em vez de digitar cada peso, compare os critérios dois a dois numa escala de 1 a 9 e deixe o sistema calcular os pesos.",
      title: "Comparação pareada",
      hint: "Para cada par, diga o quanto o critério da linha é mais importante que o da coluna (1 = igualmente importante, 9 = extremamente mais importante). A metade abaixo da diagonal é o recíproco, calculado automaticamente.",
      needsCriteria:
        "Escolha ao menos dois critérios com propriedade definida para usar o AHP.",
      pairLabel: (a: string, b: string) => `${a} em relação a ${b}`,
      computing: "Calculando pesos…",
      consistency: (ratio: string) => `Consistência: ${ratio}`,
      consistencyOk: "ok",
      consistencyBad: "revise os julgamentos",
      // Saaty's fundamental scale: only the odd anchors (1/3/5/7/9) carry a
      // verbal description of their own — 2/4/6/8 are unlabeled compromises
      // between two anchors, so the picker offers these nine points.
      judgmentExtreme: "9 — extremamente mais importante",
      judgmentVeryStrong: "7 — muito fortemente mais importante",
      judgmentStrong: "5 — fortemente mais importante",
      judgmentModerate: "3 — moderadamente mais importante",
      judgmentEqual: "1 — igualmente importante",
      judgmentModerateReverse: "1/3 — moderadamente menos importante",
      judgmentStrongReverse: "1/5 — fortemente menos importante",
      judgmentVeryStrongReverse: "1/7 — muito fortemente menos importante",
      judgmentExtremeReverse: "1/9 — extremamente menos importante",
    },
  },
  ai: {
    title: "Interpretar enunciado (opcional)",
    subtitle:
      "A IA lê o enunciado e propõe função, restrições e índices já cadastrados. Ela não calcula nada: todo número vem do backend e toda sugestão passa pela sua revisão.",
    disabled:
      "Camada de IA desativada. O sistema funciona integralmente sem ela.",
    simulatedBadge: "Provedor simulado",
    // Um provedor externo é a exceção, não o padrão: quem está vendo a tela
    // precisa saber que aquela leitura veio de um modelo — e que ela pode sair
    // diferente da próxima vez. O detalhe fica na ressalva, ao pé da proposta.
    modelBadge: (provider: string) => `Modelo externo: ${provider}`,
    // §3.4 da proposta: a assistência é opcional e passa pela revisão de quem
    // usa. Isso precisa estar dito no painel, não só na documentação.
    optionalBadge: "Opcional",
    reviewBadge: "Nada é aplicado sem sua revisão",
    statementLabel: "Descreva o problema em português",
    statementPlaceholder:
      "Ex.: preciso de uma viga leve e rígida; a temperatura de serviço deve ser no mínimo 300 °C e a densidade no máximo 3 g/cm3.",
    interpret: "Interpretar",
    interpreting: "Interpretando…",
    interpretingWithKnowledge: "Consultando a base de conhecimento…",
    proposalTitle: "Proposta para sua revisão",
    reading: "Leitura do enunciado",
    functionRead: "Função",
    objectiveRead: "Objetivo",
    freeVariablesRead: "Variáveis livres",
    constraintsRead: "Restrições reconhecidas",
    indicesRead: "Índices sugeridos do catálogo",
    propertiesRead: "Propriedades citadas",
    chartRead: "Mapa sugerido",
    evidence: "Trecho do enunciado",
    apply: "Aplicar selecionados",
    applied: "Sugestões aplicadas. Revise antes de executar.",
    selectAll: "Selecionar tudo",
    selectNone: "Limpar seleção",
    openQuestions: "O que a interpretação não conseguiu determinar",
    rejected: "Sugestões recusadas pelas regras de segurança",
    rejectedHint:
      "Nada aqui foi aplicado. As regras recusam entidades inexistentes e qualquer número que não apareça no seu enunciado.",
    nothingToApply: "Nenhuma sugestão selecionada.",
    error: "Não foi possível interpretar o enunciado.",
    explain: "Explicar resultado",
    explaining: "Redigindo…",
    explainingWithKnowledge: "Consultando a base de conhecimento…",
    sourcesConsulted: "Fontes consultadas",
    explanationTitle: "Explicação do estudo",
    caveats: "Limites desta leitura",
    explainError: "Não foi possível gerar a explicação.",
    close: "Fechar",
  },
  exports: {
    title: "Exportar",
    csv: "CSV",
    xlsx: "XLSX",
    html: "HTML para impressão",
    htmlTitle: "Abre em nova aba, pronto para imprimir ou salvar como PDF",
    catalogue: "Exportar catálogo",
    study: "Exportar relatório",
    hint: "O relatório traz o mapa de seleção, restrições, funil, índice, ranking, excluídos por dado ausente, sensibilidade e a proveniência de cada número — com o aviso de limitação exigido.",
    laudoTitle: "Laudo de engenharia",
    laudoButton: "Gerar laudo",
    laudoHint:
      "Documento único, distinto do relatório: mapa de seleção, gráfico de ranqueamento, as mesmas tabelas de auditoria e, se a camada de IA estiver ligada, uma interpretação técnica.",
    laudoResponsibleLabel: "Responsável técnico (opcional)",
    laudoResponsiblePlaceholder: "Nome de quem assina a leitura",
  },
  similar: {
    title: "Materiais semelhantes",
    hint: "Escolha em que aspectos \u201Csemelhante\u201D quer dizer. A distância é medida só sobre essas propriedades.",
    basisLabel: "Comparar por",
    basisEmpty: "Escolha ao menos uma propriedade para comparar.",
    search: "Buscar semelhantes",
    loading: "Procurando semelhantes…",
    empty: "Nenhum material pôde ser comparado nesta base.",
    // A distância só é comparável dentro de uma resposta: a escala vem da
    // dispersão daquele conjunto. Dizê-lo evita que o número seja lido como
    // uma medida absoluta.
    distanceHint:
      "A distância é adimensional e só se compara dentro desta resposta: a escala vem da dispersão deste conjunto.",
    distance: "Distância",
    basisUsed: "Base usada",
    excludedTitle: "Fora desta comparação",
    excludedHint:
      "Sem valor para alguma propriedade da base. Não foram comparados pelo que têm — seria outra pergunta na mesma lista.",
    excludedMissing: "sem",
    degenerateTitle: "Não separaram ninguém",
    degenerateHint:
      "Todos os registros têm o mesmo valor: a propriedade não contribuiu para a distância.",
    linearTitle: "Medidas em escala linear",
    linearHint:
      "Pediam escala logarítmica, mas algum registro tem valor não positivo — e log não existe ali.",
  },

  solver: {
    title: "Dimensionar",
    subtitle:
      "Escolha o caso de carga, informe os números do projeto e veja quanto a peça pesaria — ou custaria — em cada material.",
    caseStep: "1. O caso de carga",
    caseLabel: "Caso",
    caseHint:
      "Função, restrição e objetivo. É essa combinação que determina o índice de desempenho.",
    facetFunction: "Função",
    facetConstraint: "Restrição",
    facetObjective: "Objetivo",
    // D-65: o objetivo deixou de ser propriedade do caso e virou escolha de quem
    // lê. A faceta diz os dois, senão afirmaria "minimizar massa" numa tela em
    // que o custo está a um seletor de distância.
    facetObjectiveOr: "ou",
    facetFree: "Variável livre",
    facetFixed: "Fixado pelo projeto",
    derivationTitle: "Como o índice sai daí",
    derivationHint:
      "A conta está escrita para poder ser refeita à mão. O índice não é escrito aqui: é lido do catálogo.",
    indexTitle: "Índice que este caso produz",
    // D-65: o mesmo caso responde a dois objetivos porque a troca de ρ por ρ·Cm
    // não mexe no fator estrutural. São duas leituras de uma derivação, e a tela
    // diz isso em vez de oferecer dois casos parecidos.
    costIndexTitle: "E se o objetivo for o custo",
    costIndexHint:
      "Trocando a densidade por densidade × custo por massa, a mesma derivação minimiza o custo de material da peça. A geometria não muda.",
    objectiveLabel: "Objetivo",
    objectiveMass: "Minimizar massa",
    objectiveCost: "Minimizar custo de material",
    objectiveHint:
      "O que a coluna do resultado vai medir. O fator estrutural é o mesmo número nos dois casos — só o índice muda.",
    inputsStep: "2. Os números do projeto",
    inputsHint:
      "Cada valor vai na unidade indicada. Todos precisam ser maiores que zero.",
    supportLabel: "Apoio e carregamento",
    solve: "Dimensionar",
    solving: "Dimensionando…",
    resultStep: "3. O resultado",
    resultEmpty: "Nenhum material pôde ser dimensionado com estes dados.",
    // Fator estrutural: só geometria e carga, igual para todo material do run.
    // Mostrá-lo é o que permite conferir uma massa à mão.
    structuralFactor: "Fator estrutural",
    structuralFactorHint:
      "Só geometria e carga — o mesmo número para todo material desta execução. Resposta = fator estrutural ÷ índice.",
    columnMaterial: "Material",
    columnIndex: "Índice",
    columnObjective: "Massa",
    columnObjectiveCost: "Custo de material",
    columnFree: "Seção necessária",
    // Uma coluna para os dois destinos seguintes do fluxo: o custo e a
    // auditoria ambiental, ambos alimentados pela massa que esta linha acabou
    // de calcular.
    columnNext: "Seguir para",
    excludedTitle: "Fora deste dimensionamento",
    excludedHint:
      "Sem valor para alguma propriedade que o caso exige. Não foram dimensionados por estimativa — ausência não vira zero.",
    unitNote:
      "A unidade de cada resposta é derivada das unidades canônicas, não declarada à mão.",
    // O aviso do custo não é o mesmo aviso: a dimensão sai como massa porque
    // custo por massa é adimensional. Quem lê merece a frase, não a dedução.
    indexRan: "Índice usado nesta execução",
  },

  cost: {
    title: "Custo da peça",
    subtitle:
      "Quanto custaria fazer esta peça em cada processo que a produz — e quanto disso o lote ainda pode tirar.",
    briefStep: "1. A peça e o lote",
    materialLabel: "Material",
    massLabel: "Massa da peça (kg)",
    massHint:
      "A massa acabada. O dimensionamento calcula esta massa para você.",
    batchLabel: "Peças no lote",
    batchHint: "É o lote que dilui o ferramental — e só ele.",
    assumptionsStep: "2. As premissas da oficina",
    assumptionsHint:
      "Não são fatos do processo: duas fábricas com a mesma prensa amortizam em horizontes diferentes e a mantêm ocupada frações diferentes do ano.",
    writeOffLabel: "Amortização (anos)",
    loadFactorLabel: "Fator de carga (0 a 1)",
    loadFactorHint:
      "Fração do tempo disponível em que o equipamento roda de fato.",
    estimate: "Estimar",
    estimating: "Estimando…",
    resultStep: "3. O custo, termo a termo",
    resultEmpty:
      "Nenhum processo compatível pôde ser precificado com estes dados.",
    columnProcess: "Processo",
    columnMaterial: "Material",
    columnTooling: "Ferramental",
    columnOverhead: "Operação",
    columnCapital: "Capital",
    columnTotal: "Total",
    // O leitor precisa saber que a soma é conferível e o que cada parcela faz.
    termsHint:
      "Material não se move com o lote — é o piso. Ferramental cai com 1/n. Operação e capital dependem da velocidade, não do lote.",
    uncostedTitle: "Sem estimativa",
    uncostedHint:
      "Faltou dado econômico. Não foram precificados por estimativa — ausência não vira zero, e um ferramental em branco faria o processo parecer o mais barato da lista.",
    fromSolver: "Estimar custo",
  },

  eco: {
    fromSolver: "Auditar",
    title: "Auditoria ambiental",
    subtitle:
      "Onde a energia e o CO₂ desta peça realmente vão — material, manufatura, transporte, uso e fim de vida.",
    briefStep: "1. A peça",
    materialLabel: "Material",
    processLabel: "Processo que faz a peça",
    processHint:
      "Auditar uma peça é auditar fazer a peça: é o processo que diz quanta energia a conformação gasta e quanto material foi preciso comprar.",
    massLabel: "Massa da peça (kg)",
    massHint:
      "A massa acabada. O dimensionamento calcula esta massa para você.",
    recycledLabel: "Teor reciclado (0 a 1)",
    recycledHint:
      "Fração do material comprado que vem de reciclagem. A 0, a figura de reciclagem nem é lida — o que o cálculo precisa depende do briefing.",
    transportStep: "2. O transporte",
    transportModeLabel: "Modal",
    transportDistanceLabel: "Distância (km)",
    transportHint:
      "A distância é fato da cadeia de suprimento, não do material: entra como número visível, nunca como constante escondida.",
    useStep: "3. O uso",
    useHint:
      "Os dois modelos não são variantes de um. No estático a massa da peça não entra em lugar nenhum — aliviar a peça não muda esta fase. No móvel ela é fator linear. Os campos do outro modelo são recusados, nunca ignorados.",
    useModelLabel: "Modelo de uso",
    useStatic: "Estático (consome porque funciona)",
    useMobile: "Móvel (consome porque é carregado)",
    powerLabel: "Potência em serviço (W)",
    dutyLabel: "Ciclo de trabalho (0 a 1)",
    dutyHint: "Fração do tempo em que a peça de fato consome.",
    lifeLabel: "Vida em serviço (anos)",
    travelLabel: "Distância percorrida na vida (km)",
    intensityLabel: "Intensidade de uso (MJ por kg por km)",
    carbonPerEnergyLabel: "Carbono por energia (kg CO₂/MJ)",
    carbonPerEnergyHint:
      "A rede elétrica para um produto estático, o combustível para um móvel. Sem ela a fase de uso tem energia e não tem carbono — o que é um estado, não um zero.",
    eolLabel: "Fim de vida",
    eolRecycle: "Reciclagem",
    eolLandfill: "Aterro",
    eolIncineration: "Incineração",
    eolHint:
      "Aterro e incineração não têm energia catalogada nesta versão, e não viram zero: enterrar uma peça pareceria a coisa mais barata a fazer com ela.",
    run: "Auditar",
    running: "Auditando…",
    resultStep: "4. As cinco fases",
    columnPhase: "Fase",
    columnEnergy: "Energia",
    columnCarbon: "Carbono",
    columnDetail: "Como foi calculada",
    totalLabel: "Total",
    // A resposta não é o total: é qual fase domina, porque é nela que esforço
    // de projeto muda alguma coisa.
    dominanceTitle: "Qual fase domina",
    dominanceEnergy: "Em energia",
    dominanceCarbon: "Em carbono",
    dominanceShare: "da soma",
    massBought: "Massa comprada",
    massBoughtHint:
      "Maior que a massa da peça pelo refugo do processo: a fundição fundiu o que não virou peça, e essa energia foi gasta do mesmo jeito.",
    noTotal:
      "Sem total: uma soma sobre quatro das cinco fases não é um total, é uma parcela que parece um.",
  },

  myRecords: {
    title: "Meus registros",
    subtitle:
      "O que você marcou, o que abriu por último e o que cadastrou para si.",
    favorites: "Favoritos",
    favoritesEmpty: "Nenhum registro favoritado ainda.",
    favoritesHint:
      "A estrela na ficha de um material ou processo traz o registro para cá.",
    recents: "Abertos recentemente",
    recentsEmpty: "Nenhum registro aberto ainda nesta conta.",
    recentsHint:
      "Os últimos 20 registros que você abriu, do mais recente ao mais antigo.",
    ownRecords: "Registros próprios",
    ownRecordsEmpty: "Você ainda não cadastrou nenhum registro próprio.",
    ownRecordsHint:
      "Um registro próprio é seu: entra nas suas seleções, mapas e documentos, e ninguém mais o enxerga.",
    ownBadge: "Registro próprio",
    // A afirmação que o documento também faz, e pelo mesmo motivo: o valor foi
    // cadastrado por quem o cadastrou, mas não passou pela revisão de fonte e
    // licença do catálogo compartilhado.
    ownNotice:
      "Registros próprios não passaram pela revisão de fonte e licença do catálogo compartilhado.",
    addFavorite: "Favoritar",
    removeFavorite: "Desfavoritar",
    favorited: "Favoritado",
    universeMaterial: "Material",
    universeProcess: "Processo",
  },

  catalog: {
    title: "Catálogo de materiais",
    subtitle: "O que existe cadastrado, e com que qualidade de dado.",
    searchPlaceholder: "Buscar por nome, classe ou palavra-chave…",
    searchHint:
      'Aceita operadores: aço AND inox · aço OR alumínio · aço NOT inox · "aço inox" para a frase exata · parênteses para agrupar · alum* e a?o como curingas.',
    searchLabel: "Buscar materiais",
    columnName: "Material",
    columnClass: "Classe",
    columnKeywords: "Palavras-chave",
    columnQuality: "Dados",
    empty: "Nenhum material encontrado.",
    emptyHint:
      "Ajuste a busca ou os filtros — ou cadastre o primeiro material.",
    emptyFiltered: "Nenhum material atende aos filtros escolhidos.",
    clearFilters: "Limpar filtros",
    loading: "Carregando materiais…",
    error: "Não foi possível carregar os materiais.",
    count: (n: number) => `${n} ${n === 1 ? "material" : "materiais"}`,
    showing: (shown: number, total: number) => `Mostrando ${shown} de ${total}`,
    filters: "Filtros",
    filterClass: "Classe",
    allClasses: "Todas",
    // P1-4: navegar não é filtrar. O seletor estreita a lista desta tela; um
    // cartão de família leva para a página daquela família.
    browseHint:
      "Abra uma família para ver o registro dela, as subclasses e os materiais.",
    filterQuality: "Qualidade do dado",
    // Not "sem lacunas": the catalogue only knows about properties that were
    // recorded, so it can say a material has no gap *among the ones cadastradas*
    // and nothing more.
    qualityAny: "Qualquer",
    qualityComplete: "Sem lacunas cadastradas",
    qualityWithGaps: "Com lacunas",
    qualityMeasured: "Tem valor medido",
    // The summary badge on a row/card. Absence is stated, never left blank.
    qualityBreakdown: "Composição dos dados",
    noValues: "Nenhuma propriedade cadastrada",
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
    // P0-2: os processos compatíveis na ficha do material. "Compatíveis" e não
    // "possíveis" porque é uma compatibilidade declarada no catálogo, não uma
    // conclusão da ferramenta.
    compatibleProcesses: "Processos compatíveis",
    compatibleProcessesHint:
      "Processos cadastrados como aplicáveis a este material, agrupados por família.",
    noProcesses: "Nenhum processo cadastrado para este material.",
    inactive: "Inativo",
    identification: "Identificação",
    keywords: "Palavras-chave",
    position: "Onde este material fica",
    positionHint:
      "Densidade × módulo de Young, os dois eixos do mapa demonstrativo. Este material aparece destacado.",
    openInMaps: "Ver no mapa completo",
    // The sheet is where §3.2 has to pay off: every number says where it came
    // from, and the legend explains the vocabulary once, no matter how many
    // properties the material has.
    provenanceHint:
      "Clique em um valor para ver a unidade original, a conversão aplicada e a fonte registrada.",
  },
  chart: {
    title: "Mapa de propriedades",
    scale: "Escala",
    linear: "Linear",
    log: "Logarítmica",
    excludedNote: (n: number) =>
      `${n} ${n === 1 ? "material foi omitido" : "materiais foram omitidos"} por não ter valor em ambos os eixos.`,
    logNote:
      "Escala logarítmica exige valores positivos; pontos ≤ 0 são omitidos.",
    empty: "Sem pontos suficientes para o gráfico.",
    // Shared by every figure in the application: the map, the comparator and
    // the thumbnail on the material sheet.
    toolbar: "Ações do gráfico",
    exportPng: "Exportar PNG",
    exportSvg: "Exportar SVG",
    exporting: "Exportando…",
    exportError: "Não foi possível exportar a imagem.",
    // A figura é uma tela de vetores: para quem usa leitor de tela ela é
    // silêncio. A alternativa textual de verdade é a tabela que a originou,
    // aberta a partir da própria figura.
    dataTable: "Tabela de dados da figura",
    dataTableHint: "Os mesmos números que a figura desenha, em texto.",
    figureLabel: (title: string) =>
      `${title}. Figura; a tabela de dados equivalente está logo abaixo.`,
    columnClass: "Classe",
    thisMaterial: "Este material",
  },
  map: {
    title: "Mapas de propriedades",
    subtitle:
      "Mapa de Ashby: dois eixos, envelopes por classe e linhas de índice com inclinação calculada no backend.",
    axisX: "Eixo X",
    axisY: "Eixo Y",
    axisTypeProperty: "Propriedade",
    axisTypeIndex: "Índice",
    axisIndexChoose: "Selecione um índice",
    axisIndexHint:
      "Um eixo em índice mostra um valor calculado — do catálogo ou uma expressão sua — em vez de uma propriedade cadastrada.",
    sameExpressionAxis: "Escolha duas expressões diferentes para os eixos.",
    indexAxisConflict:
      "A linha de índice sobreposta exige dois eixos de propriedade; ela some enquanto um eixo for um índice.",
    scale: "Escala",
    linear: "Linear",
    log: "Logarítmica",
    envelope: "Envelope",
    convexHull: "Fecho convexo",
    adjustedEllipse: "Nuvem da classe",
    classes: "Classes",
    allClasses: "Todas as classes",
    options: "Exibição",
    envelopes: "Envelopes por classe",
    intervals: "Intervalos e incertezas",
    labels: "Rótulos dos materiais",
    indexTitle: "Linha de índice",
    indexHint:
      "Em escala logarítmica, um índice do tipo M = X^a · Y^b vira uma reta. A inclinação é derivada da própria expressão.",
    indexNone: "Nenhum índice",
    indexCustom: "Expressão personalizada",
    expression: "Expressão",
    goal: "Objetivo",
    maximize: "Maximizar",
    minimize: "Minimizar",
    slope: "Inclinação (log-log)",
    vertical: "Reta vertical",
    dimension: "Dimensão",
    levelThrough: "Linha passando por",
    levelNone: "Nenhum material",
    levelValue: "Nível M (opcional)",
    levelAdd: "Traçar",
    levelsTitle: "Níveis traçados",
    superior: (n: number) =>
      `${n} ${n === 1 ? "material no lado favorável" : "materiais no lado favorável"}`,
    indexUnavailable: "Linha de índice indisponível",
    coverage: (plotted: number, considered: number) =>
      `${plotted} de ${considered} ${considered === 1 ? "material plotado" : "materiais plotados"}`,
    excludedTitle: "Materiais fora do mapa",
    excludedHint:
      "Nenhum material é descartado em silêncio; abaixo o motivo de cada omissão.",
    indexValue: "Índice",
    undefinedIndex: "índice indefinido",
    empty: "Nenhum material pôde ser plotado com estes eixos.",
    loading: "Calculando o mapa…",
    error: "Não foi possível montar o mapa.",
    compareSelected: "Comparar materiais do mapa",
    quality: "Qualidade",
    interval: "Faixa",
    uncertainty: "Incerteza",
    // The control panel, named group by group. Eleven controls in one row said
    // nothing about which of them change the question and which change only the
    // drawing.
    controls: "Controles do mapa",
    groupAxes: "Eixos e escala",
    groupClasses: "Classes exibidas",
    groupDisplay: "O que desenhar",
    groupIndex: "Linha de índice",
    sameAxis: "Escolha duas propriedades diferentes para os eixos.",
    notesTitle: "Observações sobre este mapa",
    levelsHint:
      "Cada nível traçado vira uma reta paralela; o lado favorável é contado abaixo.",
    figure: "Mapa de Ashby",
    share: "Compartilhar",
    shareTooltip: "Copia um link com os filtros atuais",
    save: "Salvar",
    saveTooltip: "Salva a configuração atual do mapa com um nome",
    savedCharts: "Meus mapas salvos",
    savedChartsEmptyState: "Nenhum mapa salvo ainda",
    chartName: "Nome do mapa",
    chartNamePlaceholder: "Ex: Ligas leves e rígidas",
    cancel: "Cancelar",
    ok: "OK",
  },
  dashboard: {
    title: "Painel do catálogo",
    subtitle:
      "Quanto do catálogo está preenchido, com que qualidade, e como cada propriedade se distribui entre as classes.",
    loading: "Carregando o painel…",
    error: "Não foi possível carregar o painel.",
    empty: "Nenhum material cadastrado ainda.",
    materials: "Materiais ativos",
    demoNote: (n: number) => `${n} de demonstração`,
    classes: "Classes",
    properties: "Propriedades",
    overallCoverage: "Cobertura geral",
    coverageOf: (filled: number, slots: number) =>
      `${filled} de ${slots} pares preenchidos`,
    coverageEmpty: "Sem pares material×propriedade para cobrir.",
    // A composição por qualidade.
    qualityMixTitle: "Composição por qualidade do dado",
    qualityMixHint: "Todo par material×propriedade do catálogo, num só lugar.",
    qualityMixFigure: "Composição por qualidade do dado",
    columnBucket: "Estado",
    columnCount: "Quantidade",
    columnShare: "Participação",
    // A cobertura por classe.
    classCoverageTitle: "Cobertura por classe",
    classCoverageHint:
      "Percentual de pares preenchidos, por classe de material.",
    classCoverageFigure: "Cobertura por classe",
    columnClass: "Classe",
    columnMaterials: "Materiais",
    columnCoverage: "Cobertura",
    filled: "Preenchido",
    declaredMissing: "Declarado ausente",
    notRecorded: "Não registrado",
    // As lacunas.
    gapsTitle: "Propriedades menos preenchidas",
    gapsHint:
      "As propriedades com menor cobertura no catálogo — por onde começar a preencher.",
    gapsEmpty: "Nenhuma propriedade cadastrada ainda.",
    // A distribuição por propriedade.
    distributionTitle: "Distribuição por propriedade",
    distributionSubtitle:
      "Mínimo, quartis, mediana e máximo de cada classe, calculados no backend (ADR 0004).",
    property: "Propriedade",
    scale: "Escala",
    linear: "Linear",
    log: "Logarítmica",
    logDisabled:
      "Esta propriedade admite valores não positivos; a escala log não se aplica.",
    distributionEmpty:
      "Nenhuma classe tem valores registrados para esta propriedade.",
    distributionFigure: (name: string) => `Distribuição — ${name}`,
    classesWithoutData: "Classes sem dados desta propriedade",
    columnCountBox: "Materiais",
    columnMin: "Mínimo",
    columnQ1: "Q1",
    columnMedian: "Mediana",
    columnQ3: "Q3",
    columnMax: "Máximo",
  },
  compare: {
    // P2: a referência é parâmetro da pergunta, nunca estado no servidor.
    reference: "Referência",
    setReference: "Definir como referência",
    clearReference: "Limpar referência",
    isReference: "Esta é a referência",
    differenceHeader: "Dif. %",
    // Cada ausência tem razão própria, e todas parecem célula em branco (D-24).
    difference: {
      sem_referencia: "Sem referência escolhida",
      referencia: "Referência",
      valor_ausente: "Este material não tem o valor",
      referencia_ausente: "A referência não tem o valor",
      referencia_zero: "A referência vale zero: não há razão",
      escala_sem_zero:
        "Escala sem zero verdadeiro: percentual não significa nada",
    },
    title: "Comparador de materiais",
    subtitle:
      "Tabela, barras, radar, coordenadas paralelas e heatmap sobre valores normalizados no backend.",
    materials: "Materiais",
    properties: "Propriedades",
    pickMaterials: "Selecione de 1 a 12 materiais.",
    pickProperties: "Selecione de 1 a 12 propriedades.",
    normalization: "Normalização",
    normMinmax: "Min-máx",
    normVector: "Vetorial",
    viewTable: "Tabela",
    viewBars: "Barras",
    viewRadar: "Radar",
    viewParallel: "Coordenadas paralelas",
    viewHeatmap: "Heatmap",
    columnMaterial: "Material",
    normalizedScale:
      "Escala normalizada (0 a 1; 1 = melhor entre os comparados)",
    neutralScale: "posição relativa, sem direção preferida",
    missing: "ausente",
    incomplete: "dados incompletos",
    clear: "Limpar seleção",
    search: "Filtrar materiais…",
    empty: "Escolha ao menos um material e uma propriedade.",
    loading: "Comparando…",
    error: "Não foi possível montar a comparação.",
    notesTitle: "Observações sobre os dados",
    original: "Valor original",
    canonical: "Valor normalizado (unidade canônica)",
    radarNeedsThree: "O radar precisa de ao menos três propriedades.",
    radarSkipsMissing:
      "Materiais sem valor em alguma propriedade não são traçados no radar; veja a tabela.",
    controls: "O que comparar",
    groupMaterials: "Materiais",
    groupProperties: "Propriedades",
    groupView: "Como ver",
    selectedCount: (chosen: number, max: number) => `${chosen} de ${max}`,
    limitReached: "Limite atingido. Desmarque um item para escolher outro.",
    noMaterialsFound: "Nenhum material corresponde ao filtro.",
    figure: "Comparação de materiais",
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
    // Not a value of the backend's DataQuality enum: absence is the *lack* of a
    // value, not a fourth kind of one. It is named here because the interface
    // has to show it, and showing it as an empty cell is what the project's
    // third principle forbids.
    AUSENTE: "Ausente",
    // A quinta coisa que o painel precisa nomear e o resto da interface não:
    // nenhuma linha existe para este par material×propriedade. Diferente de
    // AUSENTE, que é uma declaração — alguém procurou e não achou.
    NAO_REGISTRADO: "Não registrado",
  },
  qualityHint: {
    MEDIDO: "Medido diretamente, com a condição de ensaio registrada.",
    IMPORTADO: "Veio de um conjunto de dados externo, com a fonte registrada.",
    ESTIMADO: "Inferido, não medido. Confira antes de decidir com base nele.",
    AUSENTE: "Nenhum valor cadastrado. O sistema não preenche a lacuna.",
    NAO_REGISTRADO: "Nenhum registro para este par — ninguém preencheu ainda.",
  },

  ui: {
    loading: "Carregando…",
    errorTitle: "Algo não funcionou",
    retry: "Tentar novamente",
    close: "Fechar",
    details: "Detalhes",
    skipToContent: "Pular para o conteúdo",
    openMenu: "Abrir menu",
    closeMenu: "Fechar menu",
    mainNav: "Navegação principal",
    collapseSidebar: "Recolher a barra lateral",
    expandSidebar: "Expandir a barra lateral",
    steps: "Etapas",
    views: "Visualizações",
    stepDone: "concluída",
    stepBlocked: "bloqueada",
    theme: {
      label: "Tema",
      light: "Claro",
      dark: "Escuro",
      system: "Sistema",
    },
  },

  // P1-4: a ficha do processo e o registro de família.
  processes: {
    title: "Processos de fabricação",
    subtitle:
      "O segundo universo do método: o que conforma, une e trata um material. Navegue por família ou abra a ficha de um processo.",
    loading: "Carregando processos…",
    error: "Não foi possível carregar os processos.",
    empty: "Nenhum processo cadastrado.",
    familiesTitle: "Famílias",
    countProcesses: (n: number) => (n === 1 ? "1 processo" : `${n} processos`),
    countDirect: (n: number) =>
      n === 1 ? "1 processo aqui" : `${n} processos aqui`,
    countBelow: (n: number) => `${n} no total, contando as subfamílias`,
    // Ausência escrita (D-24): pasta vazia é um estado, e não um card em branco.
    emptyFolder: "Nenhum processo cadastrado diretamente nesta família.",
    emptyFolderWithChildren:
      "Nenhum processo diretamente aqui — o que esta família guarda está nas subfamílias abaixo.",
    subfamilies: "Subfamílias",
    attributes: "Atributos",
    attributesHint:
      "Cada valor traz o trilho de proveniência inteiro: o que foi informado, em que unidade, como foi convertido e de onde veio.",
    noAttributes: "Nenhum atributo cadastrado para este processo.",
    materialsServed: (n: number) =>
      n === 1
        ? "Serve 1 material do catálogo"
        : `Serve ${n} materiais do catálogo`,
    noMaterialsServed: "Nenhum material do catálogo vinculado a este processo.",
    family: "Família",
    notFound: "Processo não encontrado.",
    familyNotFound: "Família de processo não encontrada.",
    backToProcesses: "Todos os processos",
    // O tipo do valor é o que diz por qual regra ele é comparado (D-59).
    kind: "Tipo de valor",
    kindESCALAR: "Escalar",
    kindENVELOPE: "Envelope de capacidade",
    kindDISCRETO: "Discreto",
    kindEnvelopeHint:
      "Comparado por alcance: a faixa atende um limiar quando o alcança, e não pelo ponto médio.",
    kindDiscretoHint:
      "Pertinência a um vocabulário fechado, sem unidade e sem ordem.",
  },

  // P1-4: o registro de família, nos dois universos.
  family: {
    applications: "Onde se usa",
    characteristics: "O que caracteriza",
    // A prosa ausente é o quarto estado do dado, e tem rótulo escrito.
    unwritten: "Ninguém escreveu este texto ainda.",
    inThisFamily: "Nesta família",
    subclasses: "Subclasses",
    countMaterials: (n: number) => (n === 1 ? "1 material" : `${n} materiais`),
    countDirect: (n: number) =>
      n === 1 ? "1 material aqui" : `${n} materiais aqui`,
    countBelow: (n: number) => `${n} no total, contando as subclasses`,
    emptyFolder: "Nenhum material cadastrado diretamente nesta classe.",
    emptyFolderWithChildren:
      "Nenhum material diretamente aqui — o que esta classe guarda está nas subclasses abaixo.",
    notFound: "Classe não encontrada.",
    allClasses: "Todo o catálogo",
  },

  provenance: {
    title: "De onde vem este valor",
    trigger: "Ver a proveniência deste valor",
    legendTitle: "Como ler a qualidade do dado",
    original: "Valor original",
    normalized: "Valor normalizado",
    conversion: "Conversão",
    uncertainty: "Incerteza",
    range: "Faixa",
    typical: "Típico",
    condition: "Condição de medição",
    source: "Fonte",
    notes: "Observações",
    unknown: "não informado",
    missingTitle: "Sem valor cadastrado",
    missingBody:
      "Nenhum valor foi medido, importado ou estimado para esta propriedade neste material. O sistema não supõe um.",
  },

  // Canonical text lives in apps/api/app/exporters/report.py (LIMITATION_NOTICE).
  // The copy below is kept byte-identical by a test — see lib/i18n.test.ts. The
  // proposal (§3.6) requires this notice in the system *and* in every export;
  // two surfaces saying it differently would be worse than one saying it once.
  limitation: {
    title: "Limite de uso desta ferramenta",
    full:
      "Esta ferramenta destina-se a apoio didático e à triagem preliminar de candidatos. " +
      "Não substitui validação experimental, análise estrutural detalhada nem julgamento de engenharia.",
    short:
      "Apoio didático e triagem preliminar — não substitui validação experimental.",
  },

  indexCard: {
    title: "Índice de desempenho",
    validity: "Condições de validade",
    assumptionFuncao: "Função",
    assumptionGeometria: "Geometria",
    assumptionObjetivo: "Objetivo",
    assumptionRestricao: "Restrição",
    assumptionReferencia: "Referência",
    expression: "Expressão",
    dimension: "Dimensão do resultado",
    goal: "Objetivo",
    maximize: "Maximizar",
    minimize: "Minimizar",
    slope: "Inclinação (log-log)",
    slopeVertical: "Reta vertical",
    slopeUnavailable: "Sem reta de índice nestes eixos",
    noAssumptions: "Este índice não declara hipóteses.",
    noAssumptionsHint:
      "Sem função, geometria, objetivo e restrição declarados não é possível verificar se ele se aplica ao seu problema. Ele continua calculável; a responsabilidade pela aplicação é sua.",
    warning:
      "Um índice só vale nas condições em que foi derivado. Confira função, geometria e restrição antes de usá-lo.",
    selectLabel: "Escolha o índice de desempenho",
    selected: "Selecionado",
    select: "Selecionar",
    none: "Nenhum índice",
    noneHint: "O ranking usará apenas os critérios de propriedade.",
    custom: "Expressão personalizada",
    customHint: "Você declara a expressão e as hipóteses.",
  },

  home: {
    lead: "Da função do componente ao relatório de seleção, com cada etapa do raciocínio à vista.",
    lead2:
      "Nenhuma propriedade é inventada: todo número na tela veio de um valor cadastrado ou de " +
      "um cálculo determinístico, e a origem de cada um está a um gesto de distância.",
    methodTitle: "O método, em quatro passos",
    methodHint:
      "É o percurso de Ashby: descreva a função, elimine com restrições, ordene por um objetivo e leia o resultado com a proveniência de cada número.",
    step1: "Função",
    step1Hint: "O que o componente faz e o que se quer otimizar.",
    step2: "Restrições",
    step2Hint: "Cada uma elimina candidatos, e o funil mostra quantos.",
    step3: "Objetivo",
    step3Hint: "Um índice de mérito e os critérios de ranking.",
    step4: "Resultados",
    step4Hint: "Ranking, contribuições, excluídos e sensibilidade.",
    start: "Começar um estudo",
    browse: "Explorar o catálogo",
    savedTitle: "Retomar um estudo",
    savedHint:
      "Estudos salvos ficam disponíveis para reabrir e executar de novo.",
    savedEmpty: "Nenhum estudo salvo ainda.",
    savedEmptyHint:
      "O primeiro sai da tela de seleção, no botão “Salvar estudo”.",
    savedError: "Não foi possível carregar os estudos salvos.",
    resume: "Retomar",
    // Counted nouns, both forms. Lowercasing another label to reuse it breaks
    // the moment a label starts with an acronym.
    constraintOne: "restrição",
    constraintMany: "restrições",
    criterionOne: "critério",
    criterionMany: "critérios",
    exploreTitle: "Ou explore os dados",
    catalogHint: "Materiais, propriedades e a proveniência de cada valor.",
    mapsHint: "Mapa de Ashby com envelopes por classe e linhas de índice.",
    compareHint: "Tabela, barras, radar e heatmap sobre valores normalizados.",
    importHint: "Traga uma planilha CSV ou XLSX com validação linha a linha.",
  },

  auth: {
    loginTitle: "Entrar",
    loginSubtitle: "Entre com sua conta Google para usar o MaterialSelect AI.",
    loginButton: "Entrar com Google",
    loginHint:
      "Usamos apenas seu nome, e-mail e foto do Google para identificar sua sessão.",
    checkingSession: "Verificando sessão…",
    checkingSubscription: "Verificando assinatura…",
    logout: "Sair",
    loggingOut: "Saindo…",
  },

  billing: {
    title: "Assinatura",
    inactiveSubtitle: "Assine para continuar usando o MaterialSelect AI.",
    activeSubtitle: "Sua assinatura está ativa.",
    subscribeButton: "Assinar",
    manageButton: "Gerenciar assinatura",
    redirecting: "Redirecionando…",
    // Fallback for a failure with no `detail` from the backend (network error,
    // response we couldn't parse). The likelier case — Stripe not configured —
    // arrives as an ApiError with its own PT-BR message and is shown as-is.
    checkoutError: "Não foi possível iniciar a assinatura.",
    portalError: "Não foi possível abrir o gerenciamento da assinatura.",
  },

  styleGuide: {
    title: "Sistema de design",
    subtitle:
      "Vitrine viva dos tokens e das primitivas. Serve de referência para quem continuar o trabalho e de fonte das figuras da monografia.",
    tokens: "Tokens de cor",
    shape: "Forma e movimento",
    surfaces: "Superfícies, bordas e tinta",
    semantics: "Estados semânticos",
    qualityScale: "Qualidade do dado",
    classPalette: "Paleta categórica de classes",
    classPaletteHint:
      "Okabe–Ito: cada par permanece distinguível sob deuteranopia e protanopia. Em impressão monocromática quem separa as classes é a forma do marcador e o rótulo escrito — nunca a cor sozinha.",
    typography: "Tipografia",
    buttons: "Botões",
    forms: "Formulários",
    feedback: "Carregando, vazio e erro",
    tables: "Tabelas",
    overlays: "Sobreposições",
  },
} as const;

export type Dictionary = typeof ptBR;
