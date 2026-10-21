/**
 * Texts of the comparator's link (D-160). Kept apart from `i18n.ts` so the
 * parallel lanes that edit that file do not collide with this one.
 */
export const compareLinkText = {
  copy: "Copiar link",
  copyHint:
    "O link leva os materiais, a referência, o limiar e os índices. A escolha de propriedades e a normalização não vão nele.",
  done: "Link copiado.",
  failed: "O navegador não permitiu copiar. O endereço da barra já é o link: copie-o de lá.",
  checking: "Conferindo no servidor os índices que vieram no link…",
  unverified: "O servidor não respondeu; a expressão não pôde ser conferida.",
  refusedTitle: "Índices do link que ficaram de fora",
  refused: (expression: string, reason: string) => `«${expression}»: ${reason}`,
  unknownCatalogue: (slug: string) => `«${slug}» não está no catálogo e foi ignorado.`,
} as const;
