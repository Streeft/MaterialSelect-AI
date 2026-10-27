/**
 * Texts of "Copiar tabela" outside the ranking (D-164). Kept apart from
 * `i18n.ts` so the parallel lanes that edit that file do not collide with this one.
 */
export const copyTablesText = {
  comparison: {
    aria: "Copiar tabela da comparação",
    material: "Material",
    className: "Classe",
    difference: "Dif. %",
  },
  funnel: {
    aria: "Copiar tabela do funil",
    stage: "Estágio",
    remaining: "Restam",
    eliminated: "Eliminados",
    undetermined: "Sem dado para decidir",
    withoutLevel: "Sem nível registrado",
    initial: "Candidatos iniciais",
    notApplicable: "Não se aplica",
  },
  sheet: {
    aria: "Copiar tabela de propriedades",
    group: "Grupo",
    property: "Propriedade",
    value: "Valor",
    unit: "Unidade",
    quality: "Qualidade",
    source: "Fonte",
    noSource: "Sem fonte registrada",
    typical: "típico",
  },
  // D-173 (FL-d-res): the tables D-164 left without the button.
  stages: {
    aria: "Copiar tabela dos estágios da seleção",
  },
  computed: {
    aria: "Copiar tabela das colunas calculadas",
    material: "Material",
    className: "Classe",
  },
  composition: {
    aria: "Copiar tabela de composição",
    condition: "Condição",
    element: "Elemento",
    content: "Teor (% em massa)",
    atomic: "% atômica (derivada)",
    original: "Como a fonte escreveu",
    source: "Fonte",
    citation: "Localização na fonte",
    quality: "Qualidade",
  },
  designations: {
    aria: "Copiar tabela de designações",
    system: "Norma",
    code: "Código",
    region: "Região",
    source: "Fonte",
    citation: "Localização na fonte",
  },
} as const;
