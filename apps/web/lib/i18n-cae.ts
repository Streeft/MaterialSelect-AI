/**
 * Texts of the CAE dialog's thermal and elastoplastic formats (D-171). Kept
 * apart from `i18n.ts` so the parallel lanes that edit that file do not
 * collide with this one. The five elastic labels stay in `ptBR.cae.formats`.
 */
export const caeText = {
  menuHint: "Ansys MAPDL, Abaqus, Nastran, LS-DYNA (elástico, térmico ou elastoplástico) ou MatML",
  formatGroups: {
    elastic: "Elástico",
    thermal: "Térmico",
    plastic: "Elastoplástico (com curva tensão–deformação)",
  },
  formats: {
    "nastran-thermal": "Nastran térmico (MAT4)",
    "lsdyna-thermal": "LS-DYNA térmico (*MAT_THERMAL_ISOTROPIC)",
    "mapdl-plastic": "Ansys MAPDL elastoplástico (TB,PLAS MISO)",
    "abaqus-plastic": "Abaqus elastoplástico (*PLASTIC)",
    "nastran-plastic": "Nastran elastoplástico (MATS1, TABLES1)",
    "lsdyna-plastic": "LS-DYNA elastoplástico (*MAT_PIECEWISE_LINEAR_PLASTICITY)",
  },
  requirements: {
    loading: "Lendo do servidor o que este formato exige…",
    error:
      "Não foi possível ler o que este formato exige. O servidor ainda recusa, por escrito, um cartão que o cadastro não preenche.",
    some: (names: string) =>
      `Este formato exige: ${names}. Sem qualquer um deles o arquivo não é gerado, e nenhum campo vira zero ou fica em branco.`,
    none: "Este formato não exige propriedade mínima: leva as propriedades cadastradas e escreve as que faltam como ausentes.",
    plasticExtra:
      "Exige também a curva tensão–deformação e a série escolhidas abaixo. A curva precisa declarar se é de engenharia ou verdadeira, ter a temperatura da série e ter, no material, a curva do módulo de Young × temperatura declarada; o servidor recusa e escreve o que falta.",
    maxPoints: (n: string) =>
      `A tabela plástica admite até ${n} pontos; os pontos não são reamostrados nem descartados.`,
  },
  curve: {
    label: "Curva tensão–deformação",
    placeholder: "Escolha a curva",
    hint: "A exportação nunca escolhe a curva por você.",
    loading: "Lendo as curvas do material…",
    errorTitle: "Não foi possível ler as curvas do material",
    noneTitle: "Este material não tem curva tensão–deformação cadastrada",
    noneBody:
      "O cartão elastoplástico exige uma curva tensão–deformação do material, e o arquivo não é gerado sem ela. Cadastre ou importe a curva na ficha do material, ou escolha um formato elástico ou térmico.",
    option: (title: string, series: number) =>
      `${title} — ${series === 1 ? "1 série" : `${series} séries`}`,
    chooseFirst: "Escolha a curva para baixar o cartão elastoplástico.",
  },
  series: {
    label: "Série da curva",
    placeholder: "Escolha a série",
    hint: "A curva tem mais de uma série; a exportação nunca escolhe a série por você.",
    single: "A curva tem uma só série; é ela que vai para o cartão.",
    loading: "Lendo as séries da curva…",
    errorTitle: "Não foi possível ler as séries da curva",
    unnamed: (position: number) => `Série ${position + 1}`,
    chooseFirst: "Escolha a série para baixar o cartão elastoplástico.",
  },
} as const;
