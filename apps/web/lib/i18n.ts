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
    battery: "Baterias",
    synthesis: "Sintetizar",
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
    slug: "Slug",
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
    dropTitle: "Arraste o arquivo para cá ou clique para escolher",
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
      "Função → Objetivo → Restrições → Resultados (determinístico, sem IA)",
    // The stepper numbers the steps itself; a "1." in the label would print twice.
    stepFunction: "Função",
    stepConstraints: "Restrições",
    stepObjective: "Objetivo",
    stepResults: "Resultados",
    // Why a step cannot be opened yet. Shown at the moment someone tries.
    blockedResults: "Execute a seleção para ver os resultados.",
    back: "Voltar",
    advance: "Avançar",
    // D-85: navegação lida da ordem dos passos, e o resumo embaixo de cada um.
    backToHome: "Voltar ao início",
    advancedConstraintsHint:
      "Para estudos com mais de uma etapa: estágios por classe, por processo ou por região de um gráfico, e grupos E/OU entre restrições.",
    methodInUse: (label: string) => `Método de ranking: ${label} (em Opções avançadas).`,
    methodFieldHint: "Como os critérios viram uma nota única. Na dúvida, soma ponderada.",
    normalizationHint: "Como cada critério é posto na mesma escala antes de somar.",
    indexBlockTitle: "1. Índice de desempenho",
    criteriaBlockTitle: "2. Critérios e pesos",
    continueToCriteria: "Continuar: critérios e pesos",
    indexLockedReason: "Escolha um índice (ou “Nenhum índice”) e clique em Continuar.",
    noIndexChosen: "Sem índice: o ranking usa só os critérios abaixo.",
    indexChosen: (name: string, maximize: boolean) =>
      `${name} — ${maximize ? "maximizar" : "minimizar"}`,
    criterionHint: "O que entra na nota final. O índice acima também pode ser um critério.",
    directionHint: "Maior é melhor, ou menor é melhor.",
    weightHint: "Quanto este critério pesa na nota.",
    exampleIntro: "Primeira vez? Veja um estudo completo funcionando e depois mude o que quiser.",
    loadExample: "Carregar exemplo: viga leve de bicicleta",
    exampleLoaded:
      "Exemplo carregado: função, índice, critério e três restrições. Avance pelos passos ou execute.",
    exampleUndo: "Desfazer",
    exampleUnavailable: (missing: string) =>
      `O exemplo não pôde ser carregado: o catálogo não tem ${missing}. Nada foi alterado.`,
    aiOpen: "Preencher a partir de um texto (IA)",
    aiClose: "Fechar o assistente de IA",
    // Uma linha por campo (D-85): o que ele pede, sem virar parágrafo.
    studyNameHint: "Só para você achar o estudo depois. Ex.: Viga de bicicleta.",
    functionTextHint: "O que a peça faz. Ex.: viga em flexão.",
    objectiveTextHint: "O que você quer otimizar. Ex.: mínima massa.",
    freeVariablesHint: "O que o projeto deixa variar, separado por vírgula. Ex.: espessura.",
    myStudies: (n: number) =>
      n === 0 ? "Meus estudos (nenhum salvo)" : n === 1 ? "Meus estudos (1)" : `Meus estudos (${n})`,
    nextStep: (label: string) => `Próximo: ${label}`,
    // D-91: what a phone shows; the full label stays the accessible name.
    nextShort: "Próximo",
    summaryObjective: (index: string | null, criteria: number) =>
      [
        index ? `Índice: ${index}` : null,
        criteria > 0 ? (criteria === 1 ? "1 critério" : `${criteria} critérios`) : null,
      ]
        .filter(Boolean)
        .join(" · "),
    summaryConstraints: (constraints: number, stages: number) =>
      [
        constraints === 1 ? "1 restrição" : `${constraints} restrições`,
        stages > 1 ? `${stages} estágios` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    summaryResults: (n: number) => (n === 1 ? "1 candidato" : `${n} candidatos`),
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
      "O que a seleção devolve. Trocar reinicia os estágios, os critérios e o índice: cada universo tem os seus, e o do outro seria recusado.",
    universeMaterial: "Materiais",
    universeProcess: "Processos",
    // D-84: desde o P0-4 (D-59) processo tem atributo e ranqueia. O que fica de
    // fora é o atributo discreto, que é rótulo e não tem ordem.
    universeProcessNote:
      "Um estudo de processos ranqueia por atributos numéricos (valor ou faixa de capacidade). Atributos discretos são rótulos sem ordem e não entram como critério nem em índice.",
    processIndexNote:
      "Os índices prontos do catálogo são escritos sobre propriedades de material e não se aplicam a processos. Para ranquear por um índice, escreva uma expressão com os atributos numéricos.",
    expressionCheckedOnRun:
      "A expressão é conferida quando você executa a seleção.",
    stagesTitle: "Estágios da seleção",
    stagesHint:
      "Os estágios se aplicam em ordem, e o resultado é a interseção dos habilitados. Desligar um estágio mostra o efeito dele sem apagar o que você escreveu.",
    stageKindLimit: "Limites",
    stageKindTree: "Classes",
    // P0-2: o terceiro tipo. "Processos" e não "Fabricação" porque é o registro
    // que se escolhe, e é como o resto da interface e o relatório o chamam.
    stageKindProcess: "Processos",
    // P0-3: o estágio de travessia num estudo de processos.
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
    stageChartClearBox: "Limpar caixa",
    stageChartShowMap: "Ver gráfico interativo",
    stageChartHideMap: "Ocultar gráfico interativo",
    stageChartInteractiveHint:
      "Arraste sobre o gráfico para delimitar a região, ou ajuste os campos numéricos de mínimo e máximo.",
    stageChartProcessNoMap:
      "Nenhum mapa é desenhado para o universo de processos: os planos de processo são filtrados numericamente e por expressões.",
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
    // D-85: a linha lida como frase, e uma dica por campo na primeira linha.
    operatorSymbols: { gte: "≥", gt: ">", lte: "≤", lt: "<" },
    sentenceLead: "Lê-se:",
    sentenceRange: (name: string, inside: boolean, min: string, max: string) =>
      `${name} ${inside ? "entre" : "fora de"} ${min} e ${max}`,
    sentenceClasses: (inside: boolean, names: string) =>
      `${inside ? "Classe é uma de" : "Classe não é nenhuma de"}: ${names}`,
    sentenceLabels: (name: string, any: boolean, labels: string) =>
      `${name} ${any ? "tem algum de" : "não tem nenhum de"}: ${labels}`,
    sentenceText: (text: string) => `O texto contém “${text}”`,
    propertyHint: "Digite parte do nome para buscar.",
    operatorHint: "Como comparar com o valor.",
    valueHint: "Use vírgula ou ponto. Ex.: 70 ou 2,7.",
    unitHint: "A unidade do valor que você digitou.",
    unitCanonical: (unit: string) => `${unit} (padrão)`,
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
    // D-91: the phone's one-line action bar.
    remainingShort: "Restam",
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
      "Média ponderada dos critérios. Os pesos somam 1: a tabela abaixo mostra quanto cada um vale na nota.",
    // D-87: o orçamento de pesos, calculado no backend enquanto se digita.
    weights: {
      title: "Pesos dos critérios",
      tableLabel: "Distribuição dos pesos na média ponderada",
      limit: "Limite: 1",
      columnCriterion: "Critério",
      columnWeight: "Peso",
      columnShare: "Participação",
      noCriterion: "Sem critério",
      noWeight: "sem peso",
      noShare: "sem participação",
      totalComplete: (total: string) => `Total ${total} de 1 — fechado.`,
      totalMissing: (total: string, missing: string) =>
        `Total ${total} de 1 — faltam ${missing}.`,
      totalWithBlanks: (total: string) =>
        `Total ${total} de 1 — mas há critério sem peso.`,
      totalExceeds: (total: string, excess: string) =>
        `Total ${total} de 1 — passa do limite em ${excess}.`,
      checking: "Conferindo a soma dos pesos…",
      unavailable:
        "Não foi possível conferir a soma agora. Executar continua liberado: o ranking usa os pesos renormalizados.",
      invalidNumber: "Use um número, como 0,25.",
      issues: {
        missing_key: "Escolha o critério desta linha.",
        missing_weight: "Dê um peso a este critério.",
        zero: "Peso zero tira o critério da nota: remova a linha ou dê um peso.",
        negative: "O peso não pode ser negativo.",
        duplicate_key: "Critério repetido: some os pesos numa linha só.",
        unknown_key: "Este critério não pode ser ranqueado neste estudo.",
        index_missing: "Não há índice escolhido: defina um índice ou troque o critério.",
      },
      suggest: {
        fill_blanks: "Preencher os pesos vazios com o restante",
        spread_remaining: "Distribuir o restante igualmente",
        split_equally: "Dividir igualmente",
        scale_to_limit: "Ajustar ao limite, mantendo a proporção",
      },
      suggestionValues: (values: string) => `Fica: ${values}`,
      undo: "Desfazer",
      applied: "Pesos ajustados.",
      previewTitle: "Prévia do ranking — top 5",
      previewScore: "Nota",
      previewWholeCatalogue: (n: number) =>
        `Sem restrições ainda, a prévia ordena o catálogo inteiro (${n}). As restrições vão reduzir a lista, e as notas podem mudar, porque a normalização é feita sobre quem sobra.`,
      previewConstrained: (candidates: number, initial: number) =>
        `Ordenando os ${candidates} de ${initial} que passam pelas restrições atuais.`,
      previewRenormalized:
        "Os pesos ainda não fecham 1: a prévia usa os pesos renormalizados, como o ranking faria.",
      blockedRun: "Os pesos precisam fechar 1 antes de executar.",
      notBlocking: (reason: string) =>
        `${reason} Você pode seguir; o Executar só libera quando a soma fechar 1.`,
      fixWeights: "Corrigir pesos",
    },
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
    // D-85: o resultado resumido primeiro, o resto em abas.
    resultsTabs: "Seções do resultado",
    tabSummary: "Resumo",
    tabRanking: "Ranking",
    tabExcluded: "Eliminados",
    tabSensitivity: "Sensibilidade",
    tabProvenance: "Origem dos dados",
    top5Title: "Os 5 primeiros",
    winnerEyebrow: "Resultado",
    winnerTitle: (name: string) => `Vencedor: ${name}`,
    winnerTie: (names: string) => `Empate no 1º lugar: ${names}`,
    winnerWeighted: (score: string) => `Maior nota ponderada: ${score} (de 0 a 1).`,
    winnerTopsis: (score: string) => `Mais próximo do ideal pelo TOPSIS: ${score} (de 0 a 1).`,
    winnerPromethee: (score: string) => `Maior fluxo líquido pelo PROMETHEE II: ${score}.`,
    winnerHeaviest: "O que mais pesou na nota:",
    winnerIndexValue: (index: string, value: string) => `${index}: ${value}.`,
    winnerByIndex: (index: string, value: string, maximize: boolean) =>
      `${maximize ? "Maior" : "Menor"} valor de ${index}: ${value}.`,
    winnerPassed: (initial: number, final: number) =>
      `Passou em todas as restrições: de ${initial} ${initial === 1 ? "registro" : "registros"}, ${final === 1 ? "sobrou 1" : `sobraram ${final}`}.`,
    winnerNoneTitle: "Nenhum vencedor declarado",
    winnerNone: {
      no_candidates: "Nenhum candidato passou nas restrições. Veja na aba Eliminados o que cortou cada um.",
      no_objective:
        "Sem índice nem critério de ranking, a seleção só filtrou: os candidatos estão na aba Ranking, sem ordem.",
      no_defined_index:
        "O índice não pôde ser calculado para nenhum candidato (falta dado). A aba Ranking mostra o motivo de cada um.",
    },
    funnelLine: (initial: number, final: number) =>
      `Funil: ${initial} → ${final}. Detalhes na aba Eliminados.`,
    sensitivityNone:
      "Sem análise de sensibilidade: ela só existe quando há critérios de ranking com peso.",
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
    docx: "DOCX",
    html: "HTML para impressão",
    htmlTitle: "Abre em nova aba, pronto para imprimir ou salvar como PDF",
    htmlHint: "Abre em nova aba, para imprimir ou salvar em PDF",
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
    hint: "Escolha em que aspectos “semelhante” quer dizer. A distância é medida só sobre essas propriedades.",
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
    // lê. A faceta diz os dois, senão afirmaria \"minimizar massa\" numa tela em
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
    resultIdleTitle: "Nada dimensionado ainda",
    resultIdleHint:
      "Preencha os números do projeto e clique em Dimensionar: cada material aparece aqui com a massa (ou o custo) e a seção necessária.",
    blockedVariable: (label: string) => `Informe ${label}, maior que zero.`,
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
    // D-86: recolhidas, mas com cada valor à vista no resumo (D-65).
    assumptionsSummary: (writeOff: string, loadFactor: string) =>
      `Amortização em ${writeOff} anos · fator de carga ${loadFactor}`,
    materialHint: "Digite parte do nome do material.",
    blocked: {
      material: "Escolha um material no passo 1.",
      mass: "Informe a massa da peça, maior que zero.",
      batch: "Informe o lote: pelo menos 1 peça.",
      writeOff: "A amortização precisa ser maior que zero (premissas).",
      loadFactor: "O fator de carga vai de 0 a 1, sem incluir o zero (premissas).",
    },
    estimate: "Estimar",
    estimating: "Estimando…",
    resultStep: "3. O custo, termo a termo",
    resultEmpty:
      "Nenhum processo compatível pôde ser precificado com estes dados.",
    resultIdleTitle: "Nada estimado ainda",
    resultIdleHint:
      "Informe a massa da peça e o lote e peça a estimativa: cada processo compatível aparece aqui com o custo decomposto em material, ferramental, operação e capital.",
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
    noProcess:
      "Nenhum processo cadastrado faz este material, e sem processo não há auditoria: é o processo que diz quanta energia a conformação gasta e quanto material foi preciso comprar.",
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
    // D-86: os números do uso ficam recolhidos, com cada valor no resumo.
    materialHint: "Digite parte do nome do material.",
    useSummaryStatic: (life: string, power: string, duty: string, carbon: string) =>
      `Premissas: ${life} anos · ${power} W · ciclo ${duty} · ${carbon} kg CO₂/MJ`,
    useSummaryMobile: (life: string, travel: string, intensity: string, carbon: string) =>
      `Premissas: ${life} anos · ${travel} km · ${intensity} MJ/(kg·km) · ${carbon} kg CO₂/MJ`,
    blocked: {
      process: "Este material não tem processo cadastrado: escolha outro material no passo 1.",
      mode: "Escolha o modal de transporte no passo 2.",
      mass: "Informe a massa da peça, maior que zero.",
      recycled: "O teor reciclado vai de 0 a 1.",
      duty: "O ciclo de trabalho vai de 0 a 1, sem incluir o zero (premissas).",
      positive: (label: string) => `${label}: informe um valor maior que zero.`,
    },
    run: "Auditar",
    running: "Auditando…",
    resultStep: "4. As cinco fases",
    resultIdleTitle: "Nada auditado ainda",
    resultIdleHint:
      "Preencha a peça, o transporte e o uso e peça a auditoria: as cinco fases aparecem aqui, com a fase que domina a energia e a que domina o carbono.",
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

  // D-70: a unidade em que o leitor lê.
  units: {
    readIn: "Ler em:",
    readingNote:
      "Os valores estão na unidade em que cada grandeza se lê. O que a fonte registrou, e a unidade canônica em que o valor é guardado, continuam na proveniência de cada número.",
    canonicalNote: "Unidade canônica:",
  },
  battery: {
    title: "Dimensionar bateria",
    subtitle:
      "Dimensionamento determinístico de packs (Ns × Np) e seleção comparativa de químicas eletroquímicas.",
    tabDesign: "Dimensionamento de Pack",
    tabCompare: "Trade-offs de Químicas",
    archetypesTitle: "Arquétipo de aplicação",
    archetypesHint:
      "Escolha uma aplicação de referência ou configure livremente os requisitos elétricos e mecânicos.",
    customOption: "Personalizado",
    requirementsTitle: "Requisitos de projeto",
    targetVoltage: "Tensão nominal do barramento",
    targetEnergy: "Energia útil requerida",
    targetPower: "Potência de pico requerida",
    dod: "Profundidade de descarga (DoD)",
    cellCapacity: "Capacidade unitária da célula",
    packingFactors: "Fatores de empacotamento",
    massPackingFactor: "Fator mássico (células / pack)",
    volumePackingFactor: "Fator volumétrico (células / pack)",
    costPackingFactor: "Fator de custo das células",
    chemistryTitle: "Química eletroquímica",
    cellSpecs: "Ficha da célula",
    citationLabel: "Citação desta química",
    citationMissing: "Sem citação registrada para esta linha do catálogo.",
    sourceLabel: "Fonte do conjunto (licença registrada)",
    sourceMissing: "Sem fonte registrada.",
    packArchitecture: "Arquitetura elétrica do pack",
    seriesLabel: "Células em série (Ns)",
    parallelLabel: "Ramos em paralelo (Np)",
    totalCellsLabel: "Total de células",
    packVoltageLabel: "Tensão nominal",
    packCapacityLabel: "Capacidade total",
    usableEnergyLabel: "Energia útil",
    grossEnergyLabel: "Energia bruta",
    massBreakdown: "Balanço de massa do pack",
    volumeBreakdown: "Volume e densidade energética",
    cellsMass: "Massa das células",
    overheadMass: "Estrutura, BMS e condutores",
    totalPackMass: "Massa total estimada",
    specificEnergy: "Energia específica do pack",
    energyDensity: "Densidade energética do pack",
    peakPower: "Potência de pico",
    cRate: "Taxa de descarga de pico",
    costBreakdown: "Estimativa de investimento",
    cellCost: "Células",
    overheadCost: "Integração / BMS / Fiação",
    totalCost: "Custo total do pack",
    levelizedCost: "Custo nivelado por ciclo de energia",
    thermalTitle: "Diretrizes térmicas e segurança",
    thermalRunaway: "Início de fuga térmica",
    operatingRange: "Faixa de temperatura de operação",
    summaryTitle: "Análise técnica comparativa",
    podiumTitle: "Destaques de dominância eletroquímica",
    podiumHint:
      "Cada faceta tem o seu vencedor, e eles não coincidem: o menor custo inicial e o menor custo por ciclo são perguntas diferentes, e é a discordância entre elas que decide.",
    podiumMissing: "Sem vencedor para esta faceta nos resultados recebidos.",
    comparisonTableTitle: "Comparativo das químicas para os requisitos",
    // Dinheiro não está em sistema de unidades nenhum (D-65): a moeda é dita
    // em palavras, nunca inferida de um símbolo. O catálogo cota em dólares
    // porque é a moeda da literatura de custo de célula, e a frase diz isso —
    // e diz também que o número não é orçamento.
    currencyNote:
      "Os custos saem do catálogo em dólares dos Estados Unidos (US$), a moeda em que a literatura de custo de célula cota. São ordens de grandeza de comparação entre químicas, não orçamento.",
    lightestBadge: "Mais leve",
    compactBadge: "Mais compacto",
    cheapestBadge: "Menor custo inicial",
    durableBadge: "Maior ciclo de vida",
    levelizedBadge: "Menor custo por ciclo",
    safestBadge: "Mais seguro",
    tableColChem: "Química",
    tableColNsNp: "Ns × Np",
    tableColMass: "Massa do Pack",
    tableColVol: "Volume",
    tableColCost: "Custo Estimado",
    tableColLife: "Ciclos (80% DoD)",
    tableColLevelized: "US$/kWh·ciclo",
    tableColSafety: "Segurança Térmica",
    empty: "O pack aparece aqui assim que os requisitos estiverem completos.",
    loading: "Carregando catálogo eletroquímico…",
    error: "Erro ao processar dimensionamento do pack.",
    // Rótulo térmico ordinal, nunca número (D-69): a tela só traduz.
    safety: {
      BAIXA: "Baixa",
      MODERADA: "Moderada",
      MEDIA: "Média",
      ALTA: "Alta",
      MUITO_ALTA: "Muito alta",
    },
    dodHint: "Fração recomendada: 0,8 a 0,9.",
    cellCapacityHint: "Vazio: formato comercial típico para a escala de energia.",
    massPackingHint: "Massa das células ÷ massa do pack.",
    volumePackingHint: "Volume das células ÷ volume do pack.",
    costPackingHint: "Custo das células ÷ custo do pack.",
    cellVoltage: "Tensão nominal da célula",
    cellSpecificEnergy: "Energia específica da célula",
    cellEnergyDensity: "Densidade energética da célula",
    cellCostPerKwh: "Custo por kWh de célula",
    cellsVolume: "Volume das células",
    volumeOverhead: "Sobrecarga volumétrica",
    totalPackVolume: "Volume total do pack",
    selectedBadge: "Selecionada",
    podiumDetail: {
      mass: (value: string) => `Massa: ${value} kg`,
      volume: (value: string) => `Volume: ${value} L`,
      upfront: (value: string) => `Custo inicial: US$ ${value}`,
      life: (value: string) => `Vida útil: ${value} ciclos`,
      levelized: (value: string) => `Custo nivelado: US$ ${value}/kWh·ciclo`,
      safety: (label: string) => `Estabilidade térmica intrínseca: ${label}`,
    },
    // D-86: premissas recolhidas, com cada valor impresso no resumo (D-69).
    premisesSummary: (capacity: string, mass: string, volume: string, cost: string) =>
      `Premissas do pack: célula ${capacity} · empacotamento — massa ${mass}, volume ${volume}, custo ${cost}`,
    typicalCell: "típica da escala",
    blocked: {
      chemistry: "Escolha uma química.",
      positive: (label: string) => `${label}: informe um valor maior que zero.`,
      fraction: (label: string) => `${label}: vai de 0 a 1, sem incluir o zero.`,
      capacity:
        "Capacidade da célula: deixe em branco ou informe um valor maior que zero (premissas).",
    },
  },
  synthesis: {
    title: "Sintetizar material",
    subtitle:
      "Um compósito, uma espuma ou um painel sanduíche calculados a partir de materiais do catálogo. O registro é seu, fica declarado como sintetizado, e cada valor carrega a lei que o produziu.",
    // O que separa valor calculado de valor inventado, dito antes de qualquer
    // campo: é a frase que justifica a tela inteira existir (princípio 1).
    principle:
      "Nada aqui é inventado: cada número sai de uma lei aplicada a valores catalogados, e a lei vem escrita ao lado dele. Onde não existe lei honesta, a propriedade simplesmente não é sintetizada — e o motivo aparece.",
    kindStep: "1. O tipo de síntese",
    kindLabel: "Tipo",
    kindComposite: "Compósito de dois constituintes",
    kindFoam: "Espuma de um sólido",
    kindPanel: "Painel sanduíche",
    recipeStep: "2. A receita",
    parentALabel: "Primeiro constituinte",
    parentASolidLabel: "Sólido",
    parentBLabel: "Segundo constituinte",
    fractionLabel: "Fração volumétrica do primeiro (0 a 1)",
    fractionHint:
      "Fração em volume, não em massa. O que é grandeza por unidade de massa — custo, energia incorporada — é convertido para fração mássica usando as duas densidades.",
    densityLabel: "Densidade relativa (0 a 1)",
    densityHint:
      "Densidade da espuma dividida pela do sólido. Em 1 a espuma é o próprio sólido.",
    faceLabel: "Face",
    coreLabel: "Núcleo",
    faceThicknessLabel: "Espessura de cada face",
    coreThicknessLabel: "Espessura do núcleo",
    // A unidade não é pedida de propósito: toda regra do painel lê só a razão
    // entre as duas espessuras, e inventar uma unidade sugeriria que o valor
    // absoluto muda alguma coisa.
    thicknessHint:
      "As duas na mesma unidade — qual unidade é não importa, porque só a razão entre elas decide. Dobrar as duas não muda nem a densidade nem o módulo do painel.",
    identityStep: "3. A identidade do registro",
    nameLabel: "Nome",
    nameHint: "É como o registro vai aparecer no seu catálogo.",
    classLabel: "Classe",
    classHint:
      "Exigida e não herdada: a ferramenta não sabe se uma espuma de alumínio é metal ou espuma metálica para quem está catalogando, e tudo que lê por classe precisa que alguém tenha decidido.",
    descriptionLabel: "Descrição (opcional)",
    preview: "Ver o que sairia",
    previewing: "Calculando…",
    save: "Gravar registro",
    saving: "Gravando…",
    previewStep: "4. O que sairia",
    previewEmpty:
      "Esta receita não produziu valor nenhum com os dados que os pais têm.",
    // Nome provisório da prévia: a API exige nome no corpo, a prévia não
    // grava nada, e o leitor ainda não chegou ao passo em que dá nome.
    previewName: "Prévia sem nome",
    previewIdleTitle: "Nada calculado ainda",
    previewIdleHint:
      "Monte a receita e peça para ver o que sairia: cada valor calculado aparece aqui com a lei que o produziu, e o que o registro não vai ter aparece com o motivo.",
    columnProperty: "Propriedade",
    columnValue: "Valor",
    columnRule: "Lei",
    columnQuality: "Qualidade",
    // A base da lei é impressa junto do valor porque \"conservação de massa\" e
    // \"ajuste empírico\" não são a mesma afirmação sobre o número.
    skippedTitle: "O que este registro não vai ter",
    skippedHint:
      "Duas razões diferentes convivem aqui: o constituinte não tem o dado, ou esta propriedade não tem lei honesta para este tipo de síntese.",
    savedTitle: "Registro gravado",
    savedHint:
      "Ele é seu, fica declarado como sintetizado e já aparece no catálogo.",
    openRecord: "Abrir a ficha",
    parentsLabel: "Constituintes",
    materialHint: "Digite parte do nome do material.",
    // D-86: um botão desabilitado diz por quê.
    blocked: {
      parentA: "Escolha o primeiro constituinte.",
      parentB: "Escolha um segundo constituinte, diferente do primeiro.",
      fraction: "A fração volumétrica fica entre 0 e 1, sem incluir os extremos.",
      density: "A densidade relativa fica entre 0 e 1, sem incluir os extremos.",
      thickness: "Informe as duas espessuras, maiores que zero.",
      class: "Escolha a classe do registro.",
      name: "Dê um nome ao registro.",
    },
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
    // D-91: said once above the list, instead of a badge on every row.
    allDemo:
      "Todos os materiais desta lista são fictícios — dados de demonstração, que não devem ser usados em projetos reais.",
    densityLabel: "Densidade da tabela",
    densityComfortable: "Confortável",
    densityCompact: "Compacta",
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
    // Not \"sem lacunas\": the catalogue only knows about properties that were
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
    // P0-2: os processos compatíveis na ficha do material. \"Compatíveis\" e não
    // \"possíveis\" porque é uma compatibilidade declarada no catálogo, não uma
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
    // D-91: the two formats sit in one "Exportar" menu.
    exportMenu: "Exportar",
    exportPng: "PNG",
    exportPngHint: "Imagem, para slides e documentos",
    exportSvg: "SVG",
    exportSvgHint: "Vetor, editável sem perder nitidez",
    exporting: "Exportando…",
    exportError: "Não foi possível exportar a imagem.",
    // A figura é uma tela de vetores: para quem usa leitor de tela ela é
    // silêncio. A alternativa textual de verdade é a tabela que a originou,
    // aberta a partir da própria figura.
    dataTable: "Tabela de dados da figura",
    dataTableHint: "Os mesmos números que a figura desenha, em texto.",
    // D-80: o cartão MSDS troca a figura pela tabela no mesmo lugar, em vez de
    // abrir a tabela embaixo dela. D-91: a troca é uma alternância de duas
    // posições, "Gráfico | Tabela", e não mais um link solto.
    view: "Visualização",
    showTable: "Tabela",
    showFigure: "Gráfico",
    figureLabel: (title: string) =>
      `${title}. Figura; a tabela de dados equivalente abre pela alternância “Tabela”.`,
    legend: "Legenda",
    legendToggle: "Legenda — clique num item para mostrar ou ocultar a série",
    interactHint: "Passe o cursor sobre a figura, ou use Tab e as setas, para ler cada valor.",
    otherMaterials: "Demais materiais",
    missingOnAxis: (n: number) => `${n} ${n === 1 ? "ausente" : "ausentes"}`,
    indexLevel: "Linha de índice",
    columnClass: "Classe",
    thisMaterial: "Este material",
    dragMode: "Modo do cursor",
    dragModeSelect: "Selecionar região",
    dragModeZoom: "Navegar / Zoom",
    selectedRegion: "Região selecionada",
    clearBoxSelection: "Limpar seleção",
  },
  map: {
    title: "Mapas de propriedades",
    subtitle:
      "Mapa de Ashby: dois eixos, envelopes por classe e linhas de índice com inclinação calculada no backend.",
    universeTitle: "Universo",
    universeMaterials: "Materiais",
    universeProcesses: "Processos",
    columnProcess: "Processo",
    processIndexWarning:
      "Índices de mérito de Ashby não se aplicam ao universo de processos.",
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
    axesHint: "Escolha o que vai em cada eixo. O mapa aparece logo abaixo.",
    customize: "Personalizar o mapa",
    customizeHint:
      "Universo, escala, forma do envelope, camadas, classes e linha de índice. Aqui um eixo também pode virar um índice.",
    customizeInUse: (items: string[]) => `Em uso: ${items.join(" · ")}.`,
    customizationLabels: {
      universe: "universo de processos",
      scale: "escala linear",
      envelope: "fecho convexo",
      classes: "classes filtradas",
      layers: "camadas alteradas",
      index: "linha de índice",
    },
    groupUniverseScale: "Universo, escala e envelope",
    groupClasses: "Classes exibidas",
    groupDisplay: "O que desenhar",
    groupIndex: "Linha de índice",
    sameAxis: "Escolha duas propriedades diferentes para os eixos.",
    notesTitle: "Observações sobre este mapa",
    levelsHint:
      "Cada nível traçado vira uma reta paralela; o lado favorável é contado abaixo.",
    figure: "Mapa de Ashby",
    guide: "guia",
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
    selectedRegionTitle: "Região selecionada no mapa",
    selectedRegionBounds: (xRange: string, yRange: string) =>
      `X: ${xRange} · Y: ${yRange}`,
    selectedCount: (n: number) =>
      `${n} ${n === 1 ? "material na região" : "materiais na região"}`,
    useInSelection: "Criar estágio na Seleção",
    clearSelection: "Limpar seleção",
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
    // A classe sem nenhum par material×propriedade não tem percentual: escrito,
    // nunca "0%" (D-24).
    noSlots: "sem pares",
    ofSlots: (slots: number) => `de ${slots} ${slots === 1 ? "par" : "pares"}`,
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
    loading: "Comparando…",
    error: "Não foi possível montar a comparação.",
    notesTitle: "Observações sobre os dados",
    original: "Valor original",
    canonical: "Valor normalizado (unidade canônica)",
    radarNeedsThree: "O radar precisa de ao menos três propriedades.",
    // A escala sequencial do heatmap (D-80): a rampa da seção, do pior ao melhor.
    heatLow: "0 (pior)",
    heatHigh: "1 (melhor)",
    radarSkipsMissing:
      "Materiais sem valor em alguma propriedade não são traçados no radar; veja a tabela.",
    // D-86: três passos, e só os escolhidos à vista.
    stepMaterials: "1. Materiais",
    stepProperties: "2. Propriedades",
    stepView: "3. Como ver",
    addMaterial: "Buscar e adicionar material",
    addMaterialHint: "Digite parte do nome ou da classe; cada escolha entra na lista abaixo.",
    chosenMaterials: "Materiais escolhidos",
    noneChosen: "Nenhum material escolhido ainda.",
    removeMaterial: "Remover da comparação",
    lockedUntilMaterial: "Escolha ao menos um material no passo 1.",
    lockedUntilProperty: "Escolha ao menos uma propriedade no passo 2.",
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
    // D-85: o vocabulário da tela guiada.
    change: "Alterar",
    advancedOptions: "Opções avançadas",
    comboboxPlaceholder: "Digite para buscar…",
    comboboxNoMatch: (query: string) =>
      query.trim() ? `Nada encontrado para “${query.trim()}”.` : "Nenhuma opção disponível.",
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
    methodDisclosure: "Como funciona: o método em quatro passos",
    methodHint:
      "É o percurso de Ashby: descreva a função, diga o que se quer otimizar, elimine com restrições e leia o resultado com a proveniência de cada número. O cálculo filtra e só então ordena — a ordem da tela é a de quem pensa o problema.",
    // D-88: chaves por nome, não por posição — a ordem da tela mudou uma vez e
    // "step2" passaria a querer dizer outra coisa.
    stepFunction: "Função",
    stepFunctionHint: "O que o componente faz e o que se quer otimizar.",
    stepObjective: "Objetivo",
    stepObjectiveHint: "Um índice de mérito e os critérios de ranking, com os pesos somando 1.",
    stepConstraints: "Restrições",
    stepConstraintsHint: "Cada uma elimina candidatos, e o funil mostra quantos.",
    stepResults: "Resultados",
    stepResultsHint: "Ranking, contribuições, excluídos e sensibilidade.",
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
    // D-83: acesso aberto para testes — qualquer login Google usa a ferramenta.
    openSubtitle:
      "O acesso está aberto para testes: com a sua conta Google você já pode usar a ferramenta, sem assinatura.",
    openButton: "Ir para a ferramenta",
    catalogReadOnlyTitle: "Catálogo compartilhado somente leitura",
    catalogReadOnly:
      "Durante o acesso aberto para testes, alterar o catálogo compartilhado — materiais, classes, propriedades e importações — fica com a curadoria. Você pode criar e editar os seus próprios registros e estudos.",
    ownRecordOnly:
      "Durante o acesso aberto para testes, este material será salvo como registro próprio: só você o vê, e ele não entra no catálogo compartilhado.",
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
