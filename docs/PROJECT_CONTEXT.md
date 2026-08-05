# Contexto do projeto

**Comece por aqui.** Este é o ponto de entrada para quem (ou o que) vai
continuar o desenvolvimento sem ter acompanhado o histórico.

Ordem de leitura sugerida: este arquivo → [CLAUDE.md](CLAUDE.md) (regras
invioláveis) → [ARCHITECTURE.md](ARCHITECTURE.md) → [TODO.md](TODO.md).

---

## 1. O que é

**MaterialSelect AI** — plataforma web de apoio à seleção de materiais de
engenharia pela metodologia de Michael Ashby (mapas de propriedades e índices de
desempenho). Trabalho de Conclusão de Curso em Engenharia de Materiais, UFRGS,
semestre 2026/2.

- **Aluno:** Francisco de Almeida Lemos (cartão 00299090)
- **Orientador:** Prof. Felipe A. L. Sánchez
- Proposta aprovada: `Proposta_TCC_MaterialSelect_AI_rev01.docx`

## 2. Objetivo do sistema

A contribuição **não é um catálogo de materiais**. É a implementação verificável
de uma abordagem que torna o método de Ashby **reprodutível, auditável e
extensível** a bases de origens diversas.

O trabalho ataca três problemas concretos da prática acadêmica:

1. **Heterogeneidade das bases** — planilhas com unidades inconsistentes,
   valores intervalares, vírgula decimal e lacunas não sinalizadas.
2. **Opacidade do processo** — ferramentas comerciais entregam o resultado da
   triagem sem expor quais conversões, hipóteses e critérios o produziram.
3. **Uso indiscriminado de IA para tarefas numéricas** — risco de valores
   fabricados e recomendações não reproduzíveis.

A resposta a (3) é estrutural: **separação rigorosa entre cálculo e IA**. Todo
resultado numérico é determinístico no backend; à IA cabe apenas interpretar,
sugerir e explicar.

## 3. Estado atual

**Fases 1 a 6 concluídas. Fase 7 em andamento.**

| # | Fase | Estado | Documento |
|---|---|---|---|
| 1 | Fundação | ✅ | — |
| 2 | CRUD do catálogo | ✅ | — |
| 3 | Importação CSV/XLSX | ✅ | [06](06-importacao.md) |
| 4 | Seleção determinística | ✅ | [07](07-selecao-deterministica.md) |
| 5 | Visualização | ✅ | [08](08-visualizacao.md) |
| 6 | Camada de IA opcional | ✅ | [09](09-camada-ia.md) |
| 7 | Relatórios e qualidade | 🔄 parcial | [10](10-relatorios.md) |

**Saúde do código:** 383 testes de backend (Python 3.11 e 3.12) e 44 de
frontend, todos verdes. `ruff` limpo, `black --check` limpo, typecheck estrito e
build de produção sem avisos. CI no GitHub Actions rodando em todo PR e push
para `main`.

## 4. Funcionalidades concluídas

### Catálogo e dados
- CRUD de materiais, classes hierárquicas e propriedades configuráveis.
- Cada valor guarda **valor original + unidade original + valor normalizado +
  unidade canônica + método de conversão + qualidade + fonte**.
- Valores escalares, **intervalares** e **explicitamente ausentes**.
- Busca por nome, classe ou palavra-chave.

### Importação
Assistente de 4 etapas: upload CSV/XLSX → mapeamento com sugestões automáticas
de unidade → validação linha a linha → commit só das linhas válidas. Histórico
com **rollback lógico** por job. Templates de mapeamento. Sanitização de fórmula
na entrada.

### Seleção determinística (o núcleo sem IA)
- Restrições com 11 operadores, combináveis por AND/OR, com funil de eliminação.
- Índices de desempenho com **parser seguro sem `eval`** e **dimensão derivada**
  por análise dimensional.
- Ranking por soma ponderada normalizada, com contribuição por critério,
  exclusão explícita de dados ausentes e análise de sensibilidade.
- Estudos salvos e reexecutáveis, que reproduzem exatamente o mesmo resultado.

### Visualização
- Mapa de Ashby com escala linear/log, filtro por classe, envelopes por classe
  (fecho convexo), barras de erro por intervalo e por incerteza.
- **Linhas de índice com inclinação derivada da expressão**: `E/ρ`→1,
  `E^(1/2)/ρ`→2, `E^(1/3)/ρ`→3. Nível traçado por material escolhido ou valor
  livre, com o lado favorável reportado.
- Comparador: tabela com proveniência, barras, radar, coordenadas paralelas e
  heatmap. Exportação PNG/SVG.

### Camada de IA (opcional)
- Interface `AIProvider` + **provedor simulado determinístico**, sem chave e sem
  rede. O sistema funciona integralmente com a camada desligada.
- Interpreta o enunciado em função/restrições/objetivo/variáveis livres,
  **citando o trecho de origem**; sugere propriedades e índices **do catálogo**;
  sugere o mapa em que o índice vira reta; explica estudos já calculados.
- **Guardrails executáveis** — ver [ARCHITECTURE.md §3](ARCHITECTURE.md).

### Exportação (Fase 7, parcial)
CSV, XLSX e **HTML imprimível** do catálogo e do **relatório de seleção
auditável** em 9 seções, incluindo proveniência de cada número. O HTML é
autocontido e traz folha de estilo de impressão — o PDF sai do navegador, sem
dependência de geração de PDF ([D-20](DECISIONS.md)). Cada formato neutraliza a
injeção que lhe cabe: fórmula na planilha, marcação no HTML. Avisos obrigatórios
de limitação, reprodutibilidade e dados demonstrativos.

## 5. Em andamento

**Fase 7** — as exportações estão entregues (planilha e imprimível). Falta:
arquitetura para PPTX, testes end-to-end de interface, autenticação e
autorização por projeto, auditoria, acessibilidade e desempenho.

## 6. Pendências

Ver [TODO.md](TODO.md) para o backlog priorizado com impacto, dificuldade e
dependências. Os três itens de maior peso:

1. **Não há autenticação nenhuma.** A API é aberta.
2. **Nenhum teste end-to-end de interface.** A verificação de UI foi manual.
3. **Checks de CI não são obrigatórios** no GitHub — um merge ainda pode passar
   com CI vermelha. É configuração no repositório, não código.

## 7. Principais fluxos

Ver os diagramas em [ARCHITECTURE.md §4](ARCHITECTURE.md). Em resumo:

- **Entrada de valor** → normalização por Pint → persistência com trilha completa.
- **Seleção** → filtro → índice → ranking → candidatos com justificativa.
- **Visualização** → backend calcula geometria → frontend desenha.
- **IA** → catálogo + texto → provedor → schema → guardrails → proposta revisável.
- **Exportação** → reexecuta o pipeline → relatório → escape conforme o formato
  (fórmula na planilha, marcação no HTML) → arquivo.

## 8. Decisões importantes

Registradas em [DECISIONS.md](DECISIONS.md) com alternativas consideradas. As
que mais afetam quem for mexer no código:

| Decisão | Onde |
|---|---|
| Cálculo determinístico só no backend | princípio nº 2 |
| Dado ausente nunca vira zero | princípio nº 3 |
| Pint para unidades, com trilha de conversão | [ADR 0002](adr/0002-pint-para-unidades.md) |
| IA desacoplada, opcional, sem produzir números | [ADR 0003](adr/0003-ia-desacoplada-do-calculo.md) |
| Geometria de gráfico calculada no backend | [ADR 0004](adr/0004-geometria-de-graficos-no-backend.md) |
| Parser de expressões sem `eval` | [DECISIONS.md](DECISIONS.md) |
| Números da IA ancorados no texto do usuário | [DECISIONS.md](DECISIONS.md) |

## 9. Limitações atuais

- **Dados demonstrativos são fictícios.** Os 5 materiais semeados existem para
  exercitar o sistema (conversão, intervalo, ausência, incerteza), não para
  descrever materiais reais. Marcados com `is_demo` e avisados na interface e em
  todo arquivo exportado.
- **A base definitiva do orientador ainda não chegou.** A camada de importação
  genérica existe justamente para não depender disso.
- **Sem autenticação, sem multiusuário, sem projetos.**
- **TOPSIS/AHP/PROMETHEE** estão previstos na arquitetura mas fora do escopo
  desta versão. `domain/ranking.py` foi deixado genérico para acomodá-los.
- **Propriedades dependentes de condição** (curvas completas) fora do escopo.
- **Busca por palavra-chave usa LIKE sobre JSON** — não escala.

## 10. Riscos conhecidos

| Risco | Mitigação em vigor |
|---|---|
| Base definitiva atrasar ou não vir | Importação agnóstica de formato + dados sintéticos desde a Fase 1. |
| Escopo grande para um semestre | Desenvolvimento em fases com entregável utilizável a cada uma. |
| Dependência de provedor de IA | Arquitetura desacoplada com provedor simulado; funciona sem chave. |
| Incorporação inadvertida de dado protegido | Triagem de licenciamento prevista (item 4.2 da proposta) — **ainda não implementada**, ver [TODO.md](TODO.md). |
| Resultado não reproduzível por interferência de IA | Cálculo determinístico + guardrails executáveis + confirmação do usuário. |
| Regressão silenciosa | CI com 383 testes; canário de isolamento de testes. |

## 11. Próximos passos sugeridos

Na ordem em que eu atacaria:

1. **Tornar os checks obrigatórios** no GitHub (5 minutos, alto retorno).
2. **Estudo de caso didático completo**, do enunciado ao relatório — é entregável
   explícito da proposta (item 6) e ainda não existe. O relatório imprimível, que
   é o artefato final do caso, já está pronto.
3. **Testes end-to-end** dos fluxos principais (Playwright).
4. **Autenticação e projetos**, se o trabalho for exposto em rede.

Detalhamento com impacto e dificuldade em [TODO.md](TODO.md).
