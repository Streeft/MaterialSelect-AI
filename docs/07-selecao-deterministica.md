# Seleção determinística (Fase 4)

A seleção é o núcleo **reproduzível sem IA** do sistema. Todo o cálculo acontece
no backend, nas camadas puras `domain` e `calculations`, e qualquer análise pode
ser salva como um **estudo** e reaberta/reexecutada sem nenhuma dependência de
IA.

## Fluxo (método de Ashby)

```mermaid
flowchart LR
  A[Função do componente] --> B[Restrições]
  B --> C[Objetivo: índice de desempenho]
  C --> D[Ranking multicritério]
  D --> E[Candidatos + justificativa]
  B -. contagem restante .-> B
```

Wizard: **Função → Restrições → Objetivo → Resultados**. A cada restrição, o
funil de eliminação mostra quantos candidatos restam.

## Restrições (`app/domain/filters.py`)

Operadores: `>`, `≥`, `<`, `≤`, faixa (`between`), fora da faixa (`outside`),
existe / não existe, pertence / não pertence a classe, texto contém. Combináveis
por **AND** (funil cumulativo) ou **OR** (união).

- Os limiares são informados em qualquer unidade compatível e **convertidos uma
  única vez** para a unidade canônica (via Pint) antes da comparação; unidade
  incompatível é rejeitada (HTTP 400).
- Uma restrição numérica sobre uma propriedade **ausente** no material o
  **elimina** — não se seleciona sobre dado que não se tem. Os operadores
  `existe`/`não existe` permitem filtrar por completude de dados de propósito.

### Grupos aninhados (M6)

O AND/OR acima é, na verdade, um caso particular: cada restrição vive dentro de
um **grupo** (`ConstraintGroup`), e é o grupo — não o estudo — que carrega o
operador AND/OR. Um grupo combina, sob seu próprio operador, as restrições que
tem diretamente e o resultado recursivo de cada grupo-filho que aninhar dentro
dele (`app/domain/filters.py::ConstraintGroupNode`,
`apply_constraint_tree`). Isso permite parênteses lógicos de verdade — por
exemplo, `(rigidez > 100 OU densidade < 3) E classe = "metais"` é um grupo
raiz AND com duas restrições/subgrupos: um subgrupo OR com as duas restrições
de rigidez e densidade, e a restrição de classe diretamente no grupo raiz.

Um estudo salvo antes do M6 — ou um estudo novo que não use aninhamento — é
exatamente um grupo raiz sem filhos, com sua lista plana de restrições e um
único operador: a mesma árvore de um nó só, avaliando **identicamente** ao
`apply_constraints` de antes. A migration `6845a9523f17` faz esse backfill
para todo estudo pré-existente (um `ConstraintGroup` raiz por estudo, com o
`combinator` que ele já tinha), e a prova de equivalência comportamental para
o caso de um único grupo raiz está nos testes de `filters.py`.

> **Limitação conhecida:** salvar um estudo com uma árvore aninhada de verdade
> grava a árvore corretamente (e `POST /api/selection/studies/{id}/run` a
> reexecuta corretamente, porque lê do banco via `_load_group_tree`). Mas
> `GET /api/selection/studies/{id}` (`StudyOut`, montado por
> `SelectionService._study_to_out`) ainda devolve as restrições como lista
> plana — não recompõe a árvore para a resposta. Na prática: reabrir ("Abrir")
> um estudo salvo com grupos aninhados mostra tudo achatado num único grupo
> AND no editor, sem nenhum aviso na tela de que a estrutura original era
> outra. Não é perda de dado — a árvore real continua intacta no banco e
> continua sendo o que o estudo *executa* — é uma lacuna de exibição/
> round-trip, registrada em `docs/TODO.md`.

## Índices de desempenho (`app/calculations/expressions.py`)

Um índice é uma expressão sobre os slugs das propriedades (ex.:
`modulo_young / densidade`). O avaliador é **seguro, sem `eval`**:

1. a expressão é convertida em AST (`ast.parse`);
2. um whitelist recursivo aceita apenas números, variáveis, `+ - * / **`, unário
   `+/-`, parênteses e as funções `sqrt`, `cbrt`, `abs` — qualquer outro nó
   (atributos, índices, chamadas, lambdas, comprehensions, strings) é rejeitado;
3. um interpretador manual percorre a árvore.

O **mesmo interpretador** roda em dois domínios numéricos: `float` (valor do
índice por material) e `Quantity` do Pint (análise dimensional — a dimensão do
índice é **derivada**, não presumida). Somar termos dimensionalmente
incompatíveis ou elevar uma grandeza a um expoente com dimensão é rejeitado.

Índices semeados (clássicos de Ashby): rigidez específica `E/ρ`, resistência
específica `σ/ρ`, viga leve `E^(1/2)/ρ`, placa leve `E^(1/3)/ρ`, componente leve
`σy/ρ` — cada um com função, geometria, objetivo, restrição e referência.

Casos-limite tratados: divisão por zero, resultado não finito, base negativa com
expoente fracionário (resultado complexo), overflow, variável sem valor →
o índice fica **indefinido** para aquele material (nunca um número inventado).

## Ranking multicritério (`app/domain/ranking.py`)

Soma ponderada normalizada. Cada critério tem uma direção (maior/menor é melhor),
um peso e um método de normalização (**min-máx** ou **vetorial**), ambos mapeando
para um escore "maior é melhor" em [0, 1]. Os pesos são renormalizados para somar
1; soma zero é erro. Cada candidato mostra a **contribuição por critério**.

- **Dados ausentes nunca são inventados:** um material sem valor para algum
  critério é **excluído do ranking e reportado** (com quais valores faltaram) —
  jamais preenchido com 0 ou média.
- **Análise de sensibilidade:** o ranking é recalculado sob pesos perturbados
  (pesos iguais; ênfase em cada critério) e o sistema informa se o 1º colocado
  muda — uma medida de robustez da recomendação.

A arquitetura (critérios com direção/peso/normalização + matriz de escores) foi
deixada genérica para acomodar **TOPSIS/AHP/PROMETHEE** no futuro sem reformatar
as entradas.

## Estudos salvos

`SelectionStudy` (+ `SelectionConstraint`, `RankingCriterion`) persiste função,
restrições, índice e critérios. Reabrir e reexecutar reproduz exatamente o mesmo
resultado, de forma determinística.

## Endpoints

| Método | Rota | Função |
|---|---|---|
| POST | `/api/selection/filter` | aplica restrições, retorna funil + candidatos |
| POST | `/api/selection/index` | valida e avalia uma expressão de índice |
| POST | `/api/selection/run` | pipeline completo: filtro → índice → ranking |
| GET/POST | `/api/selection/studies` | listar / criar estudos |
| GET/DELETE | `/api/selection/studies/{id}` | detalhe / excluir |
| POST | `/api/selection/studies/{id}/run` | reexecutar um estudo salvo |
| GET/POST | `/api/performance-indices` | catálogo de índices |

## Segurança

Nenhum `eval`/`exec`; expressões restritas a um AST whitelisted e limitadas em
tamanho. Conversões e comparações numéricas são determinísticas e finitas
(inf/NaN rejeitados na fronteira). Consultas parametrizadas via SQLAlchemy.
