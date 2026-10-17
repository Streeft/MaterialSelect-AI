*KEYWORD
$ MaterialSelect AI - cartao de material para LS-DYNA (*MAT_ELASTIC)
$
$ Cartao de material para pre-processamento CAE. Os valores sao pontos
$ representativos de catalogo, independentes de temperatura, sem curvas de
$ plasticidade, fadiga ou fluencia. Propriedade nao cadastrada foi omitida,
$ nunca preenchida com zero nem com valor padrao. Confira cada valor e o sistema
$ de unidades antes de usar o cartao num modelo.
$
$ Material: Liga Exemplo CAE-1 (id 901; classe Metais)
$ Designacoes: sem designacao cadastrada
$ Composicao quimica (% em massa): sem composicao cadastrada
$ Composicao e designacoes sao informativas: nenhum campo do cartao as le.
$ Sistema de unidades: SI mm-t-s (mm, t, s, N, MPa, K)
$ Unidades base: comprimento mm, massa t (tonelada), tempo s, forca N, tensao
$ MPa, temperatura K
$ Valores convertidos da unidade canonica do catalogo pelo Pint.
$
$ Propriedades (valor completo; um campo de largura fixa pode arredondar):
$ densidade [RO] = 7.85E-09 t*mm^-3; qualidade: ESTIMADO; fonte: Fonte de teste
$ CAE; licenca: Licenca de teste CAE
$ modulo de Young [E] = 210000. MPa; qualidade: ESTIMADO; fonte: Fonte de teste
$ CAE; licenca: Licenca de teste CAE
$ faixa cadastrada 200000. a 220000. MPa: exportado o ponto representativo da
$ faixa
$ coeficiente de Poisson [PR] = 0.3 adimensional; qualidade: ESTIMADO; fonte:
$ Fonte de teste CAE; licenca: Licenca de teste CAE
$ coeficiente de expansao termica: cadastrado, mas fora deste cartao (fora do
$ *MAT_ELASTIC; pertence a um material termico, nao exportado (formato
$ lsdyna-thermal))
$ condutividade termica: cadastrado, mas fora deste cartao (fora do
$ *MAT_ELASTIC; pertence a um material termico, nao exportado (formato
$ lsdyna-thermal))
$ calor especifico: cadastrado, mas fora deste cartao (fora do *MAT_ELASTIC;
$ pertence a um material termico, nao exportado (formato lsdyna-thermal))
$
$ MID = 1: troque se o numero ja estiver em uso no seu modelo.
$ DA e DB (amortecimento) em branco: parametros do modelo.
*MAT_ELASTIC_TITLE
Liga Exemplo CAE-1
$#     mid        ro         e        pr        da        db  not used
         1  7.85E-09   210000.       0.3
*END
