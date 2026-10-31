/**
 * Textos da calculadora de expressões (D-191).
 *
 * Em arquivo próprio, como `i18n-compare-link.ts`: a calculadora entra em
 * quatro telas e o dicionário principal já passa de três mil linhas.
 */
export const expressionText = {
  title: "Calculadora de índice",
  intro:
    "Monte a fórmula com os cartões das propriedades e as teclas da calculadora. O visor mostra a fórmula como no livro e diz se ela é válida.",
  modeLabel: "Modo de edição",
  modeBuild: "Montar",
  modeType: "Digitar",
  typeLabel: "Expressão (modo avançado)",
  typeHint:
    "Escreva na sintaxe do sistema: nomes das variáveis, + − * / ** e funções como sqrt( ). A busca de propriedades continua funcionando ao lado.",
  showNames: "Nomes",
  showSymbols: "Símbolos",
  notationLabel: "Notação do visor",

  // Visor
  displayLabel: "Visor da calculadora",
  displayEmpty: "Nenhuma expressão ainda. Arraste um cartão de propriedade para a fita, clique nele ou digite na busca.",
  checking: "Conferindo a expressão…",
  valid: "Expressão válida",
  invalid: "Expressão com problema",
  dimension: "Dimensão",
  unit: "Unidade do resultado",
  dimensionless: "adimensional",
  powerLaw: "Lei de potência: tem linha de índice reta no mapa log-log.",
  notPowerLaw: "Tem soma ou subtração: o índice não vira linha reta no mapa log-log.",
  describeFailed: "Não foi possível conferir a expressão agora. Tente de novo em instantes.",

  // Fita
  tapeLabel: "Fita da expressão",
  tapeHint:
    "Solte aqui os cartões. Setas movem o cursor, Backspace apaga, Delete apaga à frente; números e + − * / ( ) entram direto, e letras abrem a busca.",
  tapeEmpty: "Solte um cartão aqui",
  cursor: "cursor",
  tokenProperty: (name: string) => `${name}, propriedade`,
  tokenFunction: (label: string) => `${label}, função`,
  tokenNumber: (text: string) => `número ${text}`,
  tokenUnknown: (text: string) => `${text}, não reconhecido`,
  tokenRemoveHint: "Clique para pôr o cursor depois; arraste para mudar de lugar.",
  inserted: (what: string) => `${what} inserido.`,
  removed: "Peça apagada.",
  cleared: "Expressão limpa.",
  undone: "Desfeito.",

  // Paleta
  paletteLabel: "Propriedades",
  searchLabel: "Buscar propriedade ou função",
  searchPlaceholder: "Digite: módulo, densidade, raiz…",
  searchHint: "Sem acento também serve. Enter insere o primeiro resultado.",
  results: (n: number) => (n === 1 ? "1 resultado" : `${n} resultados`),
  noResults: "Nada encontrado. Tente outra palavra ou abra uma categoria.",
  paletteLoading: "Carregando as propriedades…",
  paletteError: "Não foi possível carregar as propriedades.",
  paletteEmpty: "O catálogo ainda não tem propriedades numéricas.",
  categoryCount: (label: string, n: number) => `${label} (${n})`,
  insertCard: (name: string) => `Inserir ${name} na expressão`,
  dragHint: "Arraste para a fita ou clique para inserir no cursor.",
  processCategory: "Atributos de processo",
  functionsGroup: "Funções",
  constantsGroup: "Constantes",

  // Teclado
  keypadLabel: "Teclado da calculadora",
  keys: {
    plus: "mais",
    minus: "menos",
    times: "vezes",
    divide: "dividido por",
    power: "elevado a",
    open: "abre parêntese",
    close: "fecha parêntese",
    separator: "separador de argumentos",
    decimal: "vírgula decimal",
    left: "mover o cursor para a esquerda",
    right: "mover o cursor para a direita",
    backspace: "apagar",
    clear: "limpar tudo",
    undo: "desfazer",
  },
  clear: "Limpar",
  undo: "Desfazer",

  // Exemplos e ajuda
  examples: "Exemplos",
  examplesHint: "Índices clássicos do método de Ashby. Clique para carregar na calculadora.",
  helpTitle: "Como montar uma expressão",
  helpSteps: [
    "Procure a propriedade pelo nome, com ou sem acento, ou abra uma categoria da lista.",
    "Arraste o cartão até a fita, ou clique nele (ou tecle Enter) para inserir onde está o cursor.",
    "Use as teclas para operar: ÷ divide, × multiplica, xʸ eleva a uma potência, √ tira a raiz. Uma função já abre e fecha o parêntese; escreva o que vai dentro.",
    "O visor mostra a fórmula como no livro, diz se é válida e qual é a dimensão e a unidade do resultado. Se algo estiver errado, a peça com problema fica marcada.",
    "Quem já conhece a sintaxe pode passar para Digitar e escrever direto; ao voltar para Montar, o texto vira cartões de novo.",
  ],
  helpStudent:
    "Estudante: um índice de desempenho junta propriedades numa fórmula que se quer maximizar (ou minimizar). E/ρ, por exemplo, premia material rígido e leve num tirante.",
  helpEngineer:
    "Engenheiro: a análise dimensional é feita no servidor, com as unidades canônicas do catálogo; ln, log e eˣ só aceitam argumento adimensional (uma razão).",
} as const;

/**
 * Exemplos oferecidos só quando todas as variáveis existem no catálogo.
 * O título é escrito em palavras e símbolos, nunca com o nome interno.
 */
export const EXPRESSION_EXAMPLES: ReadonlyArray<{
  title: string;
  reading: string;
  expression: string;
  variables: readonly string[];
}> = [
  {
    title: "Tirante leve e rígido",
    reading: "E/ρ",
    expression: "modulo_young / densidade",
    variables: ["modulo_young", "densidade"],
  },
  {
    title: "Viga leve e rígida",
    reading: "E^(1/2)/ρ",
    expression: "modulo_young ** (1/2) / densidade",
    variables: ["modulo_young", "densidade"],
  },
  {
    title: "Placa leve e rígida",
    reading: "E^(1/3)/ρ",
    expression: "cbrt(modulo_young) / densidade",
    variables: ["modulo_young", "densidade"],
  },
  {
    title: "Tirante leve e resistente",
    reading: "σy/ρ",
    expression: "limite_escoamento / densidade",
    variables: ["limite_escoamento", "densidade"],
  },
  {
    title: "Viga leve e resistente",
    reading: "σy^(2/3)/ρ",
    expression: "limite_escoamento ** (2/3) / densidade",
    variables: ["limite_escoamento", "densidade"],
  },
  {
    title: "Rigidez barata",
    reading: "E/(Cm·ρ)",
    expression: "modulo_young / (custo_massa * densidade)",
    variables: ["modulo_young", "custo_massa", "densidade"],
  },
];
