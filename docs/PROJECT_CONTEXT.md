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

**Fases 1 a 9 concluídas.** Fase 7 fechou nesta sessão com a auditoria (M2);
o único item que resta sob o guarda-chuva da Fase 7 é a exportação em PPTX
(B2, baixa prioridade) — que a proposta previa como *arquitetura para*, não
como entrega, então não bloqueia a fase.

| # | Fase | Estado | Documento |
|---|---|---|---|
| 1 | Fundação | ✅ | — |
| 2 | CRUD do catálogo | ✅ | — |
| 3 | Importação CSV/XLSX | ✅ | [06](06-importacao.md) |
| 4 | Seleção determinística | ✅ | [07](07-selecao-deterministica.md) |
| 5 | Visualização | ✅ | [08](08-visualizacao.md) |
| 6 | Camada de IA opcional | ✅ | [09](09-camada-ia.md) |
| 7 | Relatórios e qualidade | ✅ | [10](10-relatorios.md) |
| 8 | Redesign da interface | ✅ | [REDESIGN](REDESIGN.md) · [11](11-usabilidade.md) |
| 9 | IA gratuita, painel, mapas personalizáveis e laudo | ✅ | [D-36 a D-41](DECISIONS.md) |

A Fase 8 vem depois da 7 na numeração e antes dela na conclusão: o redesign era
independente do que faltava na 7 e resolvia a acessibilidade, que estava
listada como pendência daquela fase. A Fase 9 seguiu o mesmo raciocínio, e A5
(autenticação) e M2 (auditoria) fecharam a Fase 7 em sessões separadas, sem
esperar uma pela outra.

**Autenticação (A5) concluída** — login exclusivamente por terceiros (Google,
OAuth 2.0; nenhuma senha em lugar nenhum do sistema), sessão em cookie
`httpOnly` que é uma linha de banco (`UserSession`) e não um JWT, catálogo
compartilhado entre todo usuário autenticado e um `Project` isolando os
`SelectionStudy` de cada usuário — um projeto por usuário, criado
automaticamente no primeiro login ([D-42](DECISIONS.md),
[ARCHITECTURE.md §7](ARCHITECTURE.md)).

**Auditoria (M2) concluída** — `AuditEvent` registra quem mudou o quê e quando
para material, classe, propriedade, índice de desempenho e estudo de seleção,
com retrato de `user_email`/`entity_label`/`project_id` para que a linha
sobreviva à conta, à entidade ou ao estudo desaparecerem depois; `GET
/api/audit` lista por entidade, com a mesma fronteira de projeto de todo
endpoint de estudo ([D-43](DECISIONS.md)). A importação em lote fica de fora
de propósito — `ImportJob` já é a trilha desse fluxo.

**Estudo de caso didático (A2) concluído** — o tirante leve e rígido de Ashby,
do enunciado ao relatório exportado, executado contra a aplicação real (não
simulado): nove materiais reais de literatura, o índice `rigidez-especifica`
já semeado, e uma ordenação que bate com os três pontos consolidados na
literatura — compósitos à frente de metais, os três metais estruturais num
platô de menos de 2% entre si, cerâmica excluída por fragilidade apesar do
melhor índice bruto. Roteiro completo em
[`12-estudo-de-caso.md`](12-estudo-de-caso.md), regressão automatizada em
`test_case_study.py`.

**Trabalho que ficou só em branch foi trazido para `main`.** As branches de
fase apareciam como `N behind / M ahead` mesmo depois de mescladas — o PR #9
entrou por *squash*, que não cria vínculo de parentesco com a branch de
origem, então o git segue reportando divergência com o conteúdo já presente.
Verificação arquivo a arquivo confirmou isso para três branches
(`fase-5-visualizacao`, `fase-6-provedores-claude`, `fase-8-redesign-interface`
— PRs #15, #7, #14), que foram apenas mescladas de volta sem conteúdo novo.
Uma quarta, `fase-9-ia-e-laudo`, tinha ~1.600 linhas genuinamente não
mescladas: a **camada de conhecimento** (ingestão do Cérebro para a IA,
`app/knowledge/`) e a **cobrança com Stripe** (`Subscription`,
`routers/billing.py`). As duas entraram por completo no PR #18, com duas
ressalvas registradas no backlog:

- O portão global de assinatura (`require_active_subscription`) ficou
  **desligado** até a arquitetura ser decidida — resolvido depois, ver
  [D-46](DECISIONS.md): o binário do plano de 18/08 é o que está ligado.
- O Cérebro licenciado (11 livros comerciais + 2 extratos de capítulo + 103
  fichas ANSYS/Granta EduPack) foi **purgado do histórico** de
  `fase-9-ia-e-laudo` antes do merge (`git filter-repo`, 89 commits
  reescritos) — mas o mesmo material chegou a `main` por outro caminho, o
  PR #17, e continua lá por **decisão explícita do autor**: o Cérebro é a
  base de conhecimento da camada de IA, e ele optou por mantê-lo hospedado
  mesmo sabendo da exposição. Não é pendência — ver [D-45](DECISIONS.md).

**A falta que resta no trabalho como um todo não é de código** e não pode ser
fechada por quem programa sozinho: a sessão de teste com usuários do §3.5 da
proposta — `11-usabilidade.md` está instrumentado, mas **nenhuma sessão foi
realizada**; enquanto a tabela de melhorias dele estiver vazia, o §3.5 não foi
cumprido.

**M4 (contrato de tipos) resolvido.** `packages/shared-types/index.ts` deixou
de ser cópia manual e passou a ser importado de verdade por `apps/web` via
npm workspaces + `transpilePackages` — a duplicação já tinha divergido em
produção (`x_quality`/`y_quality` não-nulos no arquivo canônico, corretos
como `| null` só na cópia que o typechecker de fato exercitava), exatamente o
modo de falha silenciosa que a decisão original ([D-16](DECISIONS.md)) já
previa. Ver M4 em [TODO.md](TODO.md).

**Saúde do código:** 713 testes de backend (Python 3.11 e 3.12, nenhum skip)
e 157 de frontend, todos verdes. `ruff` limpo, `black
--check` limpo, typecheck estrito e build de produção sem avisos. CI no
GitHub Actions rodando em todo PR e push para `main`, com os checks
**obrigatórios**: o GitHub recusa o merge se qualquer um falhar
([D-22](DECISIONS.md)). Um quinto job, `Lighthouse`, mede desempenho e
acessibilidade nas 11 rotas principais (§12) e já está listado em
`scripts/protect-main.ps1` como obrigatório — falta confirmar que o script foi
de fato executado contra a ruleset viva no GitHub.

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
- Interface `AIProvider` com **quatro provedores**: `mock` (padrão,
  determinístico, sem chave e sem rede), `claude-api` (API da Anthropic, chave
  própria), `claude-cli` (o Claude Code instalado na máquina, pela assinatura já
  autenticada) e `openai-compat` (qualquer servidor que fale
  `/chat/completions`, escolhido por `AI_BASE_URL` — Groq no plano gratuito,
  Ollama local, OpenRouter, OpenAI). Trocar entre eles é trocar `AI_PROVIDER`. O
  sistema funciona integralmente com a camada desligada.
- Interpreta o enunciado em função/restrições/objetivo/variáveis livres,
  **citando o trecho de origem**; sugere propriedades e índices **do catálogo**;
  sugere o mapa em que o índice vira reta; explica estudos já calculados.
- **Guardrails executáveis** — ver [ARCHITECTURE.md §3](ARCHITECTURE.md).
- Com provedor real, o modelo escolhe um índice **pelo slug** e a expressão vem
  do catálogo; as ressalvas da explicação são escritas pelo backend
  ([D-35](DECISIONS.md)). Só o `mock` é determinístico, e a ressalva mostrada ao
  usuário diz isso.

### Exportação (Fase 7)
CSV, XLSX e **HTML imprimível** do catálogo e do **relatório de seleção
auditável** em 9 seções, incluindo proveniência de cada número. O HTML é
autocontido e traz folha de estilo de impressão — o PDF sai do navegador, sem
dependência de geração de PDF ([D-20](DECISIONS.md)). Cada formato neutraliza a
injeção que lhe cabe: fórmula na planilha, marcação no HTML. Avisos obrigatórios
de limitação, reprodutibilidade e dados demonstrativos.

### Autenticação (Fase 7 — A5)
Login exclusivamente por terceiros — **Google, OAuth 2.0** — sem senha em
lugar nenhum do sistema. Sessão em cookie `httpOnly` que é uma linha de banco
(`UserSession`), não um JWT: logout revoga de verdade. O catálogo continua
global e compartilhado entre todo usuário autenticado; só `SelectionStudy` é
privado, escopado por `Project` (um por usuário, criado automaticamente no
primeiro login). Ver [D-42](DECISIONS.md) e [ARCHITECTURE.md §7](ARCHITECTURE.md).
`AuthGate.tsx` no frontend é um portão de **dois estágios** desde
[D-46](DECISIONS.md): `/auth/me` primeiro (não autenticado → `/entrar`),
depois `/billing/status` (autenticado sem assinatura ativa → `/assinatura`).

### Auditoria (Fase 7 — M2)
`AuditEvent` registra quem mudou o quê e quando, para material, classe,
propriedade, índice de desempenho e estudo de seleção — as entidades que uma
pessoa edita à mão pelos serviços de catálogo e seleção. Cada linha guarda um
**retrato** de `user_email`/`entity_label`/`project_id`, não uma junção viva:
sobrevive à conta, à entidade ou ao estudo desaparecerem depois — inclusive a
exclusão do próprio estudo, o evento em que essa garantia mais importa.
`changes` é o diff só dos campos que de fato mudaram (por campo em
materiais/classes/propriedades, por slug de propriedade na troca de valores).
`GET /api/audit` lista por entidade, sob a mesma fronteira de projeto de todo
endpoint de estudo. A importação em lote fica de fora de propósito —
`ImportJob` já é a trilha desse fluxo. Ver [D-43](DECISIONS.md).

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
  ([D-33](DECISIONS.md), depois substituída por [D-38](DECISIONS.md), que trocou
  a família da paleta mantendo o método).

### Fase 9 — IA gratuita, painel, mapas personalizáveis e laudo
O pedido tinha seis frentes, e as seis foram entregues:

- **IA gratuita** — o provedor `openai-compat` ([D-36](DECISIONS.md)) é um
  *protocolo*, não um fornecedor: o mesmo código atende Groq no plano gratuito,
  um Ollama local (sem credencial nenhuma), OpenRouter ou a OpenAI. `AI_BASE_URL`
  não tem padrão de propósito, e chave vazia é configuração válida. Serviço,
  guardrails e interface não mudaram para acomodá-lo — a demonstração de que a
  camada é mesmo opcional e substituível.
- **Barra lateral** ([D-37](DECISIONS.md)) — fixa a partir de `lg`, gaveta modal
  abaixo, recolhível a 76 px. Ao recolher, o rótulo vira `sr-only` e **nunca** é
  removido, ou o link ficaria sem nome acessível.
- **Repaginação mais colorida e arredondada** ([D-38](DECISIONS.md)) — paleta,
  forma e movimento, tudo por token. O par mais apertado é `--brand-700` sobre
  `--brand-50` a 5,01:1. A paleta categórica de classes (Okabe–Ito) não é da
  marca e não se mexe: responde a daltonismo e a impressão monocromática.
- **Painel de indicadores** em `/painel` ([D-39](DECISIONS.md)) — cobertura
  geral, composição por tipo de evidência, cobertura por classe, ranking de
  lacunas e distribuição por propriedade com box-plot, tudo sobre quartis e
  percentuais computados no backend ([ADR 0004](adr/0004-geometria-de-graficos-no-backend.md)).
- **Mapas personalizáveis** ([D-40](DECISIONS.md)) — um eixo de `/mapas` pode
  ser um índice de desempenho (do catálogo ou expressão personalizada), não só
  uma propriedade cadastrada. A linha de índice sobreposta e o eixo-índice são
  mutuamente exclusivos por desenho.
- **Laudo de engenharia** ([D-41](DECISIONS.md)) —
  `GET /api/exports/estudos/{id}/laudo.html`, documento **distinto** do
  relatório de seleção da Fase 7: a mesma reexecução determinística e as mesmas
  oito seções de auditoria, mais o gráfico de barras do ranking renderizado em
  SVG no backend (`exporters/figures.py`) e, quando a camada de IA está ligada,
  a interpretação de `AIService.explain()`. Ausência de IA é declarada, nunca
  silenciosa; responsável técnico é texto livre, nunca validado.

> **As figuras da monografia que são capturas de `/estilo` precisam ser refeitas
> depois de D-38.**

### Camada de conhecimento e cobrança (Fase 9, integradas pelo PR #18)
Ficaram ~1.600 linhas da `fase-9-ia-e-laudo` que não chegaram a `main` junto do
resto da fase — trazidas depois, íntegras, verificadas caminho a caminho:

- **Ingestão do Cérebro** (`app/knowledge/`) — leitura de PDF (`readers.py`,
  extrai texto via `pypdf`; o extra `knowledge` precisa estar instalado, e a CI
  passou a instalar `.[dev,knowledge]` por causa disso), *chunking*,
  *embeddings*, busca léxica e um `manifest` de proveniência por documento,
  mais 40 testes. Alimenta a camada de IA; não produz número nenhum sozinha —
  o princípio 2 continua valendo aqui.
- **Cobrança com Stripe** — `Subscription`, `SubscriptionRepository`,
  `routers/billing.py`, `services/billing_service.py`, `require_active_
  subscription`. O código entrou inteiro, mas o portão ficou desligado até
  a arquitetura ser decidida entre dois desenhos concorrentes — resolvido
  em [D-46](DECISIONS.md): o portão binário do plano de 18/08 é o que está
  ligado hoje, aplicado a todo router exceto `health`/`auth`/`billing`. O
  plano Free/Pro de 21/08 fica registrado como alternativa não implementada.
  Sem `STRIPE_API_KEY` configurada (o padrão em dev e CI), `checkout` e
  `portal` respondem 503. Isso é o padrão do ambiente, não uma limitação do
  código: o autor configurou Stripe em modo de teste na própria máquina e
  **completou um checkout real de ponta a ponta** (login → checkout →
  pagamento de teste → webhook → assinatura ativa), o que expôs e corrigiu
  um bug real no processamento do webhook (PR #21, ver [D-46](DECISIONS.md)).

### Estudo de caso didático (A2)
O tirante leve e rígido ("light, stiff tie") de Ashby — o exemplo introdutório
mais citado da metodologia — reproduzido do enunciado ao relatório exportado,
executado contra a aplicação real: nove materiais reais de literatura
(rotulados como tal, `docs/estudo-de-caso/`, não o `sample-data/` fictício),
importados pelo assistente de importação, ranqueados pelo índice
`rigidez-especifica` (E/ρ) já semeado no catálogo. A ordenação resultante bate
com três pontos consolidados na literatura de Ashby: compósitos de fibra à
frente de qualquer metal, os três metais estruturais (aço, alumínio, titânio)
num platô de menos de 2% entre si em rigidez específica, e a cerâmica —
melhor índice bruto de todo o conjunto — corretamente excluída por uma
restrição de fragilidade, não por acaso do índice. Roteiro completo com as
respostas reais da API como evidência em
[`12-estudo-de-caso.md`](12-estudo-de-caso.md); regressão automatizada em
`test_case_study.py`.

### Triagem de licenciamento (Fase 7 — M1)
`Source` registra procedência e licença — nenhum campo é inferido, todos vêm
do que quem importa escreveu no mapeamento. Uma fonte **nova** sem licença é
recusada antes de qualquer linha ser escrita (`validate()` e de novo em
`commit()`, o portão que realmente importa); uma fonte marcada como
possivelmente contendo dado de terceiro exige uma segunda confirmação humana
explícita, não só a marcação. Reusar um `source_label` já registrado não
reabre a decisão a cada importação seguinte — ela foi feita uma vez, na
primeira. `GET /api/sources` lista toda fonte com sua licença e revisor,
mesma lógica de transparência de M2. O portão fica na importação — a mesma
escala de decisão humana que o cadastro manual de um material já exige linha
a linha; estendê-lo ao cadastro manual é extensão natural, não lacuna. Ver
[D-44](DECISIONS.md).

## 5. Em andamento

**Fase 7 concluída** — as exportações (planilha e imprimível), os testes
end-to-end de interface (A4/B11), a autenticação (A5) e a auditoria (M2) estão
entregues. Falta só a arquitetura para PPTX (B2, baixa prioridade,
explicitamente fora de escopo salvo pedido). A acessibilidade, que estava
nesta lista, foi entregue pela Fase 8; o **desempenho**, que também estava,
foi medido e tratado (seção 12).

**Teste de usabilidade (§3.5 da proposta)** — [11-usabilidade.md](11-usabilidade.md)
traz o roteiro, o formulário e a tabela de melhorias, prontos para aplicar.
**Nenhuma sessão foi realizada.** Enquanto a tabela da seção 7 daquele documento
estiver vazia, o compromisso não está cumprido — e ela só deve receber linha que
venha de uma sessão de fato observada.

## 6. Pendências

Ver [TODO.md](TODO.md) para o backlog priorizado com impacto, dificuldade e
dependências. O único item que resta:

1. **Nenhuma sessão de teste de usabilidade** — compromisso do §3.5, com o
   instrumento pronto em [11-usabilidade.md](11-usabilidade.md) e a análise
   cobrada como entrega pelo §4.1. Não é código: exige participantes reais —
   a única pendência do trabalho como um todo que um agente não fecha
   sozinho.

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
| A IA gratuita é um protocolo, não um fornecedor | [D-36](DECISIONS.md) |
| A navegação é a barra lateral, e o rótulo recolhido vira `sr-only` | [D-37](DECISIONS.md) |
| O laudo de engenharia é um documento à parte do relatório de seleção | [D-41](DECISIONS.md) |
| Login só por terceiros (Google); catálogo compartilhado; um projeto por usuário | [D-42](DECISIONS.md) |
| A trilha de auditoria guarda retratos (quem/o quê/projeto), não junções vivas; importação em lote fica de fora | [D-43](DECISIONS.md) |
| A licença de uma fonte é decidida uma vez, no registro; reusar o rótulo não reabre a decisão | [D-44](DECISIONS.md) |
| Portão de assinatura: o desenho binário do plano de 18/08, não o Free/Pro do de 21/08 | [D-46](DECISIONS.md) |

## 9. Limitações atuais

- **Dados demonstrativos são fictícios.** Os 5 materiais semeados existem para
  exercitar o sistema (conversão, intervalo, ausência, incerteza), não para
  descrever materiais reais. Marcados com `is_demo` e avisados na interface e em
  todo arquivo exportado.
- **A base definitiva do orientador ainda não chegou.** A camada de importação
  genérica existe justamente para não depender disso.
- **Sem multiusuário, sem colaboração.** Login com Google e projetos existem
  (A5), mas cada `Project` tem dono único e nenhuma tela troca entre dois
  projetos de um mesmo usuário ainda ([D-42](DECISIONS.md)).
- **TOPSIS/AHP/PROMETHEE** estão previstos na arquitetura mas fora do escopo
  desta versão. `domain/ranking.py` foi deixado genérico para acomodá-los.
- **Propriedades dependentes de condição** (curvas completas) fora do escopo.
- **Busca por palavra-chave usa LIKE sobre JSON** — não escala.
- **Com provedor de IA real, a leitura do enunciado não é reproduzível.** Só o
  `mock` é determinístico, e é ele o padrão. O `claude-api` foi exercitado
  contra um cliente falso nos testes, mas ainda não contra a API de verdade —
  não há chave neste ambiente; o `claude-cli` foi verificado ao vivo.
- **O portão de assinatura está ligado, e o checkout foi testado ao vivo.**
  `require_active_subscription` bloqueia toda rota (exceto
  `health`/`auth`/`billing`) sem `Subscription.status == "active"`
  ([D-46](DECISIONS.md)). `STRIPE_API_KEY` continua vazio por padrão em dev e
  CI ([D-36](DECISIONS.md); `checkout`/`portal` respondem 503 sem uma chave
  configurada), mas o autor configurou Stripe em modo de teste na própria
  máquina e completou um checkout real de ponta a ponta — login Google →
  checkout hospedado → pagamento de teste → webhook → `/assinatura` refletindo
  a assinatura ativa. A verificação achou e corrigiu um bug real que os 713
  testes não pegavam (todo webhook devolvia 500 contra o SDK de verdade da
  Stripe; PR #21). O que falta é só um plano de preço em **modo de produção**
  — nenhuma credencial `sk_live_...` foi configurada em lugar nenhum.
- **O Cérebro licenciado está no histórico de `main`, por decisão explícita
  do autor.** É a base de conhecimento da camada de IA; ele optou por manter
  o material hospedado sabendo da exposição, em vez de purgá-lo como foi
  feito em `fase-9-ia-e-laudo` antes daquela branch chegar a `main`. Ver
  [D-45](DECISIONS.md).

## 10. Riscos conhecidos

| Risco | Mitigação em vigor |
|---|---|
| Base definitiva atrasar ou não vir | Importação agnóstica de formato + dados sintéticos desde a Fase 1. |
| Escopo grande para um semestre | Desenvolvimento em fases com entregável utilizável a cada uma. |
| Dependência de provedor de IA | Arquitetura desacoplada com provedor simulado; funciona sem chave. |
| Incorporação inadvertida de dado protegido | Triagem de licenciamento (M1, item 4.2 da proposta) — `Source` registra licença/procedência, e uma fonte nova sem licença ou marcada como possivelmente protegida sem confirmação humana é recusada antes de qualquer linha ser escrita ([D-44](DECISIONS.md)). |
| Resultado não reproduzível por interferência de IA | Cálculo determinístico + guardrails executáveis + confirmação do usuário. |
| Regressão silenciosa | CI com 713 testes de backend e 157 de frontend, **obrigatória para o merge**; canário de isolamento de testes. |
| Material licenciado do Cérebro exposto em `main` (repositório público) | Risco aceito por decisão explícita do autor, não mitigado — o Cérebro é a base de conhecimento da camada de IA ([D-45](DECISIONS.md)). |
| Uso sem cobrança | Portão binário ligado ([D-46](DECISIONS.md)), checkout testado ao vivo em modo de teste — falta só configurar `STRIPE_API_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID` em **modo de produção** para vender de verdade. |

## 11. Próximos passos sugeridos

**Aplicar o teste de usabilidade** de [11-usabilidade.md](11-usabilidade.md)
é o único item que resta. O instrumento está pronto e a interface acabou de
ser refeita; é o momento em que a sessão rende mais, e o §4.1 cobra a análise
e as melhorias como entrega. Única pendência que exige um humano fora do
teclado — nenhum agente fecha sozinho.

Detalhamento em [TODO.md](TODO.md).

## 12. Desempenho — o que foi medido

Números obtidos nesta base, não estimados. A distinção importa: quase toda
suspeita de lentidão que a auditoria levantou não se confirmou na medição, e uma
das "otimizações" candidatas piorava as coisas.

| O que | Antes | Depois | Como foi medido |
|---|---|---|---|
| Maior *chunk* de JavaScript | 4,5 MB | **981 KB** (−79%) | `next build`; o Plotly completo era 79% de todo o JS da aplicação. |
| Total de `.next/static/chunks` | 5,7 MB | **2,2 MB** (−61%) | idem. |
| `GET /dashboard/distribution` | 43,0 ms | 33,4 ms (−22%) | catálogo sintético de 5 000 materiais e 60 000 valores. |
| Busca de materiais por classe | 0,83 ms | 0,54 ms (−35%) | idem. |
| `GET /dashboard/overview` | 183 ms | 183 ms | idem — **e não há o que otimizar com índice**: são três junções agregadas sobre o catálogo inteiro. |
| Avaliar um índice para um material | 33,7 µs | **6,7 µs** (−80%) | 20 000 avaliações de `sqrt(modulo_young) / densidade`; a análise sintática era 17,5 µs disso. |
| Índice sobre 5 000 materiais | 168 ms | **33 ms** | consequência do anterior: um mapa com eixo-índice avalia a mesma expressão uma vez por ponto. |

**A causa do bundle** era `react-plotly.js` exigir `plotly.js/dist/plotly`, a
build completa com 3D, WebGL, mapbox e geo, para as **cinco** famílias de traço
que estas figuras usam. `lib/plotly-custom.ts` monta o Plotly à la carte e o
`webpack.resolve.alias` do `next.config.mjs` aponta a exigência para lá — a
dependência continua original e atualizável. O alias vale **só para o cliente**:
toda figura carrega por `next/dynamic` com `ssr: false`, e aplicá-lo ao grafo do
servidor quebra o runtime de desenvolvimento com um erro que **não reproduz em
`next build`**.

**A expressão do índice** era reanalisada uma vez por material — `ast.parse`
mais a checagem da lista branca, a cada ponto de um mapa. `parse()` passou a ser
memoizada (`lru_cache`), o que só é seguro porque nenhum dos quatro chamadores
muta a árvore, porque `lru_cache` não guarda exceções (uma expressão recusada é
recusada sempre, nunca lembrada como aceita) e porque o cache é limitado —
expressões vêm do usuário, e um cache sem teto indexado por entrada do usuário
seria um vetor de memória, não uma otimização. As três invariantes têm teste em
`test_expressions.py`.

**O que foi medido e recusado:** índices de cobertura mais largos (13% no
`overview` por +33% de tamanho de arquivo), `ANALYZE` (deixa o `overview` **85%
mais lento**, porque o planejador passa a escolher um plano indexado para um
agregado que precisa varrer tudo) e **eliminar a dupla execução do pipeline no
laudo** — `AIService.explain()` recomputa o estudo em vez de aceitar um
resultado pronto, o que custa 10,3 ms dos 30,4 ms do documento. É o preço da
ancoragem numérica: um parâmetro de resultado é exatamente a porta pela qual
números fabricados chegariam já abençoados. Com um provedor real de IA, essa
segunda execução some abaixo de 1% da espera.

**O que foi medido e inocentado:** o `DashboardService` emite 7 consultas e
nenhum laço por material — o custo é do banco, não do serviço. O `.env.example`
já documentava todas as variáveis da camada de IA.

**Tempo até interativo — a metade do M8 que faltava.** O job `Lighthouse` da CI
mede as 11 rotas principais, autenticadas pela sessão fixa de E2E, e falha o
build se qualquer uma ultrapassar o orçamento:

| Métrica | Limite |
|---|---|
| Performance (categoria) | ≥ 0,70 |
| Acessibilidade (categoria) | ≥ 0,90 |
| Boas práticas (categoria) | ≥ 0,80 |
| Tempo até interativo | ≤ 5.000 ms |
| First Contentful Paint | ≤ 2.500 ms |
| Largest Contentful Paint | ≤ 4.000 ms |
| Cumulative Layout Shift | ≤ 0,1 |
| Total Blocking Time | ≤ 500 ms |

Configuração em `apps/web/lighthouserc.json`; os valores reais medidos por
execução ficam no relatório publicado como artefato da CI (`lighthouse-report`),
não neste documento — não os transcrevo aqui sem reler o artefato de uma
execução real, para não registrar um número que pareça medido e seja só a
lembrança de um.

Ver também as correções de travamento em [CHANGELOG_SESSION.md](CHANGELOG_SESSION.md).
