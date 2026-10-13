*KEYWORD
$ MaterialSelect AI - cartao de material para LS-DYNA
$ (*MAT_PIECEWISE_LINEAR_PLASTICITY)
$
$ ATENCAO: este cartao contem valores marcados como demonstrativos, que sao
$ ficticios. Nao utilizar em projetos reais.
$ Esta ferramenta destina-se a apoio didatico e a triagem preliminar de
$ candidatos. Nao substitui validacao experimental, analise estrutural detalhada
$ nem julgamento de engenharia.
$ Cartao elastoplastico de uma temperatura para pre-processamento CAE. O modulo
$ de Young e a curva plastica valem na temperatura da serie exportada e saem da
$ curva tensao-deformacao cadastrada, convertida por regra declarada no proprio
$ arquivo; as demais propriedades sao pontos representativos de catalogo,
$ independentes de temperatura. Nada foi interpolado nem extrapolado, e
$ propriedade nao cadastrada foi omitida, nunca preenchida com zero nem com
$ valor padrao. Confira cada valor e o sistema de unidades antes de usar o
$ cartao num modelo.
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
$ densidade [RO] = 7.85E-09 t*mm^-3; qualidade: ESTIMADO; fonte: Fonte ficticia
$ de teste CAE (FICTICIA, demonstracao); licenca: Dado ficticio de demonstracao
$ modulo de Young [E] = 200000. MPa; qualidade: ESTIMADO; fonte: Fonte ficticia
$ de teste CAE (FICTICIA, demonstracao); licenca: Dado ficticio de demonstracao
$ coeficiente de Poisson [PR] = 0.3 adimensional; qualidade: ESTIMADO; fonte:
$ Fonte ficticia de teste CAE (FICTICIA, demonstracao); licenca: Dado ficticio
$ de demonstracao
$ coeficiente de expansao termica: cadastrado, mas fora deste cartao (fora do
$ *MAT_024; pertence a um material termico, nao exportado (formato
$ lsdyna-thermal))
$ condutividade termica: cadastrado, mas fora deste cartao (fora do *MAT_024;
$ pertence a um material termico, nao exportado (formato lsdyna-thermal))
$ calor especifico: cadastrado, mas fora deste cartao (fora do *MAT_024;
$ pertence a um material termico, nao exportado (formato lsdyna-thermal))
$
$ Curva plastica (D-119):
$ Curva tensao-deformacao: curva id 41 "Tracao ficticia CAE-1 (engenharia)";
$ qualidade: ESTIMADO; fonte: Fonte ficticia de teste CAE (FICTICIA,
$ demonstracao); licenca: Dado ficticio de demonstracao; citacao: Curva
$ inventada para teste nao e ensaio.; CURVA FICTICIA
$ Serie exportada: posicao 0; condicoes declaradas: Tracao uniaxial, 20 C
$ (ficticio).
$ Temperatura da serie: 293.15 K = 20. degC = 68. degF. O cartao vale nesta
$ temperatura; a tabela nao tem coluna de temperatura.
$ Medida declarada pela fonte: engenharia (tensao e deformacao nominais).
$ Modulo de Young na temperatura da serie (ponto exato, sem interpolacao): curva
$ id 42 "Modulo de Young temperatura ficticio CAE-1"; qualidade: ESTIMADO;
$ fonte: Fonte ficticia de teste CAE (FICTICIA, demonstracao); licenca: Dado
$ ficticio de demonstracao; citacao: Curva inventada para teste nao e ensaio.;
$ CURVA FICTICIA
$ Modulo de Young representativo do catalogo (210000. MPa) NAO usado: o cartao
$ usa o E da temperatura da serie, o mesmo que separa a deformacao plastica.
$ Conversao engenharia -> verdadeira: sigma_t = sigma*(1+eps), eps_t =
$ ln(1+eps), valida so ate a tensao maxima de engenharia (estriccao).
$ Pontos depois da tensao maxima de engenharia descartados: 1.
$ Deformacao plastica: eps_p = eps_t - sigma_t/E, com o E acima.
$ Pontos do trecho elastico antes do limite elastico descartados: 1.
$ Limite elastico (ponto 2 da serie) ancorado em eps_p = 0; eps_p calculado
$ antes da ancoragem: -2.3431E-06.
$ Pontos depois do escoamento com eps_p < 0 descartados: 0.
$ Tabela plastica (4 pontos; tensao verdadeira em MPa, deformacao plastica
$ adimensional):
$ ponto 2 da serie: eps_p = 0.; sigma_t = 250.3125 MPa
$ ponto 3 da serie: eps_p = 0.00843533085317; sigma_t = 303. MPa
$ ponto 4 da serie: eps_p = 0.0467951641694; sigma_t = 399. MPa
$ ponto 5 da serie: eps_p = 0.110976685307; sigma_t = 470.4 MPa
$
$ MID = 1 e LCID = 1: troque se os numeros ja estiverem em uso no seu modelo.
$ ETAN, EPS1-EPS8 e ES1-ES8 em branco: o encruamento vem da curva LCSS.
$ C, P, LCSR e VP em branco: sem dependencia da taxa (o catalogo nao a tem).
$ FAIL e TDEL em branco: criterio de falha e parametro do modelo.
*MAT_PIECEWISE_LINEAR_PLASTICITY_TITLE
Liga Ficticia CAE-1 (demonstracao)
$#     mid        ro         e        pr      sigy      etan      fail      tdel
         1  7.85E-09   200000.       0.3  250.3125
$#       c         p      lcss      lcsr        vp
                             1
$#    eps1      eps2      eps3      eps4      eps5      eps6      eps7      eps8

$#     es1       es2       es3       es4       es5       es6       es7       es8

$ Curva LCSS: deformacao plastica efetiva x tensao verdadeira de escoamento
*DEFINE_CURVE
$#    lcid      sidr       sfa       sfo      offa      offo    dattyp
         1
$#                a1                  o1
                  0.            250.3125
    0.00843533085317                303.
     0.0467951641694                399.
      0.110976685307               470.4
*END
