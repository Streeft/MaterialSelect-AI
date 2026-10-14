/**
 * Texts of the classroom-flow package (D-122): notes, study file, copy to the
 * clipboard, duplicate a record. Kept apart from `i18n.ts` so the parallel
 * lanes that edit that file do not collide with this one.
 */
export const flowText = {
  notes: {
    studyLabel: "Notas do estudo",
    studyHint:
      "Texto livre para lembrar por que o estudo está montado assim. É salvo com o estudo e vai no arquivo exportado.",
    stageLabel: "Nota deste estágio",
    stageHint: "Por que este critério? Texto puro, até 2.000 caracteres.",
    placeholder: "Escreva uma nota…",
    none: "sem nota",
    counter: (used: number, max: number) => `${used} de ${max} caracteres`,
    hasNotes: "com notas",
  },
  file: {
    exportItem: "Estudo (arquivo JSON)",
    exportHint: "Para guardar ou enviar a outra pessoa; reabre pelo botão Importar estudo.",
    importButton: "Importar estudo",
    importing: "Importando…",
    importHelp:
      "Aceita só arquivos de estudo exportados por esta ferramenta (.json, até 256 KB). Nada do arquivo é executado: ele é conferido e salvo como um estudo seu.",
    importDone: (name: string) => `Estudo «${name}» importado. Ele está na lista acima.`,
    tooBig: "O arquivo passa de 256 KB; não é um estudo exportado.",
    notJson: "Escolha um arquivo .json de estudo exportado.",
    readFailed: "Não foi possível ler o arquivo.",
  },
  copy: {
    button: "Copiar tabela",
    done: "Tabela copiada. Cole em uma planilha.",
    failed: "O navegador não permitiu copiar. Selecione a tabela e copie manualmente.",
    absent: "Ausente",
    columnRank: "Posição",
    columnName: "Nome",
    columnClass: "Classe",
    columnIndex: "Índice",
    columnScore: "Escore",
    columnReason: "Motivo da ausência",
  },
  duplicate: {
    button: "Duplicar como cópia",
    busy: "Duplicando…",
    done: (name: string) => `Cópia criada: «${name}».`,
    hint: "Cria um registro seu, editável, com os mesmos valores, unidades e fontes.",
    copiedFrom: "Cópia de",
    copiedFromBadge: "cópia",
  },
  materialExport: {
    sheet: "Ficha técnica completa (PDF)",
    sheetHint: "Abre em nova aba, pronta para imprimir ou salvar em PDF",
  },
} as const;
