# ADR 0004 — Geometria dos gráficos calculada no backend

- **Status:** aceito
- **Data:** 2026-07 (Fase 5)

## Contexto

A Fase 5 introduz mapas de propriedades no estilo Ashby. Três grandezas
geométricas precisam existir para que o mapa seja legível:

1. a **inclinação** da linha de índice em escala log-log (para `E^(1/2)/ρ`,
   inclinação 2) e os extremos de cada reta de nível `M`;
2. o **envelope** de cada classe de materiais;
3. os **escores normalizados** que sustentam radar, coordenadas paralelas e
   heatmap no comparador.

A tentação natural é implementar as três no frontend: são "coisas de gráfico",
a biblioteca de plotagem está lá e o dado já chegou. Bibliotecas de gráficos
inclusive oferecem atalhos para isso.

Isso colidiria com o princípio 2 do projeto ("todo cálculo numérico é
determinístico e vive no backend"). Uma inclinação digitada como constante no
componente React é um número sem proveniência: não tem teste, não acompanha
mudanças na expressão do índice e não aparece em nenhum relatório auditável.
Pior, ela pode divergir silenciosamente — a expressão muda para `E^(1/3)/ρ` e a
reta continua com inclinação 2.

## Decisão

Toda geometria de gráfico é calculada no backend e transmitida em coordenadas de
dados, em unidades canônicas. O frontend recebe pontos, polígonos e segmentos
prontos e apenas os desenha.

Em concreto:

- **`app/calculations/powerlaw.py`** reescreve a expressão do índice — já
  validada pelo AST whitelisted de `expressions.py` — como um monômio
  `C · Π p^e`, e daí **deriva** a inclinação `−a/b` e resolve o contorno iso-`M`.
  Expressões que não são leis de potência (somas, `abs`, expoente variável) ou
  que dependem de uma terceira propriedade não recebem reta, e o motivo é
  devolvido ao usuário.
- **`app/domain/geometry.py`** calcula o fecho convexo dos envelopes. O cálculo
  ocorre no espaço efetivamente exibido (por isso `scale` faz parte da
  requisição): o fecho dos logaritmos não é o logaritmo do fecho.
- **`normalize_column`** em `app/domain/ranking.py` foi tornada pública e é
  reutilizada pelo comparador, em vez de reimplementada — assim uma barra do
  comparador e um escore do ranking não podem discordar.
- **`app/calculations/performance.py`** concentra a avaliação do índice por
  material, usada tanto pelo pipeline de seleção quanto pelos mapas; há teste
  garantindo que os dois concordam.
- Conversões de unidade dos limites de intervalo e das incertezas também ficam
  no servidor, com semântica distinta: limites são valores absolutos, incertezas
  são diferenças (`to_canonical_delta`), para que ±5 °C não vire ±278 K.

## Alternativas consideradas

- **Calcular no frontend.** Rejeitada: viola o princípio 2, não é testável junto
  com o núcleo e duplica regras de normalização.
- **Deixar o usuário informar a inclinação.** Rejeitada: transfere ao aluno uma
  conta que a ferramenta existe para fazer, e é exatamente onde o erro conceitual
  costuma acontecer.
- **Usar uma biblioteca de álgebra simbólica (SymPy).** Rejeitada: acrescenta uma
  dependência pesada para extrair expoentes de um AST que o projeto já parseia e
  valida; o percurso manual são ~60 linhas testadas e não abre superfície de
  execução dinâmica.

## Consequências

- **Positivas:** a inclinação de cada índice tem teste (`test_powerlaw.py`) e
  acompanha a expressão automaticamente; o mapa e um estudo salvo produzem os
  mesmos números por construção; a camada de apresentação pode ser trocada sem
  levar consigo nenhuma regra; a exportação de figuras para a monografia carrega
  valores rastreáveis.
- **Negativas:** trocar de escala (linear ↔ log) exige nova requisição, porque os
  envelopes mudam; e o contrato da API fica mais largo do que um simples
  "devolva os pontos". Ambos são custos aceitáveis diante da rastreabilidade
  ganha.
