/**
 * Texts of the comparator's link (D-163). Kept apart from `i18n.ts` so the
 * parallel lanes that edit that file do not collide with this one.
 */
export const compareLinkText = {
  copy: "Copiar link",
  copyHint:
    "O link leva os materiais, a referência, o limiar, os índices, a escolha de propriedades e a normalização.",
  done: "Link copiado.",
  failed: "O navegador não permitiu copiar. O endereço da barra já é o link: copie-o de lá.",
  checking: "Conferindo no servidor os índices que vieram no link…",
  unverified: "O servidor não respondeu; a expressão não pôde ser conferida.",
  refusedTitle: "Índices do link que ficaram de fora",
  refused: (expression: string, reason: string) => `«${expression}»: ${reason}`,
  ignoredTitle: "O que o link trazia e ficou de fora",
  badProperty: (raw: string) => `«${raw}» não tem forma de nome de propriedade e foi ignorado.`,
  unknownProperty: (slug: string) =>
    `A propriedade «${slug}» não existe no catálogo e foi ignorada.`,
  tooManyProperties: (extra: number, max: number) =>
    `O link trazia ${extra} ${extra === 1 ? "propriedade" : "propriedades"} além do limite de ${max}; ficaram as ${max} primeiras.`,
  badNormalization: (raw: string, fallback: string) =>
    `«${raw}» não é uma normalização conhecida; ficou a padrão (${fallback}).`,
  unknownCatalogue: (slug: string) => `«${slug}» não está no catálogo e foi ignorado.`,
} as const;
