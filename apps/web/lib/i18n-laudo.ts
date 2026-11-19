/**
 * Texts of the engineering report screen (D-241). Kept apart from `i18n.ts`
 * so parallel lanes editing that file do not collide with this one.
 */
export const laudoText = {
  title: "Laudo de engenharia",
  description:
    "Confira o estudo, preencha quem assina e para quem é, pré-visualize e emita. A versão emitida fica congelada, com código de verificação e QR.",
  breadcrumbSelection: "Seleção",
  noStudyTitle: "Escolha um estudo salvo",
  noStudyDescription: "O laudo parte de um estudo salvo. Abra \"Meus estudos\" na Seleção e escolha \"Laudo de engenharia\".",
  goToSelection: "Ir para a Seleção",
  studyErrorTitle: "Não foi possível abrir o estudo",
  engineerTitle: "Responsável técnico",
  engineerDescription: "Texto declarado: aparece na capa e no bloco de assinatura. O sistema não confere registro nem ART.",
  engineerName: "Nome",
  engineerTitleField: "Título profissional",
  engineerTitlePlaceholder: "Engenheira mecânica",
  registration: "CREA ou registro",
  registrationPlaceholder: "CREA-SP 0000000000",
  art: "Nº da ART",
  artHint: "Opcional. Sem ela, o laudo escreve \"não informada\".",
  city: "Cidade de emissão",
  issueDate: "Data de emissão",
  clientTitle: "Cliente",
  clientDescription: "Opcional. Aparece só no laudo; a verificação pública não mostra o cliente.",
  clientName: "Cliente",
  clientProject: "Projeto",
  partTitle: "Peça",
  partDescription:
    "Com a massa da peça, o laudo estima custo por peça e por lote e o impacto ambiental. Sem ela, essas seções saem como \"não avaliado\".",
  partMass: "Massa da peça",
  batch: "Lote",
  batchHint: "Sem lote, o estimador usa 1.000 peças.",
  preview: "Pré-visualizar",
  previewHint: "Abre o laudo numa aba, com a marca \"RASCUNHO — não emitido\"; imprima de lá.",
  issue: "Emitir",
  issueMissing: (fields: string) => `Para emitir, preencha: ${fields}.`,
  confirmTitle: (version: number) => `Emitir a versão ${version} do laudo?`,
  confirmMessage:
    "Emitir congela esta versão: o laudo é guardado exatamente como está hoje, com código de verificação e QR. Mudanças posteriores no catálogo ou no estudo não o alteram; para corrigir, emita uma nova versão. A assinatura é feita depois, por você, no PDF.",
  confirmLabel: "Emitir e congelar",
  issued: (version: number, code: string) => `Versão ${version} emitida. Código de verificação ${code}.`,
  issueErrorTitle: "Não foi possível emitir o laudo",
  versionsTitle: "Versões emitidas",
  versionsTable: "Tabela das versões emitidas",
  versionsDescription: "Cada versão é um documento fixo. Abra para imprimir em PDF e assinar.",
  versionsEmpty: "Nenhuma versão emitida ainda.",
  versionsEmptyHint: "Pré-visualize, confira e emita: a primeira versão aparece aqui.",
  versionsError: "Não foi possível listar as versões",
  colVersion: "Versão",
  colIssued: "Emitida em",
  colEngineer: "Responsável",
  colCode: "Código",
  colActions: "Ações",
  open: "Abrir/Imprimir",
  openLabel: (version: number) => `Abrir a versão ${version} para imprimir`,
  versionLabel: (version: number) => `Versão ${version}`,
  linkLabel: "Laudo de engenharia",
  // --- Word e PowerPoint no visual novo (D-243) ---
  docx: "Baixar Word do estudo atual",
  docxHint:
    "Cópia editável do estudo como ele está hoje, com os campos acima: capa, resumo executivo, seções, gráficos e anexo técnico. Não é o laudo emitido nem uma versão emitida: não tem código nem QR. Para o Word de uma versão já emitida, use o botão Word na linha da versão.",
  pptx: "Baixar PowerPoint do estudo atual",
  pptxHint:
    "Apresentação do estudo como ele está hoje, com os campos acima: um slide de resumo e um por seção, com os gráficos, e o anexo técnico no fim (até 60 linhas por tabela; as tabelas inteiras ficam no Word e no laudo emitido).",
  // --- Word e PowerPoint de uma versão emitida, do que foi congelado (D-252) ---
  versionWord: "Word",
  versionWordLabel: (version: number) => `Word da versão ${version} emitida (cópia do que foi congelado)`,
  versionWordHint:
    "Cópia editável feita do documento congelado na emissão, não do estudo de hoje: mesmo texto e mesmos números do laudo emitido. A capa diz a versão e o código. Não tem selo nem QR.",
  versionPptx: "PowerPoint",
  versionPptxLabel: (version: number) =>
    `PowerPoint da versão ${version} emitida (cópia do que foi congelado)`,
  versionPptxHint:
    "Apresentação feita do documento congelado na emissão, não do estudo de hoje. A capa diz a versão e o código; o anexo traz até 60 linhas por tabela.",
  linkHint: "Pré-visualizar, emitir e ver as versões emitidas",
  // --- Envio ao cliente por e-mail (D-242) ---
  colDeliveries: "Envios",
  send: "Enviar ao cliente",
  sendLabel: (version: number) => `Enviar a versão ${version} ao cliente por e-mail`,
  noDeliveries: "Nenhum envio",
  deliveriesSummary: (count: number, last: string, status: string) =>
    `${count === 1 ? "1 envio" : `${count} envios`} · último em ${last} (${status})`,
  deliveriesLoading: "Carregando envios…",
  deliveriesError: "Não foi possível listar os envios",
  sendTitle: (version: number) => `Enviar a versão ${version} ao cliente`,
  sendDescription:
    "O cliente recebe um e-mail com o resumo, um link só de leitura com validade, o código de verificação e o laudo em anexo: o PDF assinado, se você já enviou um, ou o HTML emitido.",
  notConfiguredTitle: "Envio por e-mail não configurado neste servidor",
  notConfigured:
    "O envio por e-mail não está configurado neste servidor: o envio será apenas simulado e aparecerá no histórico como \"Simulado\". Nada chega ao cliente. Quem administra o servidor liga o e-mail pelas variáveis EMAIL_PROVIDER e SMTP_*.",
  statusUnknown: "Não foi possível saber se o servidor envia e-mail. Se o envio falhar, o histórico diz o motivo.",
  to: "Para",
  toHint: "Até 5 endereços. Digite e tecle Enter, vírgula ou espaço.",
  cc: "Cópia (opcional)",
  ccHint: "Até 5 endereços; quem já está em \"Para\" não precisa repetir.",
  addressInvalid: (value: string) => `"${value}" não parece um endereço de e-mail válido.`,
  addressLimit: (max: number) => `No máximo ${max} endereços neste campo.`,
  addressDuplicate: (value: string) => `"${value}" já está na lista.`,
  addressList: (label: string) => `Endereços em ${label}`,
  removeAddress: "Remover",
  subject: "Assunto",
  subjectHint: "Em branco, vale o assunto sugerido.",
  message: "Mensagem (opcional)",
  messageHint: "Aparece no começo do e-mail, antes do resumo. Até 1.000 caracteres.",
  previewTitle: "Pré-visualização do e-mail",
  previewFrame: "Pré-visualização do e-mail que será enviado",
  previewLoading: "Montando a pré-visualização…",
  previewError: "Não foi possível montar a pré-visualização",
  previewNote: "Como o cliente vai ler. O botão ganha o link real só no envio.",
  attachment: (name: string) => `Anexo: ${name}.`,
  attachmentSigned: "É o PDF assinado, no lugar do HTML.",
  attachmentHtml: "Ainda não há PDF assinado: vai o HTML emitido.",
  linkValidUntil: (date: string) => `O link vale até ${date}.`,
  historyTitle: "Envios desta versão",
  historyEmpty: "Esta versão ainda não foi enviada.",
  historyError: "Não foi possível listar os envios",
  historyTable: "Histórico de envios desta versão",
  colWhen: "Quando",
  colTo: "Para",
  colStatus: "Situação",
  colBy: "Por",
  statusLabels: {
    enviado: "Enviado",
    simulado: "Simulado",
    falhou: "Falhou",
    na_fila: "Na fila",
  } as Record<string, string>,
  // --- Fila de reenvio (D-252) ---
  failedAfter: (attempts: number) => `Falhou após ${attempts} tentativas`,
  queueLine: (attempts: number, max: number, next: string | null) =>
    next
      ? `Tentativa ${attempts} de ${max} falhou; o servidor tenta de novo em ${next}.`
      : `Tentativa ${attempts} de ${max} falhou; o servidor tenta de novo em instantes.`,
  queuedTitle: "O e-mail ficou na fila",
  queuedToast: (count: number, next: string | null) =>
    `O servidor de e-mail não respondeu: o envio a ${count === 1 ? "1 endereço" : `${count} endereços`} ficou na fila${next ? ` e será tentado de novo em ${next}` : ""}.`,
  cancelQueued: "Cancelar envio",
  cancelQueuedLabel: (who: string) => `Cancelar o envio na fila para ${who}`,
  cancelQueuedToast: "Envio cancelado: nada será enviado.",
  cancelQueuedErrorTitle: "Não foi possível cancelar o envio",
  queueNote:
    "Um envio que falha por motivo passageiro (servidor de e-mail fora do ar, tempo esgotado) é tentado de novo sozinho, com esperas cada vez maiores, até o limite de tentativas. Só então fica como Falhou.",
  queuedCount: (count: number) => (count === 1 ? "1 na fila" : `${count} na fila`),
  copyPrefix: "cópia",
  cancel: "Cancelar",
  sendAction: "Enviar e-mail",
  sendNeedsTo: "Informe ao menos um destinatário válido.",
  sendErrorTitle: "Não foi possível enviar o e-mail",
  sentToast: (count: number) =>
    count === 1 ? "Laudo enviado para 1 destinatário." : `Laudo enviado para ${count} destinatários.`,
  simulatedToast: (count: number) =>
    `Envio simulado registrado para ${count === 1 ? "1 destinatário" : `${count} destinatários`}: nada foi enviado.`,
  close: "Fechar",
  done: "Concluir",
  // --- PDF assinado (D-243) ---
  colSigned: "PDF assinado",
  signedNone: "Não enviado",
  signedShort: (code: string) => `Anexado · ${code}`,
  signedAction: "PDF assinado",
  signedActionLabel: (version: number) => `Enviar ou ver o PDF assinado da versão ${version}`,
  signedTitle: (version: number) => `PDF assinado da versão ${version}`,
  signedDescription:
    "Anexe o PDF que você assinou (à mão, pelo gov.br ou com certificado). Ele fica guardado ao lado desta versão, sem alterar o laudo emitido nem o código. Ao enviar ao cliente, o PDF assinado vai anexado no lugar do HTML, e o link do cliente passa a oferecer \"Baixar PDF assinado\".",
  dropTitle: "Arraste o PDF assinado até aqui",
  dropButton: "Escolher o PDF",
  dropHint: "Somente PDF, até 10 MB. Enviar outro PDF substitui o atual; o anterior fica no histórico.",
  uploadList: "Envio do PDF assinado",
  uploadErrorTitle: "Não foi possível enviar o PDF",
  uploadStatus: {
    sending: "Enviando",
    reading: "Guardando no servidor…",
    done: "Enviado",
    failed: "Não enviado",
  },
  notPdf: (name: string) => `"${name}" não é um PDF: o arquivo não começa com a marca de PDF.`,
  tooBig: (name: string, mb: number) => `"${name}" passa de ${mb} MB. Reduza o arquivo e tente de novo.`,
  uploadedToast: (name: string) => `PDF assinado enviado: ${name}.`,
  signedCurrent: "PDF atual",
  signedHistoryTitle: "Histórico de PDFs desta versão",
  signedHistoryEmpty: "Nenhum PDF assinado enviado ainda.",
  signedHistoryError: "Não foi possível listar os PDFs desta versão",
  signedHistoryTable: "Histórico de PDFs assinados desta versão",
  signedReplaced: "anterior",
  download: "Baixar",
  downloadLabel: (name: string) => `Baixar ${name}`,
  sha256: "SHA-256",
  sizeKb: (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
      : `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} KB`,
  signedBy: (who: string) => `por ${who}`,
  // --- Validade, revogação e aberturas do link (D-243) ---
  deliveriesAction: "Envios",
  deliveriesActionLabel: (version: number) => `Ver os envios da versão ${version} e os links`,
  deliveriesTitle: (version: number) => `Envios da versão ${version}`,
  deliveriesDescription:
    "Cada envio tem o seu link, com validade. Revogue um link para que ele deixe de abrir o laudo: quem o abrir vê uma página dizendo que o link foi cancelado.",
  linkStates: {
    ativo: "Link ativo",
    vencido: "Link vencido",
    revogado: "Link revogado",
    sem_link: "Sem link",
  } as Record<string, string>,
  validUntil: (date: string) => `Válido até ${date}`,
  expiredOn: (date: string) => `Venceu em ${date}`,
  revokedOn: (date: string) => `Revogado em ${date}`,
  notOpened: "Ainda não aberto",
  opened: (count: number, last: string) => `Aberto ${count}× · última em ${last}`,
  openedNote:
    "Conta as aberturas do link, não as leituras: só a página do laudo conta, sem endereço IP e sem pixel no e-mail.",
  pdfAttached: "PDF assinado anexado",
  htmlAttached: "HTML anexado",
  revoke: "Revogar link",
  revokeLabel: (who: string) => `Revogar o link do envio para ${who}`,
  revokeTitle: "Revogar este link?",
  revokeMessage:
    "O link deixa de abrir o laudo agora e não volta: quem o abrir vê uma página dizendo que foi cancelado. O e-mail já enviado e o anexo não mudam. Para o cliente ver de novo, envie outra vez.",
  revokeConfirm: "Revogar link",
  revokedToast: "Link revogado.",
  revokeErrorTitle: "Não foi possível revogar o link",
  // --- Reenviar com um clique e responder ao engenheiro (D-249) ---
  resend: "Reenviar",
  resendLabel: (who: string) => `Reenviar o laudo para ${who} com um novo link`,
  resendHint:
    "Reenviar manda a mesma mensagem às mesmas pessoas, com um link novo e a validade contada de hoje. O link antigo continua como estava; revogue-o à parte se quiser que pare.",
  resendToast: (count: number) =>
    count === 1 ? "Laudo reenviado a 1 endereço." : `Laudo reenviado a ${count} endereços.`,
  resendSimulatedToast: (count: number) =>
    count === 1
      ? "Reenvio simulado a 1 endereço: o e-mail ainda não está ligado, nada saiu."
      : `Reenvio simulado a ${count} endereços: o e-mail ainda não está ligado, nada saiu.`,
  resendErrorTitle: "Não foi possível reenviar",
  replyToMe: (address: string) => `Respostas do cliente chegam em ${address}`,
  replyToMeShort: "Respostas do cliente chegam no meu e-mail",
  replyToMeHint:
    "O cliente que clicar em Responder escreve para o e-mail da sua conta. Desmarque para usar só o endereço de envio do servidor.",
} as const;

/** The fields the server requires to issue, in the order the form shows them. */
export const LAUDO_REQUIRED: ReadonlyArray<[key: string, label: string]> = [
  ["engineer_name", "nome"],
  ["engineer_title", "título profissional"],
  ["engineer_registration", "CREA ou registro"],
  ["city", "cidade"],
  ["issue_date", "data de emissão"],
];
