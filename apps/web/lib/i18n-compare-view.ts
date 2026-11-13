/**
 * Texts of the comparator's newer reading aids (D-214): the best of each
 * property, "só diferenças", the radar's advice for a crowded selection and the
 * empty state's suggestions. Kept apart from `i18n.ts`, like `i18n-compare-link.ts`,
 * so the parallel lanes that edit that file do not collide with this one.
 */
export const compareViewText = {
  /** D-229: the "Sugestão da IA" button of this screen. */
  ai: {
    needMaterials: "Escolha ao menos um material para pedir sugestões.",
  },
  best: "Melhor",
  /** Why that one is the best: the property's own declared direction, in words. */
  bestHint: (direction: string) => `Melhor valor entre os comparados (${direction.toLowerCase()})`,
  onlyDifferences: {
    label: "Só diferenças",
    hint: "Esconde as propriedades que são iguais em todos os materiais ou que nenhum deles tem.",
    hidden: (n: number) =>
      n === 1 ? "1 propriedade escondida" : `${n} propriedades escondidas`,
    equalIn: (names: string) => `Iguais em todos os materiais: ${names}.`,
    absentIn: (names: string) => `Sem valor em nenhum material: ${names}.`,
    nothingLeft:
      "Nenhuma propriedade separa estes materiais: todas são iguais ou ausentes em todos. Desligue o filtro para vê-las.",
  },
  radar: {
    crowdedTitle: (n: number) => `Radar com ${n} materiais fica ilegível`,
    crowdedBody:
      "Os polígonos se sobrepõem e a legenda não cabe. Para muitos materiais, as coordenadas paralelas e o heatmap mostram cada um sem esconder os outros. Nada foi removido da seleção.",
    goParallel: "Ver em coordenadas paralelas",
    goHeatmap: "Ver em heatmap",
    goTable: "Ver a tabela",
    drawAnyway: "Desenhar o radar mesmo assim",
  },
  empty: {
    title: "Escolha 2 ou mais materiais para comparar",
    body: "A comparação põe os materiais lado a lado, propriedade por propriedade, e marca o melhor de cada uma. Comece por um destes atalhos ou busque pelo nome na barra abaixo.",
    needMore: "Falta pelo menos mais um material: a comparação só diferencia com 2 ou mais.",
    favorites: "Seus favoritos",
    recents: "Vistos recentemente",
    loading: "Buscando seus favoritos e os materiais que você viu…",
    compareAll: (n: number, what: string) => `Comparar ${what} (${n})`,
    whatFavorites: "os favoritos",
    whatRecents: "os últimos vistos",
    addOne: (name: string) => `Adicionar ${name} à comparação`,
    nothingYet:
      "Você ainda não favoritou nem abriu nenhum material. Abra uma ficha no catálogo e use a estrela, ou busque pelo nome na barra abaixo.",
    browse: "Abrir o catálogo",
    // D-221: classic pairs, found in the catalogue by name — never invented.
    classics: "Pares clássicos",
    classicsHint: "Achados no catálogo pelo nome; só aparece o par que o catálogo tem.",
    comparePair: (a: string, b: string) => `Comparar ${a} com ${b}`,
  },
  // D-221: one bar for what is compared, instead of two step cards.
  bar: {
    label: "O que comparar",
    materials: "Materiais",
    properties: "Propriedades",
    addProperty: "Buscar e adicionar propriedade",
    addPropertyHint: "Digite parte do nome; a escolha entra ao lado.",
    chosenProperties: "Propriedades escolhidas",
    removeProperty: "Tirar da comparação",
    noProperties: "Nenhuma propriedade escolhida.",
    noPropertyFound: "Nenhuma propriedade com esse nome.",
  },
} as const;
