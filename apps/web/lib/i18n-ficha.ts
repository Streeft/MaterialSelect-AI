/**
 * Texts of the sheet's three newest blocks (D-157): the ordinal section, the
 * reading of a curve value and the direction of a trajectory. Kept apart from
 * `i18n.ts` — like `i18n-flow.ts` — so the parallel lanes that edit that file
 * do not collide with this one.
 *
 * `pathReason` is the backend's `PATH_AMBIGUOUS`, word for word; a test in
 * `i18n.test.ts` keeps the two copies equal.
 */
export const fichaText = {
  ordinals: {
    title: "Propriedades ordinais",
    hint:
      "Nível deste material em cada escala ordenada, do pior ao melhor. A escala é a cadastrada no catálogo: nenhum nível é estimado, e a escala não vira número.",
    loading: "Carregando as propriedades ordinais…",
    error: "Não foi possível carregar as propriedades ordinais deste material.",
    none: "Nenhuma propriedade ordinal definida no catálogo",
    noneHint:
      "Sem escala cadastrada não quer dizer nível baixo: o catálogo só não define, ainda, nenhuma propriedade ordinal.",
    scaleLabel: (name: string) => `Escala de ${name}, do pior ao melhor`,
    levelLabel: "Nível deste material",
    thisLevel: "nível deste material",
    absentHint: "A fonte não traz nível para este material. Isso não é o pior nível da escala.",
    noDataHint:
      "Nenhum nível foi cadastrado para este material. Isso não é o pior nível da escala.",
    source: (label: string) => `Fonte: ${label}`,
    noSource: "Fonte não informada",
    condition: (text: string) => `Condição: ${text}`,
    note: (text: string) => `Nota: ${text}`,
    demo: "Dado fictício (demonstração)",
  },
  curveValue: {
    title: "Ler um valor da curva",
    hint: (xLabel: string) =>
      `Informe o valor de ${xLabel.toLowerCase()} e a unidade. O servidor devolve só o ponto que a fonte declarou exatamente ali; nada é interpolado nem estimado entre pontos.`,
    fieldAt: (xLabel: string) => `Valor de ${xLabel.toLowerCase()}`,
    fieldUnit: "Unidade",
    submit: "Ler valor",
    reading: "Lendo…",
    invalidNumber: "Digite um número. A vírgula decimal é aceita.",
    error: "Não foi possível ler o valor nesta curva.",
    resultCaption: (title: string, at: string) => `Valor da curva “${title}” em ${at}`,
    columnSeries: "Série",
    columnValue: (label: string, unit: string) => (unit ? `${label} (${unit})` : label),
    foundCount: (found: number, total: number, at: string) =>
      `${found} de ${total} ${total === 1 ? "série tem" : "séries têm"} ponto declarado em ${at}.`,
    announce: (found: number, total: number, at: string) =>
      `Leitura em ${at}: ${found} de ${total} ${total === 1 ? "série" : "séries"} com ponto declarado.`,
    quality: "Qualidade do dado",
    ruleLabel: "Regra da leitura",
    pathTitle: "Leitura de valor indisponível nesta trajetória",
    pathReason:
      "Esta curva é uma trajetória (ex.: laço de histerese): o mesmo x pode ter mais de um y, conforme o trecho do caminho. Ler um valor num x é ambíguo, e nada é interpolado nem escolhido; consulte a tabela de pontos, na ordem declarada pela fonte.",
    // D-175: o valor lido vai no endereço; o que chega no link e não vale é dito.
    linkInvalidAt: (raw: string) =>
      `O valor «${raw}» que veio no link não é um número, e foi ignorado. Digite um número; a vírgula decimal é aceita.`,
    linkInvalidUnit: (raw: string) =>
      `A unidade «${raw}» que veio no link não é aceita neste eixo, então o valor não foi lido. Escolha a unidade e leia de novo.`,
  },
  path: {
    /** The footer line that explains the arrows, the start and the end. */
    direction:
      "Sentido do caminho: do primeiro ao último ponto de cada série, na ordem declarada pela fonte. As setas apontam o sentido; o anel marca o início e o losango, o fim.",
    figureLabel: (title: string) =>
      `${title}. Trajetória, percorrida do primeiro ao último ponto de cada série. A tabela de pontos equivalente abre pelo botão “Tabela”.`,
    seriesOrder: "percorrida do primeiro ao último ponto",
    columnOrder: "Ordem no caminho",
  },
} as const;
