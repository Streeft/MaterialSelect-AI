# Registro de sessões

Uma seção por sessão de trabalho, **da mais recente para a mais antiga**. O
arquivo respondia a "o que mudou na última sessão" enquanto houve uma só; com
quatro, guardar apenas a última apagaria justamente o que explica por que o
código está como está.

As sessões 1 e 2 foram escritas ao vivo. A seção da **sessão 2 foi reconstruída
depois**, a partir do `git log` e do `DECISIONS.md` — está marcada como tal, e é
por isso que ela tem menos detalhe de processo que as outras.

| Sessão | Quando | O que | Backend | Frontend |
|---|---|---|---|---|
| [6](#sessão-6--210826--estudo-de-caso-didático-a2) | 21/08/2026 | Estudo de caso didático (A2) | 630 → 632 | 148 (inalterado) |
| [5](#sessão-5--210826--auditoria-m2-e-a-instalação-do-ambiente-de-assistente) | 21/08/2026 | Fase 7: auditoria de alterações (M2) | 617 → 630 | 148 (inalterado) |
| [4](#sessão-4--110826-a-120826--fase-9-e-a-varredura-que-a-fechou) | 11 e 12/08/2026 | Fase 9 (seis frentes) e a varredura de fechamento | 436 → 591 | 123 → 141 |
| [3](#sessão-3--110826--os-provedores-reais-da-camada-de-ia) | 11/08/2026 | Fase 6: provedores reais de IA | 391 → 436 | 123 |
| [2](#sessão-2--050826-a-100826--fase-7-parcial-ci-obrigatória-e-fase-8) | 05/08 a 10/08/2026 | Fase 7 (relatório HTML), CI obrigatória, Fase 8 (redesign) | 362 → 391 | 44 → 123 |
| [1](#sessão-1--300726-a-040826--fases-5-a-7) | 30/07 a 04/08/2026 | Fases 5, 6 e 7 (exportação) | 169 → 362 | 13 → 44 |

---

# Sessão 6 — 21/08/26 — Estudo de caso didático (A2)

Ponto de partida: fim da sessão 5 (PR #10 aberta, M2 verde). Testes de
backend: 630 → 632. Continuação da mesma sessão de trabalho após uma pausa —
o usuário voltou ("bom dia") e escolheu A2 entre as pendências restantes do
`TODO.md`, a mesma pergunta feita no início da sessão 5.

## 1. O caso escolhido

O tirante leve e rígido ("light, stiff tie") de Ashby: elemento sob tração
pura, minimizar massa para rigidez axial especificada, índice a maximizar
`M = E/ρ`. Três razões concretas, não só "é um exemplo clássico":

- O índice `rigidez-especifica` (`modulo_young / densidade`) **já estava
  semeado** no catálogo (`app/db/seed.py`), com a referência a Ashby nas
  próprias hipóteses — o caso reusa o que já existia, não inventa um índice
  novo.
- O resultado é genuinamente consolidado na literatura, com uma conclusão
  contraintuitiva bem documentada (cerâmicas vencem no índice bruto, e é
  exatamente por isso que o caso precisa de uma segunda restrição para
  chegar à resposta de engenharia real) — o tipo de caso onde "os candidatos
  batem com o esperado" é uma afirmação verificável, não uma opinião.
- A restrição de fragilidade usa `not_in_class`, que já existe na
  aplicação — nenhuma propriedade nova (tenacidade à fratura) precisou ser
  adicionada ao catálogo.

## 2. Dados: reais, não fictícios, e a rede bloqueada no meio do caminho

Princípio 1 do `CLAUDE.md` proíbe inventar propriedade de material. Nove
materiais (três metais, dois compósitos, dois polímeros, uma cerâmica, um
elastômero) precisavam de densidade e módulo de Young **reais**, não
fabricados. `WebFetch` para as fontes candidatas (MIT OpenCourseWare, en.wikipedia.org)
retornou `EGRESS_BLOCKED` — a política de rede deste ambiente não permite
essas requisições — em três domínios diferentes; só `WebSearch` (que devolve
um resumo sintetizado, não a página inteira) funcionou. As cifras finais
vieram desses resumos, cross-checadas entre duas a três buscas independentes
por material, e o documento (§3 abaixo) registra essa limitação em vez de
escondê-la atrás de uma citação com precisão que a própria coleta não tinha.

## 3. Execução real, não simulada

Servidor subido localmente contra um banco limpo (`alembic upgrade head` +
seed), autenticado pela mesma sessão fixa que o Playwright usa
(`ENVIRONMENT=development` + `E2E_SESSION_TOKEN`, sem bypass exposto por
rota nenhuma — mecanismo documentado em `docs/CLAUDE.md §5`, não um atalho
novo). Sequência real, via HTTP: upload → validação → commit da planilha
(`docs/estudo-de-caso/materiais-haste-leve-rigida.csv`) → `POST
/selection/run` (restrições + índice + ranking) → `POST /selection/studies`
(salvar) → exportação do relatório e do laudo. As sugestões automáticas de
coluna da importação acertaram as nove colunas sozinhas — a mesma
funcionalidade cujo bug de hífen/underscore a suíte A4 corrigiu numa sessão
anterior, funcionando corretamente aqui.

O resultado bateu exatamente com o previsto: CFRP em primeiro (35,3), os três
metais estruturais num platô de 1,8% entre si (25,48–25,93), a cerâmica
excluída pela restrição de fragilidade apesar de ter, de longe, o melhor
índice bruto (100,0, quase 3× o CFRP). Os três pontos que o exemplo do
tirante existe para ilustrar, reproduzidos por uma execução real, não
citados de memória.

A auditoria (M2, sessão anterior) registrou o próprio `POST
/selection/studies` deste estudo — a primeira vez que a trilha gravou algo
fora dos próprios testes que a exercitaram.

## 4. O que foi criado

- `docs/estudo-de-caso/` — a planilha real (não o `sample-data/` fictício), um
  `README.md` com as fontes, e `evidencias/` com as respostas reais da
  aplicação (JSON do `/selection/run`, relatório de seleção e laudo em HTML,
  relatório em CSV) — nada composto à mão fora da aplicação.
- `docs/12-estudo-de-caso.md` — o roteiro: caso escolhido, enunciado no
  formato Função/Restrições/Objetivo/Variáveis livres, dados e fontes (com a
  ressalva de precisão do §2 acima), execução real, resultado, comparação
  com a literatura em três pontos verificáveis, limitações, como reproduzir.
- `app/tests/test_case_study.py` — a mesma planilha embutida (mesmo padrão
  que `test_imports_api.py` já usa para sua própria fixture), a mesma
  seleção, e a asserção de que a ordenação e o platô dos metais se repetem a
  cada execução da suíte — a verificação do item 2.6/6 da proposta vira
  regressão de CI, não só um resultado manual documentado uma vez.

## 5. Verificação

`pytest` (632 testes, +2 desta sessão), `ruff check` e `black --check`
verdes. Sem verificação de frontend — o caso é inteiramente backend/API,
como o pedido original de A2 já era.

## 6. O que continua em aberto

Do backlog: M1 (triagem de licenciamento) e a sessão de teste de usabilidade
do §3.5 — esta última é a única pendência do trabalho como um todo que não é
código e não pode ser fechada por quem programa sozinho.

---

# Sessão 5 — 21/08/26 — Auditoria (M2) e a instalação do ambiente de assistente

Ponto de partida: `d20e7df` (fim da sessão 4 registrada aqui). Testes de
backend: 617 → 630. Testes de frontend: 148 (inalterado — o pedido era só de
backend).

> **A contagem de partida não bate com o fim da sessão 4** (591, não 617) — a
> diferença (26 testes) veio de trabalho entre as duas sessões que não ganhou
> uma seção própria neste arquivo (a autenticação A5, [D-42](DECISIONS.md), já
> estava em produção no início desta sessão). Registrado aqui para quem for
> reconciliar os números depois; não investigado nesta sessão, que tratava de
> outro assunto.

## 0. Ambiente do assistente

Sessão iniciada num container novo, sem nada instalado além do Claude Code em
si. Antes do trabalho de código, os três marketplaces e os dois plugins de
[`docs/CLAUDE_SETUP.md`](CLAUDE_SETUP.md) foram reconectados
(`claude-plugins-official`, `superpowers-dev`, `thedotmack`;
`superpowers@superpowers-dev`, `claude-mem@thedotmack`), e o gstack foi
clonado e instalado. A receita documentada (clonar em `~/.agents/skills/gstack`)
não registra as skills onde este ambiente as espera: qualquer diretório
literalmente chamado `skills/` faz o instalador do gstack tratar a instalação
como "já dentro de um diretório de skills" e symlinkar os comandos *ao lado*
do clone em vez de para dentro de `~/.claude/skills/`, então em
`~/.agents/skills/gstack` os comandos foram parar em `~/.agents/skills/*` —
onde o Claude Code deste ambiente não os enxerga. Clonar direto em
`~/.claude/skills/gstack` (mesmo nome de diretório final, container diferente)
ativa o mesmo caminho de código de um jeito que resolve para o lugar certo. À
parte disso, o instalador tenta baixar seu próprio Chromium via Playwright
para a função `/browse`; a rede deste ambiente bloqueia esse host
(`cdn.playwright.dev`) e o instalador, sem tratamento de erro nesse trecho,
aborta antes de chegar ao passo que registra as skills — contornado
comentando as duas chamadas de instalação do Chromium no script (o ambiente
já tem um Chromium próprio em `/opt/pw-browsers`, só não na revisão que este
Playwright vendorizado espera). Nenhuma mudança de projeto — só do ambiente do
assistente, fora do repositório.

## 1. O pedido e a escolha do que atacar

O pedido desta sessão foi genérico — "leia a documentação, baixe as skills do
projeto, continue de onde parou" — sem apontar qual pendência. `TODO.md`
listava quatro itens de peso comparável e natureza bem diferente: A2 (estudo
de caso, exige curar dado real citável — julgamento de domínio), a sessão de
teste de usabilidade do §3.5 (exige pessoas reais, não pode ser feita por um
agente), M1 (triagem de licenciamento) e M2 (auditoria, com dependência já
satisfeita por A5, spec autocontida, zero dependência de dado externo).
Perguntado, o usuário escolheu M2 — o item mais adequado a uma sessão autônoma
de uma vez só, e o único das quatro pendências que não dependia de julgamento
de domínio ou de um humano fora do teclado.

## 2. O que foi implementado

`AuditEvent` (`app/models/audit.py`, migration `d063cad4ae8b`): quem mudou o
quê e quando, para as entidades que uma pessoa edita à mão — material, classe,
propriedade, índice de desempenho e estudo de seleção.

- **Retrato, não junção viva.** `user_email`/`entity_label`/`project_id` são
  capturados no momento do evento, não lidos de uma junção em tempo de
  leitura — sobrevivem à conta, à entidade ou ao estudo desaparecerem depois.
  É a mesma lógica de proveniência que já vale para `material_property_value`
  (princípio 4 do `CLAUDE.md`), aplicada a "quem fez isto".
- **`changes` é um diff, não um dump.** Só os campos que de fato mudaram
  (`app/services/audit_service.diff_fields`) — um `PATCH` de um campo não
  imprime os outros dez inalterados, e um `PATCH` que não muda nada não grava
  evento nenhum.
- **A troca de valores de propriedade vira um diff por slug**, não um evento
  por linha — `PUT .../values` já é "substitua o conjunto inteiro", e a
  proveniência de cada valor já é rastreada à parte por linha.
- **A importação em lote fica de fora, de propósito.** `ImportService` monta
  `Material` diretamente (`app/importers/service.py`), sem os métodos
  públicos de `MaterialService` onde o `record_change` está — `ImportJob` já é
  a trilha desse fluxo, e auditar por linha um commit de milhares seria ruído.
- **`GET /api/audit`** lista por `entity_type`/`entity_id`, paginado, sob a
  mesma fronteira de projeto de todo endpoint de estudo — catálogo visível a
  qualquer usuário logado, `selection_study` só ao dono, inclusive depois de
  excluído (é exatamente o retrato de `project_id` que torna isso possível).

Quatro serviços (`MaterialService`, `TaxonomyService`, `PropertyService`,
`SelectionService`) ganharam um `user: User | None = None` no construtor,
todo roteador que os instancia passou a repassar o usuário logado, e
`AuditRepository`/`audit_service.record_change` fazem a escrita — sempre antes
do `commit()` do próprio serviço, para que o evento nunca fique numa
transação diferente da mudança que descreve.

Decisão registrada em [D-43](DECISIONS.md), com as alternativas descartadas
(dump completo em vez de diff, evento por linha de valor, filtro de
privacidade por junção viva, cobrir a importação).

## 3. Correções incidentais

Duas classes de repositório não tinham `flush()` (`PropertyDefinitionRepository`)
ou não seguiam o padrão de outras (mesmo método, só faltando) — descobertas
pelos próprios testes de auditoria ao precisar do `id` do objeto recém-criado
antes do `commit()`. Corrigidas junto, sem afetar nenhum comportamento
existente.

## 4. Verificação

`pytest` (630 testes, +13 desta sessão), `ruff check` e `black --check`
verdes; `alembic upgrade head` + `python -m app.db.seed` num banco limpo (o
mesmo portão que a CI roda). `test_audit.py` cobre: evento por ação e por tipo
de entidade; diff correto por campo e por slug de propriedade; nenhum evento
numa atualização sem mudança real; exclusão duas vezes grava um único
`EXCLUIDO`; um usuário não vê o estudo de outro nem por id nem numa listagem
mista; o dono continua vendo a exclusão do próprio estudo depois dela
acontecer; a importação em lote não grava evento de material. Sem verificação
de frontend — o pedido era só de backend, e nenhuma tela consome `GET
/api/audit` ainda (fica para quando houver pedido de interface para isto).

## 5. O que continua em aberto

Da Fase 7, só a arquitetura para PPTX (B2, baixa prioridade, fora de escopo
salvo pedido). Do trabalho como um todo: a sessão de teste de usabilidade do
§3.5 (nenhuma foi realizada), o estudo de caso didático completo (A2) e a
triagem de licenciamento (M1) — nenhum dos três é código que um agente possa
fechar sozinho numa sessão como esta.

---

# Sessão 4 — 11/08/26 a 12/08/26 — Fase 9 e a varredura que a fechou

Ponto de partida: `7c1d59f` (Fase 6 com provedores reais). **61 arquivos
alterados, +6.512 / −771** nos commits da Fase 9, mais a varredura de
fechamento. Testes de backend: 436 → 591. Testes de frontend: 123 → 141.

O pedido da Fase 9 tinha **seis frentes** — IA gratuita, barra lateral,
repaginação mais colorida e arredondada, painéis interativos, mapas
personalizáveis e laudo de engenharia completo. As seis saíram. Depois veio um
segundo pedido, de natureza diferente: *"verifique todas as fases, quero tudo
redondo, sem travar e consumindo menos máquina"* — uma varredura, não uma
funcionalidade.

## 1. A Fase 9

| Frente | O que entrou | Decisão |
|---|---|---|
| IA gratuita | provedor `openai-compat` (Groq, Ollama, OpenRouter, OpenAI) | [D-36](DECISIONS.md) |
| Barra lateral | `AppSidebar`, fixa em `lg`, gaveta abaixo, recolhível a 76 px | [D-37](DECISIONS.md) |
| Repaginação | paleta azul, forma e movimento como token | [D-38](DECISIONS.md) |
| Painel | cobertura, composição, ranking de lacunas, box-plot | [D-39](DECISIONS.md) |
| Mapas personalizáveis | um eixo do mapa pode ser um índice, não só uma propriedade | [D-40](DECISIONS.md) |
| Laudo | documento à parte, com figura do backend e interpretação da IA | [D-41](DECISIONS.md) |

Duas escolhas se repetem nessas seis e valem por si: **o backend passou a
desenhar figuras** (`app/exporters/figures.py`), porque um laudo que abre
offline anos depois não pode depender de uma captura de tela; e **quartis,
percentuais e escores continuaram no backend** (ADR 0004), mesmo quando o
consumidor é um gráfico.

## 2. A varredura de fechamento

Ela encontrou três defeitos de travamento, e nenhum deles aparecia nos testes:

| O que | Sintoma | Correção |
|---|---|---|
| `normalize_column` vetorial | acima de ~1e154 a soma de quadrados estourava e **todo material virava 0,0** — um empate silencioso, não um erro | `math.hypot`, que reescalona internamente |
| `to_canonical` | um erro de digitação comum (`"m**"`, `"(m"`, `"$"`) escapava do pint como `AssertionError`/`TokenError` e virava **HTTP 500** | as três exceções passaram a ser tratadas juntas — elas não têm base comum |
| Unidade patológica | `'m**9**9**9'`, dez caracteres, **prende um núcleo indefinidamente**: o pint interpreta unidade *avaliando* aritmética | guarda por forma nas duas portas de entrada; nem limite de tamanho nem de expoente sozinho resolvem, e `^` também é potência |

E dois de desempenho, ambos medidos antes e depois — os números estão em
[PROJECT_CONTEXT.md §12](PROJECT_CONTEXT.md): o Plotly completo (4,5 MB, 79% de
todo o JS) virou um bundle à la carte de cinco traços, e `parse()` de expressão
passou a ser memoizada, o que tirou 80% do custo de avaliar um índice por
material.

**O que a auditoria alegou e a medição desmentiu** importa tanto quanto o que
ela acertou: `ANALYZE` deixa o `overview` 85% **mais lento**; índices de
cobertura mais largos rendiam 13% por +33% de arquivo; o `DashboardService` não
tinha N+1 nenhum; e o `.env.example` já estava completo. Nada disso foi
aplicado, e o motivo ficou escrito para ninguém tentar de novo.

## 3. O que continua em aberto

Da Fase 7: PPTX, testes end-to-end, autenticação e auditoria. Do §3.5 da
proposta: **nenhuma sessão de teste com usuários foi realizada** — o
`11-usabilidade.md` está instrumentado e a tabela de melhorias dele continua
vazia. E as figuras da monografia que são capturas de `/estilo` precisam ser
refeitas depois de D-38.

---

# Sessão 3 — 11/08/26 — Os provedores reais da camada de IA

Ponto de partida: `9bd935e` (Fase 8 concluída). Ponto final: `7c1d59f`.

**23 arquivos alterados, +2.227 / −79.** Testes de backend: 391 → 436.
Testes de frontend: 123 (inalterado).

O pedido foi: *"desenvolva toda a camada de IA opcional; quero que a IA seja do
meu próprio Claude"*. "Meu próprio Claude" é ambíguo entre a API da Anthropic
com chave própria e o Claude Code já instalado e autenticado na máquina.
**Foram implementados os dois**, atrás da mesma interface e sem perguntar —
qualquer uma das leituras fica atendida, e a diferença entre elas virou uma
variável de ambiente.

## 1. Commits

| Commit | O que |
|---|---|
| `f98c772` | `docs:` CLAUDE.md e PROJECT_CONTEXT.md param de descrever um projeto que já mudou |
| `6917af3` | `feat(fase 6):` a camada de IA passa a falar com o Claude do usuário, sem mudar de forma |
| `9e5209a` | `fix(fase 6):` o cliente injetado do claude-api não pode depender do SDK que ele existe para dispensar |
| `7c1d59f` | `docs:` a contagem de testes acompanha os testes que a correção trouxe |

PR [#7](https://github.com/Streeft/MaterialSelect-AI/pull/7), com os três checks
obrigatórios verdes.

## 2. Funcionalidades criadas

### Dois provedores reais, um contrato inalterado

| `AI_PROVIDER` | Provedor | Autenticação | Determinístico |
|---|---|---|---|
| `mock` (padrão) | simulado, sem rede | — | **sim** |
| `claude-api` | API da Anthropic | `AI_API_KEY` / `ANTHROPIC_API_KEY` | não |
| `claude-cli` | o Claude Code da máquina | a assinatura já autenticada | não |

- `ai/prompts.py` — os prompts em português e os esquemas JSON compartilhados
  pelos dois provedores reais. O esquema enumera **os slugs do catálogo**, então
  o modelo escolhe de uma lista fechada em vez de escrever texto livre.
- `ai/claude_base.py` — a metade sem transporte: monta o pedido, lê a resposta,
  e reconstrói cada índice a partir do catálogo.
- `ai/claude_api.py` — transporte por `client.messages.create(...)` com
  `output_config` de `json_schema`. Sem `temperature` e sem prefill (ambos são
  400 nos modelos atuais); sem campo de *thinking* (adaptativo por padrão).
- `ai/claude_cli.py` — transporte por `claude --print --output-format json
  --json-schema ...`. O enunciado viaja por **stdin**, nunca por argv;
  `shell=False`; `cwd` num diretório temporário.
- `ai/caveats.py` — as ressalvas obrigatórias, extraídas do `mock` para serem
  compartilhadas.
- `AIService`, `guardrails`, `schemas` e a interface **não mudaram**. É essa a
  demonstração de que a camada é mesmo opcional e substituível.

### Duas garantias que viraram estruturais ([D-35](DECISIONS.md))

Não são checagens feitas depois. São campos que o modelo **nunca recebe**:

1. **O modelo escolhe um índice pelo slug.** Nome, expressão e objetivo vêm do
   catálogo depois. O campo da expressão não existe no esquema enviado — não há
   como inventar uma.
2. **As ressalvas da explicação são do backend.** O campo não existe no esquema
   — não há como omiti-las.

Slug desconhecido **passa adiante de propósito**, para o guardrail o recusar em
voz alta. Filtrar ali seria mais limpo e pior: o usuário nunca veria que algo
foi recusado.

### Interface

`AIAssistPanel` passa a distinguir "Provedor simulado" de "Modelo externo:
`<provedor>`", e o aviso ganha a frase que faltava — a leitura pode variar entre
execuções com o mesmo enunciado; o cálculo não, porque não passa por ali.

### Dependência

`anthropic` entra como **extra opcional** (`pip install -e ".[ai]"`). A CI
instala só `.[dev]` e não importa o SDK em nenhum caminho — verificado com
`'anthropic' in sys.modules` depois de `import app.main`.

## 3. Correções

| # | Defeito | Como apareceu |
|---|---|---|
| 1 | **Nome de material não entrava na ancoragem numérica.** `_result_context` nunca incluía os nomes no conjunto de termos permitidos. Com o catálogo de demonstração nada quebrava — nenhum nome tem dígito. Com um catálogo real, escrever "Aço AISI 1020 lidera" descartaria a explicação inteira com HTTP 400. | Revisão do próprio código, ao escrever o provedor real. |
| 2 | **O cliente injetado do `claude-api` dependia do SDK que ele existe para dispensar.** `_complete` importava `anthropic` na primeira linha, antes de olhar para o cliente. O comentário do `__init__` prometia por escrito que a injeção funcionava sem o pacote; não funcionava. | **Só na CI.** Aqui o pacote está instalado e os quatro testes passavam; na CI, que instala só `.[dev]`, falharam os quatro. |
| 3 | **Contagem de testes errada na documentação.** Os documentos diziam 389 backend / 44 frontend quando o repositório tinha 391 / 123 — a Fase 8 acrescentara 79 testes de frontend sem que o número fosse atualizado. | Conferência antes de reescrever o contexto. |

O defeito 2 rendeu a regra que vale a pena guardar: **um extra opcional só é
realmente opcional se algum teste rodar sem ele.** A correção inverteu a ordem
(cliente primeiro, que é o único passo que precisa do pacote e portanto o lugar
certo do erro que manda instalá-lo) e passou as classes de exceção por um
`_error_types()` que devolve um substituto inerte quando o SDK está ausente —
sem SDK não há exceção de SDK para traduzir, e o que o cliente levantar chega ao
chamador como está. Três testes novos fixam isso com `None` em `sys.modules`,
que é o que o CPython trata como módulo ausente.

## 4. Verificação

Além dos portões, **verificação ao vivo no navegador** com `claude-cli`:

- Enunciado com "no mínimo 300 °C" e "no máximo 3 g/cm3" → os dois números
  **copiados sem conversão**, com o trecho do enunciado citado como evidência;
  índices com as expressões do catálogo; `rejected` vazio.
- O mesmo enunciado **sem unidade** ("no mínimo 300") → **nenhuma restrição** e
  uma pergunta em aberto pedindo a unidade. A regra 4 do guardrail obedecida por
  um modelo que nunca viu o código.

**`claude-api` não foi exercitado contra a API real** — não havia chave no
ambiente. Ele foi testado contra um cliente falso, e a limitação está registrada
em [D-35](DECISIONS.md) e no §9 do [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## 5. Decisões

[D-35](DECISIONS.md) — O provedor real escolhe por slug; a expressão e as
ressalvas nunca são dele.

## 6. Documentação

Atualizados: `CLAUDE.md` (raiz), `docs/CLAUDE.md`, `PROJECT_CONTEXT.md`,
`ARCHITECTURE.md`, `09-camada-ia.md`, `DECISIONS.md`, `README.md`,
`.env.example` e este arquivo.

---

# Sessão 2 — 05/08/26 a 10/08/26 — Fase 7 parcial, CI obrigatória e Fase 8

> **Seção reconstruída** a partir do `git log`, do `DECISIONS.md` e do
> `REDESIGN.md`. Não foi escrita durante a sessão, e por isso registra o que
> ficou no repositório, não como se chegou lá.

Ponto de partida: `2e70162`. Ponto final: `9bd935e`.

**116 arquivos alterados, +14.458 / −2.865.** Testes de backend: 362 → 391.
Testes de frontend: 44 → 123.

## 1. Commits

| Commit | O que |
|---|---|
| `ef0844d` | `docs:` checkpoint completo para reinício de contexto |
| `c008967` | `feat(fase 7):` relatório HTML imprimível e unicidade de valor por propriedade |
| `b9fa644` | `fix(fase 7):` ausência não vira palpite — nem em número, nem em rótulo |
| `a474e39` | `chore(ci):` torna os checks obrigatórios em `main` e registra o que isso custou |
| `24e2003` | Merge PR #5 |
| `9bd935e` | `feat(fase 8):` redesign da interface (#6) |

## 2. Fase 7 — relatório imprimível

- `exporters/html.py` — o mesmo modelo `Report` da planilha, renderizado como
  HTML de impressão. Escape por `html.escape` em todo valor, cabeçalho, título e
  nota, servido sob `Content-Security-Policy: default-src 'none'`.
- **O escape é por formato e não é intercambiável** — um `=` é inerte em HTML, e
  o apóstrofo da planilha apareceria na tela como corrupção do dado.
- Unicidade de valor por propriedade no banco.
- [D-20](DECISIONS.md) — HTML imprimível em vez de biblioteca de PDF.
- [D-21](DECISIONS.md) — campo opcional não preenchido continua `NULL`, nascida
  do defeito em que um rótulo defaultado imprimiu `__index__` no relatório e uma
  direção defaultada inverteu o ranking de um estudo salvo.

## 3. CI obrigatória

`scripts/protect-main.ps1` aplica a *ruleset* que faz o GitHub **recusar** o
merge sem os três checks. Sem ator de exceção — vale para o dono do repositório.
[D-22](DECISIONS.md) registra o custo: o repositório teve de virar público, e a
lista de nomes de job na ruleset passou a ser um acoplamento que precisa ser
mantido à mão.

## 4. Fase 8 — redesign da interface

O maior bloco da sessão: 89 arquivos de frontend. Um **sistema de design
próprio**, sem biblioteca de componentes.

- `components/ui/` — 19 primitivas novas (Button, Card, Field, Table, Tabs,
  Dialog, Popover, Alert, Badge, Stepper, ThemeToggle, DataQualityBadge,
  ProvenancePopover, focusTrap, icons…), com barril `index.ts`.
- `app/estilo/page.tsx` — o espécime vivo do sistema, de onde saem as figuras da
  monografia.
- `app/globals.css` + `tailwind.config.ts` — a paleta inteira como tokens
  `"R G B"`, lidos pelo Tailwind e, em runtime, por `lib/design/palette.ts`.
- `components/layout/AppHeader.tsx` — navegação agrupada por tarefa.
- `app/routes.a11y.test.tsx` — acessibilidade medida com axe em todas as rotas.
- `docs/REDESIGN.md` e `docs/11-usabilidade.md`.

Decisões [D-23](DECISIONS.md) a [D-34](DECISIONS.md). As de maior consequência:

- **D-23** — sistema de design próprio, sem biblioteca de componentes.
- **D-24** — qualidade do dado em três canais, nunca só cor; ausência nunca é
  `0`, `—` nem célula vazia.
- **D-28** — uma paleta só, compartilhada entre interface e gráfico.
- **D-30** — todo número na tela usa a convenção do pt-BR.
- **D-31** — a alternativa textual de um gráfico é a tabela que o originou.
- **D-34** — a borda de um controle é informação, não moldura (WCAG 1.4.11).

## 5. O que ficou pendente

`docs/11-usabilidade.md` ficou **instrumentado e vazio**: nenhuma sessão de
teste com usuários foi realizada. Enquanto a tabela de melhorias dele estiver
vazia, o §3.5 da proposta não foi cumprido.

---

# Sessão 1 — 30/07/26 a 04/08/26 — Fases 5 a 7

Ponto de partida: `8dbbd62` (Fase 4 concluída). Ponto final: `2e70162`.

**96 arquivos alterados, +9.593 / −372.** Testes de backend: 169 → 362.
Testes de frontend: 13 → 44.

## 1. Commits

| Commit | O que |
|---|---|
| `a1ea56d` | Fase 5: visualização (mapas de Ashby, linhas de índice, comparador) |
| `7dd7e68` | Fase 6: camada de IA desacoplada e painel de assistência |
| `3e27604` | Merge PR #1 |
| `bbea0ad` | Formatação do backend inteiro com black |
| `9522e4a` | CI no GitHub Actions |
| `8757872` | Actions para runtime Node 24; app para Node 22 |
| `94d6022` | Merge PR #2 |
| `a7cc413` | Correção: unidade explícita em limiar dimensionado (IA) |
| `29f95f9` | Merge PR #3 |
| `6be4664` | Fase 7 (1/n): exportação CSV/XLSX com relatório auditável |
| `2e70162` | Merge PR #4 |

> O commit da Fase 6 (`7dd7e68`) **não segue** o padrão `Fase N:` dos demais.
> Isso já causou a impressão de que a fase tinha sido pulada. Registrado aqui
> para quem for ler o `git log`.

## 2. Funcionalidades criadas

### Fase 5 — Visualização

**Backend**
- `calculations/powerlaw.py` — reescreve o índice como monômio `C·Πp^e` e
  **deriva** a inclinação log-log `−a/b`. `E/ρ`→1, `E^(1/2)/ρ`→2, `E^(1/3)/ρ`→3.
  Rejeita, com o motivo, o que não é lei de potência.
- `domain/geometry.py` — fecho convexo (monotone chain) dos envelopes.
- `calculations/performance.py` — avaliação de índice compartilhada entre seleção
  e mapas, com teste garantindo que concordam.
- `calculations/units.py` — `to_canonical_delta` para converter **diferenças**.
- `services/chart_service.py`, `schemas/charts.py`,
  `repositories/chart_repository.py`, `routers/charts.py`.
- `domain/ranking.py` — `normalize_column` tornada pública e reutilizada.

**Frontend**
- `/mapas` — eixos, escala, filtro por classe, envelopes, barras de erro,
  rótulos, linha de índice por material ou valor livre, exportação PNG/SVG.
- `/comparar` — tabela, barras, radar, coordenadas paralelas, heatmap.
- `lib/charts.ts`, `components/charts/AshbyMap.tsx`, `ComparisonView.tsx`.
- `types/plotly-dist.d.ts`.

### Fase 6 — Camada de IA

- `ai/provider.py` — interface estreita; o provedor recebe só catálogo e texto.
- `ai/mock.py` — provedor simulado **determinístico**, sem chave e sem rede.
- `ai/guardrails.py` — as regras executáveis.
- `ai/factory.py`, `schemas/ai.py`, `services/ai_service.py`, `routers/ai.py`.
- Frontend: `AIAssistPanel.tsx` (revisão opt-in item a item, incluindo o que os
  guardrails recusaram) e `StudyExplanation.tsx`.

### Fase 7 — Exportação

- `exporters/cells.py` — neutralização de injeção de fórmula.
- `exporters/report.py` — modelo do relatório e avisos obrigatórios.
- `exporters/spreadsheet.py` — CSV e XLSX.
- `services/export_service.py` — relatório de estudo em 9 abas e do catálogo.
- `routers/exports.py`, `components/ExportButtons.tsx`.

### Infraestrutura

- `.github/workflows/ci.yml` — backend em matriz 3.11/3.12 (`ruff`,
  `black --check`, `pytest`, `alembic upgrade` + seed) e frontend (`npm ci`,
  `typecheck`, `lint`, `test`, `build`).
- `.claude/launch.json` e `.claude/settings.local.json` (este último ignorado).

## 3. Correções

| # | Defeito | Como apareceu |
|---|---|---|
| 1 | **Isolamento de testes quebrado.** pysqlite emite BEGIN sozinho e nunca antes de SAVEPOINT; um teste que começasse por escrita escapava do rollback e vazava para todos os seguintes. A suíte ficava verde perdendo isolamento em silêncio. | Ao adicionar um teste cuja primeira instrução era um POST. |
| 2 | **Dados do usuário sem escape no hover do Plotly.** Nomes de material vêm de planilhas importadas e eram interpolados crus em texto que o Plotly renderiza como rich text. | Revisão do próprio código. |
| 3 | **Unidade nula virando canônica na IA.** "no mínimo 300 graus C" saía com `unit: null` e virava ≥ 300 K, isto é −173 °C: nenhuma restrição. Os quatro guardrails existentes não pegavam. | Demonstração ao vivo dos endpoints. |
| 4 | **`prettyUnit` renderizava `** 2.5` como `·· 2.5`** nas dimensões derivadas. | Conferência da tela no navegador. |
| 5 | **Rótulos de eixo colidindo no comparador.** Duas propriedades com o mesmo símbolo viravam a mesma categoria no Plotly e as séries se fundiam em silêncio. | Revisão do próprio código. |
| 6 | **Reta de índice vertical exigia intervalo positivo em X** que ela não usa. | Revisão do próprio código. |

Todos com teste de regressão. Vale notar que **os defeitos 3 e 4 só apareceram
ao abrir o navegador** — nenhum teste os pegava.

## 4. Melhorias e refatorações

- **Formatação:** backend inteiro passado pelo black (32 arquivos), em commit
  próprio, para viabilizar `black --check` como portão de CI.
- **Avaliação de índice extraída** para `calculations/performance.py`, eliminando
  a duplicação entre seleção e mapas.
- **`normalize_column` tornada pública** e reutilizada pelo comparador, para que
  barra e escore não possam divergir.
- **Envelopes deixaram de refazer requisição** ao alternar o checkbox — passaram
  a ser filtro de exibição.
- **Níveis numéricos de índice ligados na interface**, usando capacidade da API
  que já existia e estava sem uso.
- **Actions atualizadas** para runtime Node 24 e app para Node 22.

## 5. Decisões tomadas nesta sessão

Registradas em [DECISIONS.md](DECISIONS.md): ADR 0004 e as decisões D-08 a D-19.
As de maior consequência:

- **Geometria de gráfico é cálculo** (ADR 0004).
- **Todo número da IA tem de aparecer no enunciado** (D-08) — rejeita até
  conversão correta.
- **Limiar dimensionado tem de declarar unidade** (D-09) — nasceu do defeito 3.
- **Coordenadas paralelas sem `parcoords`** (D-12) — porque ele não expressa
  ausência.
- **Escape de fórmula visível, não destrutivo** (D-13).
- **Exportador reexecuta o pipeline** (D-14).

## 6. Documentação

Criados: `08-visualizacao.md`, `09-camada-ia.md`, `10-relatorios.md`,
`adr/0004-geometria-de-graficos-no-backend.md` e, neste checkpoint,
`PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `TODO.md`,
`DECISIONS.md` e este arquivo.

Atualizados: `CLAUDE.md` (raiz), `README.md`, `02-arquitetura.md`,
`04-metodologia-selecao.md`, `backlog.md`.

## 7. Processo

Quatro PRs, todos com CI verde a partir do #2 (que criou a CI):

| PR | Conteúdo | Merge |
|---|---|---|
| #1 | Fases 5 e 6 | `3e27604` |
| #2 | CI + formatação | `94d6022` |
| #3 | Correção de unidade na IA | `29f95f9` |
| #4 | Fase 7: exportação | `2e70162` |

Também nesta sessão: `main` publicado no remote e definido como branch padrão
(antes o `HEAD` apontava para `fase-5-visualizacao`), e o GitHub CLI instalado e
autenticado.

**Branches mescladas ainda existentes** (local e remoto): `fase-5-visualizacao`,
`fase-7-ci`, `fase-6-unidade-explicita`, `fase-7-relatorios`. Podem ser
removidas.
