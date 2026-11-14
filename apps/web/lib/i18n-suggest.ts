/**
 * Texts of the "Sugestão da IA" panel (D-229): the button every tool screen
 * carries and the cards it opens. Kept apart from `i18n.ts`, like
 * `i18n-plan.ts`, so the lanes that edit that file do not collide here.
 */
export const suggestText = {
  button: "Sugestão da IA",
  panelTitle: "Sugestão da IA",
  panelSubtitle:
    "Próximos passos para esta tela. Nada é aplicado sozinho: cada botão só age quando você clica, e todo número vem do servidor.",
  /** Why the button is off while the layer is off. */
  off: "A IA está desligada neste servidor; a tela funciona sem ela.",
  /** A calculator screen whose request is not complete yet: the reason the result card gives is not repeated. */
  needsBrief: "Complete os dados da tela para pedir sugestões.",
  /** Admin: the server needs the name of what is being written. */
  needsName: "Escreva o nome primeiro: a sugestão parte dele.",
  /** Beside the button, before the first ask: the quota is spent only on a click. */
  idleHint: "Só consulta a IA quando você clica.",
  loading: "Pedindo sugestões à IA…",
  refresh: "Atualizar sugestões",
  collapse: "Recolher",
  errorTitle: "Não foi possível pedir sugestões",
  errorFallback: "A IA não respondeu agora.",
  rateLimitedTitle: "Limite de uso da IA",
  retry: "Tentar de novo",
  empty: "Nenhuma sugestão para esta tela agora.",
  stale: "A tela mudou depois desta resposta. Peça de novo para sugestões do que você vê agora.",
  askAgain: "Pedir de novo",
  degradedTitle: "Sugestões das regras locais",
  degradedFallback:
    "A IA não pôde responder agora; estas sugestões vêm das regras do próprio sistema, sem o modelo.",
  cached: "Resposta guardada há pouco; não gastou a sua cota.",
  simulated: "Provedor simulado",
  rejected: (n: number) =>
    n === 1 ? "O servidor descartou 1 ação por não passar na conferência." : `O servidor descartou ${n} ações por não passarem na conferência.`,
  rejectedTitle: "Ações descartadas",
  actionsLabel: (title: string) => `Ações de «${title}»`,
  applied: (label: string) => `Aplicado: ${label}`,
  appliedMark: "aplicado",
  listLabel: "Sugestões da IA",
  /**
   * D-234: a number the model chose itself, inside the range the calculator takes
   * (the third origin of D-224). It is applied only after the person confirms.
   */
  confirmTitle: "Aplicar a sugestão da IA?",
  confirmMessage: (label: string) =>
    `A IA propôs «${label}». Esse número não vem de um cálculo, de um cenário nem do que você escreveu: é uma sugestão a revisar. Ao aplicar, o servidor refaz a conta com ele e você pode voltar ao valor anterior.`,
  confirmAction: "Aplicar e revisar",
  reviewMark: "revise antes de usar",
} as const;
