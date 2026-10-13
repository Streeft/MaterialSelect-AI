*KEYWORD
$ MaterialSelect AI - cartao de material para LS-DYNA (*MAT_THERMAL_ISOTROPIC)
$
$ ATENCAO: este cartao contem valores marcados como demonstrativos, que sao
$ ficticios. Nao utilizar em projetos reais.
$ Esta ferramenta destina-se a apoio didatico e a triagem preliminar de
$ candidatos. Nao substitui validacao experimental, analise estrutural detalhada
$ nem julgamento de engenharia.
$ Cartao de material para pre-processamento CAE. Os valores sao pontos
$ representativos de catalogo, independentes de temperatura, sem curvas de
$ plasticidade, fadiga ou fluencia. Propriedade nao cadastrada foi omitida,
$ nunca preenchida com zero nem com valor padrao. Confira cada valor e o sistema
$ de unidades antes de usar o cartao num modelo.
$
$ Material: Liga Ficticia CAE-1 (demonstracao) (id 901; classe Metais)
$ MATERIAL FICTICIO: dado de demonstracao, valores inventados para ensino. Nao
$ usar em projeto real.
$ Designacoes: sem designacao cadastrada
$ Composicao quimica (% em massa): sem composicao cadastrada
$ Composicao e designacoes sao informativas: nenhum campo do cartao as le.
$ Sistema de unidades: SI mm-t-s (mm, t, s, N, MPa, K)
$ Unidades base: comprimento mm, massa t (tonelada), tempo s, forca N, tensao
$ MPa, temperatura K
$ Valores convertidos da unidade canonica do catalogo pelo Pint.
$
$ Propriedades (valor completo; um campo de largura fixa pode arredondar):
$ densidade [TRO] = 7.85E-09 t*mm^-3; qualidade: ESTIMADO; fonte: Fonte ficticia
$ de teste CAE (FICTICIA, demonstracao); licenca: Dado ficticio de demonstracao
$ modulo de Young: cadastrado, mas fora deste cartao (pertence ao material
$ mecanico (*MAT_ELASTIC), nao exportado neste cartao termico)
$ coeficiente de Poisson: cadastrado, mas fora deste cartao (pertence ao
$ material mecanico (*MAT_ELASTIC), nao exportado neste cartao termico)
$ coeficiente de expansao termica: cadastrado, mas fora deste cartao (pertence
$ ao material mecanico (*MAT_ELASTIC), nao exportado neste cartao termico)
$ condutividade termica [TC] = 50. mW*mm^-1*K^-1; qualidade: ESTIMADO; fonte:
$ Fonte ficticia de teste CAE (FICTICIA, demonstracao); licenca: Dado ficticio
$ de demonstracao
$ calor especifico [HC] = 460000000. mJ*t^-1*K^-1; qualidade: ESTIMADO; fonte:
$ Fonte ficticia de teste CAE (FICTICIA, demonstracao); licenca: Dado ficticio
$ de demonstracao
$
$ TMID = 1: troque se o numero ja estiver em uso no seu modelo.
$ TGRLC, TGMULT, TLAT e HLAT em branco: mudanca de fase e parametro do modelo.
*MAT_THERMAL_ISOTROPIC_TITLE
Liga Ficticia CAE-1 (demonstracao)
$#    tmid       tro     tgrlc    tgmult      tlat      hlat
         1  7.85E-09
$#      hc        tc
460000000.       50.
*END
