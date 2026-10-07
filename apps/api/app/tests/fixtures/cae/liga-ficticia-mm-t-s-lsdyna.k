*KEYWORD
$ MaterialSelect AI - cartao de material para LS-DYNA (*MAT_ELASTIC)
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
$ Sistema de unidades: SI mm-t-s (mm, t, s, N, MPa, K)
$ Unidades base: comprimento mm, massa t (tonelada), tempo s, forca N, tensao
$ MPa, temperatura K
$ Valores convertidos da unidade canonica do catalogo pelo Pint.
$
$ Propriedades (valor completo; um campo de largura fixa pode arredondar):
$ densidade [RO] = 7.85E-09 t*mm^-3; qualidade: ESTIMADO; fonte: Fonte ficticia
$ de teste CAE (FICTICIA, demonstracao); licenca: Dado ficticio de demonstracao
$ modulo de Young [E] = 210000. MPa; qualidade: ESTIMADO; fonte: Fonte ficticia
$ de teste CAE (FICTICIA, demonstracao); licenca: Dado ficticio de demonstracao
$ faixa cadastrada 200000. a 220000. MPa: exportado o ponto representativo da
$ faixa
$ coeficiente de Poisson [PR] = 0.3 adimensional; qualidade: ESTIMADO; fonte:
$ Fonte ficticia de teste CAE (FICTICIA, demonstracao); licenca: Dado ficticio
$ de demonstracao
$ coeficiente de expansao termica: cadastrado, mas fora deste cartao (fora do
$ *MAT_ELASTIC; pertence a um material termico, nao exportado)
$ condutividade termica: cadastrado, mas fora deste cartao (fora do
$ *MAT_ELASTIC; pertence a um material termico, nao exportado)
$ calor especifico: cadastrado, mas fora deste cartao (fora do *MAT_ELASTIC;
$ pertence a um material termico, nao exportado)
$
$ MID = 1: troque se o numero ja estiver em uso no seu modelo.
$ DA e DB (amortecimento) em branco: parametros do modelo.
*MAT_ELASTIC_TITLE
Liga Ficticia CAE-1 (demonstracao)
$#     mid        ro         e        pr        da        db  not used
         1  7.85E-09   210000.       0.3
*END
