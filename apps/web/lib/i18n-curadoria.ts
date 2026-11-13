/**
 * Texts of the sheet's citation, the Admin's edits and the batch actions of
 * Cadernos and "Meus registros" (D-233). Kept apart from `i18n.ts`, like
 * `i18n-flow.ts` and `i18n-ficha.ts`, so the parallel lanes that edit that file
 * do not collide with this one.
 */
export const curadoriaText = {
  // "Citar fonte (ABNT)" on the sheet: the text is built by the server, from what is recorded.
  cite: {
    title: "Fontes desta ficha",
    hint:
      "As fontes dos valores, da composição e das designações desta ficha. A citação em ABNT é montada pelo servidor só com o que está cadastrado: o que ninguém registrou fica de fora, sem “s.d.” nem autor inventado.",
    none: "Esta ficha ainda não cita nenhuma fonte.",
    button: "Citar fonte (ABNT)",
    buttonFor: (label: string) => `Citar fonte (ABNT): ${label}`,
    done: "Citação ABNT copiada.",
    failed: "O navegador não permitiu copiar. Selecione a citação e copie manualmente.",
    listLabel: "Fontes citadas nesta ficha",
    citationLabel: "Citação em ABNT",
  },
  // Admin › Classes: "Mover para…", the tree edit that touches only the parent.
  move: {
    action: "Mover para…",
    actionFor: (name: string) => `Mover para…: ${name}`,
    title: (name: string) => `Mover “${name}”`,
    parentLabel: "Nova classe pai",
    toRoot: "Nenhuma (classe raiz)",
    hint:
      "A classe leva as subclasses junto. Ficam fora da lista ela mesma e as classes que estão dentro dela: mover para dentro de si criaria um ciclo.",
    confirm: "Mover",
    unchanged: "A classe já está nesse lugar.",
    moved: (name: string, parent: string | null) =>
      parent === null ? `“${name}” agora é uma classe raiz.` : `“${name}” agora está em “${parent}”.`,
    failed: "Não foi possível mover a classe.",
  },
  // Admin › Propriedades: the edit that cannot change a stored number.
  editProperty: {
    action: "Editar",
    actionFor: (name: string) => `Editar: ${name}`,
    title: (name: string) => `Editar “${name}”`,
    displayUnit: "Unidade de leitura",
    displayUnitNone: "Como está guardada (unidade canônica)",
    displayUnitHint:
      "A unidade em que a grandeza se lê nas telas. Só as unidades aceitas aparecem aqui; os valores guardados não mudam.",
    fixedNote:
      "O identificador (slug), a dimensão física e a unidade canônica não mudam por aqui: valores, estudos e links salvos dependem deles.",
    save: "Salvar",
    saved: (name: string) => `Propriedade “${name}” atualizada.`,
    failed: "Não foi possível salvar a propriedade.",
  },
  // Cadernos: "Duplicar com conversa" and archiving several at once.
  notebooks: {
    duplicateWithChat: "Duplicar com conversa",
    duplicateWithChatHint:
      "Leva também a conversa e os itens do Estúdio. Nada é gerado de novo e não gasta o limite do dia.",
    select: "Selecionar",
    selectDone: "Concluir seleção",
    selectRow: (title: string) => `Selecionar o caderno ${title}`,
    selectAll: "Selecionar todos",
    selected: (n: number) => (n === 1 ? "1 caderno selecionado" : `${n} cadernos selecionados`),
    clear: "Limpar seleção",
    archiveSelected: "Arquivar selecionados",
    unarchiveSelected: "Desarquivar selecionados",
    confirmArchiveTitle: (n: number) =>
      n === 1 ? "Arquivar 1 caderno?" : `Arquivar ${n} cadernos?`,
    confirmUnarchiveTitle: (n: number) =>
      n === 1 ? "Desarquivar 1 caderno?" : `Desarquivar ${n} cadernos?`,
    confirmArchiveMessage:
      "Eles saem da lista, mas não são apagados: continuam na aba de arquivados. Dá para desfazer logo depois.",
    confirmUnarchiveMessage: "Eles voltam para a lista de cadernos.",
    archivedMany: (n: number) =>
      n === 1 ? "1 caderno arquivado." : `${n} cadernos arquivados.`,
    unarchivedMany: (n: number) =>
      n === 1 ? "1 caderno de volta à lista." : `${n} cadernos de volta à lista.`,
    batchFailed: "Não foi possível mudar os cadernos escolhidos. Nenhum foi alterado.",
  },
  // Meus registros: deleting several own records at once.
  records: {
    selectOwn: (name: string) => `Selecionar o registro ${name}`,
    selected: (n: number) => (n === 1 ? "1 registro selecionado" : `${n} registros selecionados`),
    deleteSelected: "Excluir selecionados",
    clear: "Limpar seleção",
    confirmTitle: (n: number) => (n === 1 ? "Excluir 1 registro?" : `Excluir ${n} registros?`),
    confirmMessage:
      "Eles saem do catálogo e das suas seleções. Dá para desfazer logo depois; passados alguns segundos, a exclusão vale.",
    deleted: (n: number) => (n === 1 ? "1 registro excluído" : `${n} registros excluídos`),
    selectionHint: "Marque registros próprios para excluir vários de uma vez.",
  },
} as const;
