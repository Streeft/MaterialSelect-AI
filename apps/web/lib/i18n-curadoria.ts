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
      "As fontes dos valores, da composição, das designações, das curvas e das equivalências desta ficha. A citação em ABNT é montada pelo servidor só com o que está cadastrado: o que ninguém registrou fica de fora, sem “s.d.” nem autor inventado.",
    none: "Esta ficha ainda não cita nenhuma fonte.",
    button: "Citar fonte (ABNT)",
    buttonFor: (label: string) => `Citar fonte (ABNT): ${label}`,
    done: "Citação ABNT copiada.",
    failed: "O navegador não permitiu copiar. Selecione a citação e copie manualmente.",
    listLabel: "Fontes citadas nesta ficha",
    citationLabel: "Citação em ABNT",
  },
  // The curator's correction of a source's bibliographic fields (D-236), from the sheet.
  editSource: {
    action: "Editar fonte",
    actionFor: (label: string) => `Editar fonte: ${label}`,
    title: (label: string) => `Editar a fonte “${label}”`,
    hint:
      "Só os dados da referência. O rótulo, a licença e quem revisou mudam em Administrar › Fontes. Campo em branco fica como “ninguém registrou”: nada é preenchido por você ou pelo sistema.",
    authors: "Autores",
    authorsHint: "Como a referência imprime: SOBRENOME, Nome; SOBRENOME, Nome. Ou uma instituição.",
    titleField: "Título",
    publisher: "Editora ou instituição",
    year: "Ano de publicação",
    url: "Endereço (URL)",
    urlHint: "Começa com http:// ou https://.",
    accessedOn: "Acessado em",
    accessedOnHint: "Só vale com um endereço; a citação não escreve “Acesso em” sem ele.",
    errorYear: (max: number) => `Informe um ano inteiro entre 1000 e ${max}, ou deixe em branco.`,
    errorUrl: "Informe um endereço que comece com http:// ou https:// e tenha um domínio.",
    errorAccessedFuture: "A data de acesso não pode estar no futuro.",
    errorAccessedBeforeYear: "A data de acesso não pode ser anterior ao ano de publicação.",
    errorTooLong: (max: number) => `No máximo ${max} caracteres.`,
    save: "Salvar fonte",
    saved: (label: string) => `Fonte “${label}” atualizada.`,
    failed: "Não foi possível salvar a fonte.",
    nothingToSave: "Nada mudou.",
  },
  // Admin › Fontes (D-244): the list of every registered source, and the registration fields
  // (label, licence) that the sheet's dialog does not offer.
  sourcesAdmin: {
    intro:
      "Todas as fontes cadastradas, inclusive as que nenhuma ficha cita. Só quem cura o catálogo edita; o rótulo e a licença mudam aqui, e quem revisou não muda.",
    search: "Buscar fonte",
    searchHint: "Rótulo, título, autores ou licença",
    shown: (shown: number, total: number) =>
      shown === total ? `${total} fontes` : `${shown} de ${total} fontes`,
    none: "Nenhuma fonte cadastrada ainda.",
    noMatch: (query: string) => `Nenhuma fonte combina com “${query}”.`,
    colLabel: "Rótulo",
    colLicense: "Licença",
    colReviewed: "Revisada",
    colCitation: "Citação (ABNT)",
    noLicense: "sem licença registrada",
    noReviewer: "sem revisor registrado",
    demo: "Demonstração",
    thirdParty: "Pode ter dado de terceiros",
    loading: "Carregando as fontes…",
    error: "Não foi possível carregar as fontes.",
    reviewedBy: (email: string, day: string | null) => (day ? `${email} em ${day}` : email),
    hint:
      "O cadastro (rótulo, licença) e a referência. Campo em branco fica como “ninguém registrou”, menos o rótulo. Quem revisou a fonte não muda.",
    registration: "Cadastro da fonte",
    label: "Rótulo",
    labelHint: "O nome que a fonte tem nas listas e nas fichas. Não pode ficar em branco nem repetir o de outra fonte.",
    reference: "Referência (texto livre)",
    licenseLabel: "Licença",
    licenseLabelHint: "Nome curto, como CC-BY-4.0 ou Domínio público. Em branco fica como “sem licença registrada”.",
    licenseUrl: "Endereço da licença",
    errorLabelRequired: "Informe o rótulo da fonte.",
    // --- Criar, apagar e mesclar (D-249) ---
    introActions:
      "Crie uma fonte, apague a que nenhum dado cita ou mescle uma em outra: os dados que citavam a primeira passam a citar a segunda.",
    colCitations: "Citada por",
    citations: (count: number) =>
      count === 0 ? "nenhum dado" : count === 1 ? "1 dado" : `${count} dados`,
    citationsUnknown: "não contada",
    create: "Nova fonte",
    createTitle: "Nova fonte",
    createHint:
      "Toda fonte entra dizendo o que permite: rótulo e licença são obrigatórios. Quem cadastra fica registrado como quem revisou, e isso não muda depois.",
    errorLicenseRequired: "Informe a licença ou a procedência da fonte.",
    thirdPartyField: "Pode conter dado de terceiros",
    thirdPartyHint:
      "Marque quando a fonte traz conteúdo protegido de outra origem. O sinal acompanha os dados que citam esta fonte e não sai numa mescla.",
    createSave: "Cadastrar fonte",
    created: (label: string) => `Fonte «${label}» cadastrada.`,
    createFailed: "Não foi possível cadastrar a fonte.",
    deleteAction: "Apagar",
    deleteActionFor: (label: string) => `Apagar a fonte ${label}`,
    deleteTitle: "Apagar esta fonte?",
    deleteMessage: (label: string) =>
      `A fonte «${label}» não é citada por nenhum dado e sai do cadastro. Você ainda pode desfazer por alguns segundos.`,
    deleteConfirm: "Apagar fonte",
    deleted: (label: string) => `Fonte «${label}» apagada.`,
    deleteBlocked: "Citada: mescle em vez de apagar",
    demoKept: "Fonte de demonstração: sai só com o dado fictício.",
    mergeAction: "Mesclar",
    mergeActionFor: (label: string) => `Mesclar a fonte ${label} em outra`,
    mergeTitle: (label: string) => `Mesclar «${label}» em…`,
    mergeHint:
      "Todos os dados que citam esta fonte passam a citar a escolhida, e esta sai do cadastro. Fica registrado na auditoria, nas duas fontes.",
    mergeTarget: "Fonte de destino",
    mergePick: "Escolha a fonte de destino",
    mergeNoTargets: "Não há outra fonte para receber esta.",
    mergeFlagged:
      "Esta fonte está sinalizada como possível conteúdo de terceiros: só pode ser mesclada em outra sinalizada.",
    mergeLicenseDiffers: (from: string, to: string) =>
      `As licenças são diferentes: os dados deixam de citar «${from}» e passam a citar «${to}». Confira que isso é o que você quer.`,
    mergeContinue: "Continuar",
    mergeConfirmTitle: "Mesclar estas fontes?",
    mergeConfirmMessage: (from: string, to: string, count: number | null) => {
      const tail = `«${from}» é removida. Isso não se desfaz por aqui.`;
      if (count === 0) return `Nenhum dado cita «${from}»: ela é removida e «${to}» fica como está. Isso não se desfaz por aqui.`;
      if (count === 1) return `O dado que cita «${from}» passa a citar «${to}», e ${tail}`;
      if (count === null) return `Os dados que citam «${from}» passam a citar «${to}», e ${tail}`;
      return `Os ${count} dados que citam «${from}» passam a citar «${to}», e ${tail}`;
    },
    mergeConfirm: "Mesclar fontes",
    merged: (from: string, to: string, moved: number) =>
      moved === 0
        ? `«${from}» foi mesclada em «${to}». Nenhum dado a citava.`
        : moved === 1
          ? `«${from}» foi mesclada em «${to}»: 1 dado passou a citar «${to}».`
          : `«${from}» foi mesclada em «${to}»: ${moved} dados passaram a citar «${to}».`,
    mergeFailed: "Não foi possível mesclar as fontes.",
    deleteFailed: "Não foi possível apagar a fonte.",
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
    // Drag and drop (D-236, D-244): the same move as the dialog, by the pointer (mouse, pen or finger).
    dragHint:
      "Arraste a alça de uma linha (com o mouse ou com o dedo) para cima de outra para torná-la subclasse dela, ou para a faixa “Classe raiz” para soltá-la na raiz. Pelo teclado, use “Mover para…”.",
    dragHandle: (name: string) => `Arrastar a classe ${name}`,
    dropOnto: (name: string) => `Soltar aqui para mover para dentro de “${name}”`,
    dropRoot: "Solte aqui para tornar classe raiz",
    cycleRefused: (name: string, target: string) =>
      `Não dá para mover “${name}” para dentro de “${target}”: ela está dentro de “${name}” e isso criaria um ciclo.`,
    sameParent: (name: string) => `“${name}” já está nesse lugar.`,
    dragFailed: "Não foi possível mover a classe. Nada mudou.",
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
    // "Esvaziar o arquivo" (D-236): deleting the archived ones for good.
    emptyArchive: "Esvaziar o arquivo",
    emptyArchiveTitle: (n: number) =>
      n === 1 ? "Apagar de vez 1 caderno arquivado?" : `Apagar de vez ${n} cadernos arquivados?`,
    emptyArchiveMessage:
      "Os cadernos arquivados são apagados com as fontes, a conversa, as notas e os itens do Estúdio. Não há como desfazer. Os cadernos da lista de ativos não são tocados.",
    emptyArchiveConfirm: "Apagar de vez",
    emptiedArchive: (n: number) =>
      n === 1 ? "1 caderno apagado de vez." : `${n} cadernos apagados de vez.`,
    emptyArchiveFailed: "Não foi possível esvaziar o arquivo. Nenhum caderno foi apagado.",
    // In stages (D-249): thousands of notebooks are deleted in short batches, with progress.
    emptyArchiveStages:
      "São muitos cadernos: a limpeza roda em etapas curtas, mostra o andamento e pode ser parada entre uma etapa e outra. O que já foi apagado não volta.",
    emptyArchiveProgress: (deleted: number, total: number) =>
      `Apagando o arquivo: ${deleted.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} cadernos.`,
    emptyArchiveStop: "Parar",
    emptyArchiveStopping: "Parando depois desta etapa…",
    emptyArchiveStopped: (deleted: number, total: number) =>
      `Limpeza parada: ${deleted.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} cadernos apagados; o resto continua no arquivo.`,
    emptyArchivePartial: (deleted: number, total: number) =>
      deleted === 0
        ? "Nenhum caderno foi apagado."
        : `A limpeza parou no meio: ${deleted.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} cadernos já foram apagados; os outros continuam no arquivo.`,
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
