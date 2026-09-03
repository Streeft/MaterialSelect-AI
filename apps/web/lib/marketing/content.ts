/**
 * A cópia da vitrine pública, em um lugar só.
 *
 * Separada de `lib/i18n.ts` de propósito: aquele arquivo é o vocabulário do
 * produto — rótulos de coluna, nomes de estado, mensagens de erro — e é lido por
 * toda tela autenticada. Esta é a cópia de venda, muda por motivos comerciais e
 * numa cadência diferente. Misturar as duas faria uma revisão de preço tocar o
 * arquivo de que a tabela de resultados depende.
 *
 * Toda afirmação aqui é verificável no produto. É a regra que mantém a página
 * honesta e é o que torna o parágrafo de `limitation` um argumento em vez de uma
 * ressalva escondida no rodapé.
 */

export const marketing = {
  nav: [
    { label: "Como funciona", href: "#metodo" },
    { label: "Proveniência", href: "#proveniencia" },
    { label: "Planos", href: "#planos" },
  ],

  hero: {
    eyebrow: "Método de Ashby, auditável",
    title: "Selecione materiais com o raciocínio à vista.",
    body:
      "Da função do componente ao relatório assinado. Nenhuma propriedade é inventada: todo número na tela veio de um valor cadastrado ou de um cálculo determinístico, e a origem de cada um está a um clique de distância.",
    primary: { label: "Começar um estudo", href: "/app/selecao" },
    secondary: { label: "Ver um estudo pronto", href: "/app/selecao?modelo=haste-leve-rigida" },
    // Três afirmações que o produto cumpre hoje. Nenhuma métrica de vaidade:
    // "1.200 engenheiros confiam" é o tipo de número que ninguém pode conferir.
    assurances: [
      "Sem cartão para experimentar",
      "Importe CSV ou XLSX",
      "Seus dados não treinam nada",
    ],
  },

  provenance: {
    eyebrow: "proveniência",
    title: "Todo número diz de onde veio.",
    body:
      "Uma planilha trata um valor medido em laboratório e um valor chutado por analogia como a mesma coisa. Aqui eles nunca se confundem: cada célula carrega seu estado, e uma lacuna continua uma lacuna — o sistema não a preenche para deixar a tabela bonita.",
  },

  method: {
    eyebrow: "como funciona",
    title: "Quatro passos, e nenhum deles é uma caixa preta.",
    body:
      "É o percurso de Ashby, e você vê o efeito de cada decisão no momento em que a toma: quantos candidatos a restrição eliminou, quanto cada critério contribuiu, e a partir de que peso o ranking mudaria de primeiro lugar.",
    steps: [
      { n: "01", title: "Função", body: "O que o componente faz e o que se quer otimizar." },
      { n: "02", title: "Restrições", body: "Cada uma elimina candidatos, e o funil mostra quantos." },
      { n: "03", title: "Objetivo", body: "Um índice de mérito e os critérios de ranking." },
      { n: "04", title: "Resultados", body: "Ranking, contribuições, excluídos e sensibilidade." },
    ],
  },

  deliverable: {
    eyebrow: "entregável",
    title: "O relatório que você entrega, não uma tela que você mostra.",
    body:
      "Cada estudo sai como um documento nomeado: as restrições aplicadas, a expressão do índice, o ranking, os excluídos com o motivo, e a proveniência de cada valor usado. Em CSV, XLSX ou HTML pronto para impressão.",
  },

  /**
   * Faixas de plano.
   *
   * `price` é uma string, não um número: "R$ 0", "Sob consulta" e um valor
   * mensal têm de caber no mesmo lugar, e formatar moeda aqui só criaria a
   * ilusão de que o preço já foi decidido. Os valores da faixa intermediária
   * estão como `—` à espera dessa decisão; o eixo — materiais cadastrados e
   * quem pode importar — é o que já está definido.
   */
  plans: {
    eyebrow: "planos",
    title: "O preço acompanha o tamanho do seu catálogo.",
    body: "Valores estruturais, a definir. O eixo é quantos materiais você cadastra e quem pode importar dados.",
    tiers: [
      {
        id: "estudante",
        name: "Estudante",
        price: "R$ 0",
        period: "/ mês",
        note: "Catálogo de demonstração e um estudo salvo.",
        features: [
          { label: "Mapas de Ashby completos", included: true },
          { label: "Exportação em CSV", included: true },
          { label: "Sem importação de dados", included: false },
        ],
        cta: "Começar grátis",
        featured: false,
      },
      {
        id: "laboratorio",
        name: "Laboratório",
        price: "R$ —",
        period: "/ mês",
        note: "Até 500 materiais e estudos ilimitados.",
        features: [
          { label: "Importação de CSV e XLSX", included: true },
          { label: "Relatório com proveniência", included: true },
          { label: "Até 5 pessoas na equipe", included: true },
        ],
        cta: "Falar com vendas",
        featured: true,
        badge: "mais escolhido",
      },
      {
        id: "empresa",
        name: "Empresa",
        price: "Sob consulta",
        note: "Catálogo sem limite, no seu servidor.",
        features: [
          { label: "Instalação local", included: true },
          { label: "Acesso por API", included: true },
          { label: "Trilha de auditoria", included: true },
        ],
        cta: "Falar com vendas",
        featured: false,
      },
    ],
  },

  limitation: {
    title: "O que esta ferramenta não faz",
    body:
      "Ela destina-se a apoio didático e à triagem preliminar de candidatos. Não substitui validação experimental, análise estrutural detalhada nem julgamento de engenharia. Dizemos isso na página de vendas porque é exatamente o que separa uma triagem confiável de um chute com aparência de resposta.",
  },

  close: {
    title: "Comece pelo estudo que se parece com o seu.",
    body: "Três estudos-modelo abrem o assistente já preenchido.",
    primary: { label: "Começar um estudo", href: "/app/selecao" },
    secondary: { label: "Importar meu catálogo", href: "/app/importar" },
  },

  footer: {
    note:
      "Projeto de conclusão de curso em engenharia. Dados de demonstração são identificados como tais em toda a interface.",
    columns: [
      {
        title: "produto",
        links: [
          { label: "Como funciona", href: "#metodo" },
          { label: "Proveniência", href: "#proveniencia" },
          { label: "Planos", href: "#planos" },
        ],
      },
      {
        title: "recursos",
        links: [
          { label: "Planilha modelo", href: "/modelo.csv" },
          { label: "Catálogo", href: "/app/catalogo" },
          { label: "Painel", href: "/app/painel" },
        ],
      },
    ],
  },
} as const;
