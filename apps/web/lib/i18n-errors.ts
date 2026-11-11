/**
 * Texts for failures shown to the reader (D-200). The server's own wording is
 * never trusted to be fit for the screen: a network failure arrives as
 * "Failed to fetch" and a bug as a driver message. Each kind of failure has one
 * sentence here, written for the person and saying what to do next.
 */
export const errorsText = {
  network: "Não foi possível falar com o servidor. Confira a conexão e tente de novo.",
  unauthorized: "Sua sessão expirou. Entre de novo para continuar.",
  forbidden: "Você não tem permissão para fazer isso.",
  notFound: "Não encontramos o que você procurou. Pode ter sido removido ou o endereço está incorreto.",
  conflict: "Esta alteração entrou em conflito com outra. Atualize a página e tente de novo.",
  invalid: "Algum dado não foi aceito. Confira os campos e tente de novo.",
  rateLimited: "Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.",
  server: "O servidor teve um problema. A falha foi registrada; tente de novo em instantes.",
  unknown: "Algo não funcionou. Tente de novo.",
  titles: {
    network: "Sem conexão com o servidor",
    unauthorized: "Sessão expirada",
    forbidden: "Acesso negado",
    notFound: "Não encontrado",
    server: "Problema no servidor",
  },
  materialNotFound: {
    title: "Material não encontrado",
    description: "Este registro não existe ou foi removido. Volte ao catálogo para procurar outro.",
  },
  boundary: {
    title: "Esta tela não abriu",
    description: "Houve uma falha ao montar esta parte do aplicativo. O menu continua disponível.",
    home: "Ir para o início",
  },
  notFoundPage: {
    title: "Página não encontrada",
    description: "O endereço não existe ou mudou de lugar. Use o menu ou volte ao início.",
    home: "Ir para o início",
  },
} as const;
