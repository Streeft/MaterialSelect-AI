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

**Fases 1 a 6 e 8 concluídas. Fase 7 parcial.**

| # | Fase | Estado | Documento |
|---|---|---|---|
| 1 | Fundação | ✅ | — |
| 2 | CRUD do catálogo | ✅ | — |
| 3 | Importação CSV/XLSX | ✅ | [06](06-importacao.md) |
| 4 | Seleção determinística | ✅ | [07](07-selecao-deterministica.md) |
| 5 | Visualização | ✅ | [08](08-visualizacao.md) |
| 6 | Camada de IA opcional | ✅ | [09](09-camada-ia.md) |
| 7 | Relatórios e qualidade | 🔄 parcial | [10](10-relatorios.md) |
| 8 | Redesign da interface | ✅ | [REDESIGN](REDESIGN.md) · [11](11-usabilidade.md) |

A Fase 8 vem depois da 7 na numeração e antes dela na conclusão: o redesign era
independente do que falta na 7 (autenticação, auditoria, testes de ponta a
ponta) e resolvia a acessibilidade, que estava listada como pendência daquela
fase.

**Saúde do código:** 436 testes de backend (Python 3.11 e 3.12) e 123 de
frontend, todos verdes. `ruff` limpo, `black --check` limpo, typecheck estrito e
build de produção sem avisos. CI no GitHub Actions rodando em todo PR e push
para `main`, com os três checks **obrigatórios**: o GitHub recusa o merge se
qualquer um falhar ([D-22](DECISIONS.md)).

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
- Interface `AIProvider` com **três provedores**: `mock` (padrão, determinístico,
  sem chave e sem rede), `claude-api` (API da Anthropic, chave própria) e
  `claude-cli` (o Claude Code instalado na máquina, pela assinatura já
  autenticada). Trocar entre eles é trocar `AI_PROVIDER`. O sistema funciona
  integralmente com a camada desligada.
- Interpreta o enunciado em função/restrições/objetivo/variáveis livres,
  **citando o trecho de origem**; sugere propriedades e índices **do catálogo**;
  sugere o mapa em que o índice vira reta; explica estudos já calculados.
- **Guardrails executáveis** — ver [ARCHITECTURE.md §3](ARCHITECTURE.md).
- Com provedor real, o modelo escolhe um índice **pelo slug** e a expressão vem
  do catálogo; as ressalvas da explicação são escritas pelo backend
  ([D-35](DECISIONS.md)). Só o `mock` é determinístico, e a ressalva mostrada ao
  usuário diz isso.

### Exportação (Fase 7, parcial)
CSV, XLSX e **HTML imprimível** do catálogo e do **relatório de seleção
auditável** em 9 seções, incluindo proveniência de cada número. O HTML é
autocontido e traz folha de estilo de impressão — o PDF sai do navegador, sem
dependência de geração de PDF ([D-20](DECISIONS.md)). Cada formato neutraliza a
injeção que lhe cabe: fórmula na planilha, marcação no HTML. Avisos obrigatórios
de limitação, reprodutibilidade e dados demonstrativos.

### Interface (Fase 8)
- **Sistema de design próprio, sem biblioteca de componentes**: primitivas em
  `components/ui/` sobre uma paleta de tokens única, lida também pela camada de
  gráfico, para que interface e figura não possam discordar
  ([D-23](DECISIONS.md), [D-28](DECISIONS.md)). A rota `/estilo` é a
  documentação viva — as figuras da monografia são capturas dela.
- **As quatro promessas da proposta ficaram visíveis na tela**: método de Ashby
  explícito no assistente de seleção, proveniência de cada valor a um clique,
  hipóteses do índice **antes** da escolha ([D-25](DECISIONS.md)) e aviso de
  limitação permanente, nunca um modal que se fecha.
- **Qualidade do dado em três canais** — rótulo escrito, glifo e cor, nessa
  ordem de confiabilidade —, com a ausência como quarto estado
  ([D-24](DECISIONS.md)).
- **Todo gráfico tem a tabela que o originou como alternativa textual**
  ([D-31](DECISIONS.md)). Nenhum cálculo foi para o cliente: inclinação,
  envelopes e escores continuam vindo do backend.
- **Acessibilidade medida no navegador, não só em teste**: contraste de texto e
  de não-texto nos dois temas ([D-29](DECISIONS.md), [D-34](DECISIONS.md)),
  375 px sem rolagem lateral, caminho de teclado completo com link de pular para
  o conteúdo.
- A repaginação visual final trocou **os tokens e só os tokens** — quatro
  arquivos, nenhuma primitiva tocada e nenhuma camada de animação importada
  ([D-33](DECISIONS.md)).

## 5. Em andamento

**Fase 7** — as exportações estão entregues (planilha e imprimível). Falta:
arquitetura para PPTX, testes end-to-end de interface, autenticação e
autorização por projeto, auditoria e desempenho. A acessibilidade, que estava
nesta lista, foi entregue pela Fase 8.

**Teste de usabilidade (§3.5 da proposta)** — [11-usabilidade.md](11-usabilidade.md)
traz o roteiro, o formulário e a tabela de melhorias, prontos para aplicar.
**Nenhuma sessão foi realizada.** Enquanto a tabela da seção 7 daquele documento
estiver vazia, o compromisso não está cumprido — e ela só deve receber linha que
venha de uma sessão de fato observada.

## 6. Pendências

Ver [TODO.md](TODO.md) para o backlog priorizado com impacto, dificuldade e
dependências. Os itens de maior peso:

1. **Não há autenticação nenhuma.** A API é aberta.
2. **Nenhum teste end-to-end de interface.** A verificação de UI é manual — o
   redesign foi conferido no navegador, elemento a elemento, mas nada disso está
   automatizado.
3. **Nenhuma triagem de licenciamento** das bases incorporadas — compromisso do
   item 4.2 da proposta, e agora com o repositório público a aposta é maior
   ([TODO.md](TODO.md) M1).
4. **Nenhuma sessão de teste de usabilidade** — compromisso do §3.5, com o
   instrumento pronto em [11-usabilidade.md](11-usabilidade.md) e a análise
   cobrada como entrega pelo §4.1.

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
| Sistema de design próprio, sem biblioteca de componentes | [D-23](DECISIONS.md) |
| Qualidade do dado em três canais, nunca só cor | [D-24](DECISIONS.md) |
| Uma paleta só, compartilhada entre interface e gráfico | [D-28](DECISIONS.md) |
| A borda de um controle responde à WCAG 1.4.11 | [D-34](DECISIONS.md) |
| O provedor real escolhe índice por slug; expressão e ressalvas não são dele | [D-35](DECISIONS.md) |

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
- **Com provedor de IA real, a leitura do enunciado não é reproduzível.** Só o
  `mock` é determinístico, e é ele o padrão. O `claude-api` foi exercitado
  contra um cliente falso nos testes, mas ainda não contra a API de verdade —
  não há chave neste ambiente; o `claude-cli` foi verificado ao vivo.

## 10. Riscos conhecidos

| Risco | Mitigação em vigor |
|---|---|
| Base definitiva atrasar ou não vir | Importação agnóstica de formato + dados sintéticos desde a Fase 1. |
| Escopo grande para um semestre | Desenvolvimento em fases com entregável utilizável a cada uma. |
| Dependência de provedor de IA | Arquitetura desacoplada com provedor simulado; funciona sem chave. |
| Incorporação inadvertida de dado protegido | Triagem de licenciamento prevista (item 4.2 da proposta) — **ainda não implementada**, ver [TODO.md](TODO.md). |
| Resultado não reproduzível por interferência de IA | Cálculo determinístico + guardrails executáveis + confirmação do usuário. |
| Regressão silenciosa | CI com 436 testes de backend e 123 de frontend, **obrigatória para o merge**; canário de isolamento de testes. |

## 11. Próximos passos sugeridos

Na ordem em que eu atacaria:

1. **Estudo de caso didático completo**, do enunciado ao relatório — é entregável
   explícito da proposta (item 6) e ainda não existe. O relatório imprimível, que
   é o artefato final do caso, já está pronto.
2. **Aplicar o teste de usabilidade** de [11-usabilidade.md](11-usabilidade.md).
   O instrumento está pronto e a interface acabou de ser refeita; é o momento em
   que a sessão rende mais, e o §4.1 cobra a análise e as melhorias como entrega.
3. **Testes end-to-end** dos fluxos principais (Playwright). Ao acrescentar o job
   ao `ci.yml`, lembre de incluí-lo também em `scripts/protect-main.ps1` e rodar
   o script: a ruleset exige uma lista fixa de nomes, e um job fora dela reprova
   na aparência sem impedir o merge.
4. **Triagem de licenciamento** das bases incorporadas — agora que o repositório
   é público, incorporar dado protegido custa mais caro.
5. **Autenticação e projetos**, se o trabalho for exposto em rede.

Detalhamento com impacto e dificuldade em [TODO.md](TODO.md).
