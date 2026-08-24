# Visão geral

## Problema de pesquisa

A seleção de materiais em engenharia envolve conciliar múltiplas propriedades
(mecânicas, físicas, térmicas, econômicas, ambientais) sob restrições de projeto.
A metodologia de **Michael Ashby** organiza esse processo por meio de **mapas de
propriedades** (gráficos com um par de propriedades em eixos, tipicamente
logarítmicos) e **índices de desempenho** (combinações de propriedades que
traduzem um objetivo de projeto, como "viga mais leve para uma dada rigidez").

Ferramentas acadêmicas consagradas apoiam esse fluxo, mas são proprietárias. O
objetivo deste TCC é construir uma **plataforma autoral, aberta e reprodutível**
que ofereça recursos comparáveis — sem copiar código, dados, interface ou
elementos proprietários — com ênfase em **rastreabilidade dos cálculos** e
**tratamento rigoroso de unidades e dados ausentes**.

## Objetivos funcionais (produto completo)

Cadastrar/importar materiais; consultar propriedades; filtrar por restrições;
comparar; gerar mapas de propriedades; calcular índices de desempenho; ranquear
candidatos; explicar recomendações; exportar relatórios; e, opcionalmente,
interpretar problemas em linguagem natural com IA (sempre sob confirmação do
usuário e sem produzir valores numéricos).

## Escopo desta entrega (Fase 1 + fatia vertical)

- Modelo de dados e banco (Material, MaterialClass, PropertyDefinition,
  MaterialPropertyValue, Source).
- Conversão de unidades determinística e rastreável (Pint).
- Dados demonstrativos sintéticos.
- API: listar materiais (com busca), detalhar material, gráfico X-Y, health.
- Interface: catálogo pesquisável, ficha do material, mapa densidade × módulo de
  Young com escala linear/log.
- Testes automatizados de unidades, dado ausente e API.

O que **não** estava nesta entrega: importador de planilhas, índices de
desempenho, ranking, wizard de seleção, IA e exportação de relatórios.

> **Esta seção é o registro da Fase 1, não o estado do projeto.** Tudo o que ela
> lista como ausente entrou depois, nas Fases 3 a 7 e 9 — o importador em
> [`06`](06-importacao.md), a seleção em [`07`](07-selecao-deterministica.md), a
> IA em [`09`](09-camada-ia.md), os relatórios e o laudo em
> [`10`](10-relatorios.md). O estado atual está em
> [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) e o que falta, em
> [`TODO.md`](TODO.md).

## Princípios

Determinismo no backend; IA desacoplada e opcional; distinção explícita entre
dado medido/importado/estimado/ausente; nenhum valor ausente convertido em zero;
preservação de fonte, unidade original e método de conversão. Ver
[`../CLAUDE.md`](../CLAUDE.md).
