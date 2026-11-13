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
} as const;
