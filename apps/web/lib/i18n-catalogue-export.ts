/**
 * Texts of the catalogue download's own feedback (D-249). Kept apart from `i18n.ts` for the same
 * reason as the Eco export's: the file is edited by parallel lanes.
 */
export const catalogueExportText = {
  running: "Gerando arquivo…",
  saved: (filename: string) => `Arquivo gerado: ${filename}.`,
  truncatedTitle: "O arquivo do catálogo veio cortado",
  truncated: (filename: string) =>
    `A exportação foi interrompida no servidor e ${filename} está incompleto: a última linha dele diz “# ERRO”. Baixe de novo antes de usar os dados; não confie nesta cópia.`,
  errorTitle: "Não foi possível exportar o catálogo",
} as const;
