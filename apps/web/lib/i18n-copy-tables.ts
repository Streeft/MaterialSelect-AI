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
} as const;
