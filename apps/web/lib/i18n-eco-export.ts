/**
 * Texts of the Eco Audit export (D-172). Kept apart from `i18n.ts` so the
 * parallel lanes that edit that file do not collide with this one.
 */
export const ecoExportText = {
  idle: "Rode a auditoria para poder exportá-la.",
  running: "Gerando arquivo…",
  htmlHint: "Salva o arquivo; abra-o no navegador para imprimir ou salvar em PDF",
  csvHint: "Uma tabela por seção, para planilha",
  xlsxHint: "Uma aba por seção, com os números como números",
  docxHint: "Documento com as tabelas por componente e por trecho",
  pptxHint: "Apresentação com as tabelas divididas em slides",
  saved: (filename: string) => `Arquivo gerado: ${filename}.`,
  errorTitle: "Não foi possível exportar a auditoria",
} as const;
