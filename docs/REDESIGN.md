# Prompt — Redesign de interface do MaterialSelect AI

> Cole este texto inteiro no Claude Code, na raiz do repositório
> `MaterialSelect-AI`. Ele pressupõe o estado do branch `fase-7-relatorio-html`.

---

## 0. Antes de escrever qualquer código

Leia, na ordem: `CLAUDE.md` (raiz), `docs/CLAUDE.md`, `docs/PROJECT_CONTEXT.md`,
`docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/04-metodologia-selecao.md`,
`docs/08-visualizacao.md`, `docs/TODO.md`. Depois abra a aplicação
(`preview_start`) e percorra as oito rotas antes de propor qualquer coisa.

Este trabalho é o Trabalho de Diplomação em Engenharia de Materiais de Francisco
de Almeida Lemos (UFRGS, 2026/2, orientador Prof. Felipe A. L. Sánchez). A
proposta aprovada é a régua: onde este prompt cita "§3.1", "§4.1", refere-se às
seções da proposta, reproduzidas na seção 2 abaixo.

---

## 1. Seu papel

Você é o **designer de interface e de interação** deste produto, não um
aplicador de tema. O público é **estudante de graduação em Engenharia de
Materiais** usando a ferramenta pela primeira vez, provavelmente numa aula, com
prazo, possivelmente no notebook pequeno ou no celular.

O critério de sucesso não é "ficou bonito". É:

1. **Um estudante que nunca viu a ferramenta consegue ir do enunciado ao
   relatório sem ajuda.** Este é o roteiro didático que a proposta cobra como
   entrega (§4.1).
2. **Cada número na tela diz de onde veio.** Rastreabilidade é a tese do
   trabalho; se ela não é visível, ela não foi demonstrada.
3. **A interface sobrevive ao teste de usabilidade com estudantes** que a
   proposta exige (§3.5), cujos resultados vão para a monografia.

Elegância aqui é **contenção**: é um instrumento acadêmico, não uma landing page
de SaaS. Hierarquia tipográfica clara, espaço em branco generoso, uma cor de
acento, nenhuma decoração que não carregue informação.

---

## 2. Cláusulas da proposta que são obrigações de interface

Estas não são sugestões de design. São compromissos assumidos no documento
aprovado, e **quatro deles a interface hoje não cumpre**:

| § | Compromisso | Estado |
|---|---|---|
| §3.1 | "Cada índice será tratado na ferramenta como um objeto explícito, acompanhado de **hipótese, geometria, objetivo, restrição e dimensão do resultado**, de modo a **evitar sua aplicação fora das condições de validade**" | ❌ **não cumprido** |
| §3.2 | "a ferramenta exibirá a **referência bibliográfica correspondente a cada valor** utilizado, **tanto na interface** quanto nos relatórios exportados" | ⚠️ parcial |
| §3.3 | "dados importados, estimados e ausentes são **distinguidos na interface**" | ⚠️ parcial |
| §3.6 | "essa limitação será exibida **no próprio sistema** e nos relatórios exportados" | ❌ **não cumprido** |
| §1 | "Ao tornar **visível cada etapa do raciocínio** [...] a ferramenta apresenta potencial de uso didático" | ⚠️ parcial |
| §3.5 | "testes de usabilidade com estudantes [...] avaliar a **clareza da apresentação dos critérios**, a **facilidade de operação** e a **utilidade percebida**" | ❌ não iniciado |
| §4.1 | "ao menos um **roteiro de uso didático completo**, do enunciado do problema ao relatório de seleção" | ❌ não iniciado (item A2 do TODO) |

**Comece por elas.** Um redesign que deixe as quatro pendências de pé é um
redesign que não serviu ao trabalho.

---

## 3. Diagnóstico do estado atual (medido, não impressão)

Levantamento sobre `apps/web/` — 5.014 linhas de TSX em 8 rotas e 17
componentes:

**Não existe camada de design.**
- `tailwind.config.ts` estende **apenas** `brand`, com 5 tons (50, 100, 500,
  600, 700). Não há 200/300/400/800/900, não há cor semântica (sucesso, aviso,
  perigo, informação), não há escala tipográfica, de espaçamento, de raio ou de
  sombra.
- **Zero componentes de UI reutilizáveis.** Não existe `components/ui/`.
- **639 `className` inline.** O "botão primário" aparece em **7 grafias
  diferentes** — variam `rounded` vs `rounded-lg`, `px-3 py-1.5` vs `px-4 py-2`,
  `text-xs` vs `text-sm`, `disabled:opacity-50` vs `60` vs ausente.
- 48 `<button>` e 72 controles de formulário, todos estilizados à mão. Em
  `app/selecao/page.tsx` há uma constante local `inputClass` — que existe só
  naquele arquivo.

**A responsividade é nominal.**
- **14 utilitários responsivos no total** (13 `sm:`, 1 `lg:`) em 5.014 linhas.
- O cabeçalho tem **8 links de navegação** em `flex gap-4` sem nenhum tratamento
  para telas estreitas: no celular eles estouram ou espremem.
- 12 `<table>` para 10 wrappers de rolagem — e tabelas de proveniência com 8–9
  colunas.

**Não há tema escuro.** Zero utilitários `dark:`; `globals.css` fixa
`color-scheme: light`.

**Acessibilidade não auditada.** 25 `aria-label`, 9 `role`, 5 `aria-pressed`,
nenhum teste automatizado. O item M3 do TODO (axe/Lighthouse) segue aberto.

**A home não orienta ninguém.** `app/page.tsx` tem 37 linhas: um título, o aviso
de dados demonstrativos, um botão para o catálogo e três cartões estáticos de
texto. Não há caminho para o método, nem lista de estudos salvos.

**A pendência mais séria não é estética.** `PerformanceIndex.assumptions`
(`função`, `geometria`, `objetivo`, `restrição`, `referência`) existe no modelo,
é preenchido pelo seed para os cinco índices e está no contrato de tipos
(`lib/types.ts:412`) — e **não é renderizado em lugar nenhum**. O seletor de
índice mostra `{i.name} — {i.expression}` num `<option>`
(`app/selecao/page.tsx:376`, `app/mapas/page.tsx:249`).

Consequência prática: **nada impede um estudante de aplicar `E^(1/2)/ρ` — índice
de viga em flexão — a um tirante sob tração**, que é exatamente o erro que §3.1
diz que a ferramenta vai evitar. E `docs/04-metodologia-selecao.md:25` afirma que
"o sistema exibe essas hipóteses junto de cada índice": a documentação descreve
um comportamento que não existe. Corrija o código, não a documentação.

---

## 4. Invioláveis (ler antes de tocar em qualquer arquivo)

Estão em `CLAUDE.md` e `docs/CLAUDE.md`. Os que um redesign ameaça:

- **Nenhum cálculo em componente React.** Inclinação de linha de índice,
  envelopes, escores normalizados e dimensões vêm prontos do backend
  (ADR 0004). Tema de gráfico é apresentação e pode viver no frontend;
  **geometria não**.
- **Dado ausente nunca vira zero, nem célula vazia, nem traço ambíguo.** Toda
  lacuna é rotulada. Heatmap com `hoverongaps: false`, coordenadas paralelas com
  `connectgaps: false`, radar que omite o material e **diz quem omitiu**. Um
  redesign de tabela que troque "ausente" por "—" quebra o princípio nº 3.
- **Idiomas:** tudo que o usuário lê é **português do Brasil**, via
  `apps/web/lib/i18n.ts`. Identificadores, funções, comentários e docstrings em
  **inglês**. Nenhuma string literal em português dentro de JSX — vai para o
  i18n.
- **TypeScript estrito** (`strict` + `noUncheckedIndexedAccess`). Indexar array
  devolve `T | undefined`: trate, não faça cast. Nada de `any`.
- **Contrato duplicado conscientemente:** ao mudar um tipo, edite
  `apps/web/lib/types.ts` **e** `packages/shared-types/index.ts` (D-16).
- **Estados de carregamento, erro e vazio sempre tratados.** Isso já é regra; o
  redesign deve torná-los componentes, não repeti-los.
- **O portão de CI não é informativo.** `npm run typecheck && npm run lint &&
  npm run test && npm run build` tem de passar, e os três checks são
  obrigatórios no GitHub. Rode antes de cada PR.

---

## 5. Entrega A — camada de design

Crie a base que hoje não existe. **Nada de biblioteca de componentes de
terceiros** (shadcn, MUI, Chakra): o projeto tem 12 dependências de produção e
essa contenção é um argumento do trabalho. Tailwind + primitivas próprias.

### A.1 Tokens (`tailwind.config.ts` + variáveis CSS em `globals.css`)

Exponha os tokens **também como variáveis CSS**, porque o Plotly precisa lê-los
para que gráfico e interface não divirjam.

- **Cor de acento:** rampa `brand` completa (50→950). Mantenha o azul atual como
  ponto de partida — é calmo e adequado a um instrumento científico.
  > **Superado.** O acento passou a ser o lima `#C6F91F` do pacote lumimotion,
  > sobre superfícies quase pretas. Ver [D-33](DECISIONS.md). O resto desta
  > seção continua valendo, inclusive a rampa completa e a leitura pelo Plotly.
- **Neutros:** rampa `slate` já usada, formalizada em tokens semânticos
  (`surface`, `surface-raised`, `border`, `text-primary`, `text-secondary`,
  `text-muted`).
- **Semânticas:** `success`, `warning`, `danger`, `info`.
- **Paleta categórica para classes de material** (metais, polímeros, cerâmicas,
  compósitos, naturais): **segura para daltonismo** e distinguível em impressão
  em escala de cinza. Ela é usada nos envelopes do mapa de Ashby, nas legendas e
  nos badges de classe — precisa ser **uma só** em todos esses lugares.
- **Tipografia:** escala modular declarada (não `text-xs` aleatório). Fonte de
  interface: pilha de sistema ou Inter via `next/font` (sem requisição externa em
  runtime).
- **Números:** classe utilitária `tabular-nums`
  (`font-variant-numeric: tabular-nums`) aplicada a **toda** célula numérica.
  Numa ferramenta cujo conteúdo é número, dígito que não alinha em coluna é
  defeito de legibilidade, não preciosismo.
- Raio, sombra, espaçamento e duração de transição como tokens.

### A.2 Primitivas (`apps/web/components/ui/`)

Crie, cada uma com estados de foco, hover, ativo, desabilitado e carregando:

`Button` (variantes `primary`, `secondary`, `ghost`, `danger`; tamanhos `sm`,
`md`; prop `loading`), `IconButton`, `Field` (label + hint + erro + controle,
com `id`/`aria-describedby` ligados), `Input`, `NumberInput`, `Select`,
`Textarea`, `Checkbox`, `RadioGroup`, `Card`, `Badge`, `Alert` (`info`,
`warning`, `danger`, `success`), `Table` (com wrapper de rolagem e cabeçalho
fixo), `Tabs`, `Stepper`, `Tooltip`, `Dialog`, `EmptyState`, `Skeleton`,
`Spinner`.

Adote um helper `cn()` (clsx + tailwind-merge, ou 10 linhas próprias) e
**substitua as 7 grafias do botão primário por uma**.

### A.3 Linguagem visual da qualidade do dado — a assinatura do produto

Esta é a peça central do redesign e atende §3.2, §3.3 e §1 de uma vez.

Crie `components/ui/DataQualityBadge.tsx` e `components/ui/ProvenancePopover.tsx`
cobrindo os quatro estados: **MEDIDO**, **IMPORTADO**, **ESTIMADO**, **AUSENTE**.

Regras:
- **Nunca codifique só por cor.** Cada estado tem ícone + rótulo + cor. Um
  daltônico e uma impressão em preto e branco têm de distinguir os quatro.
- Hoje a proveniência aparece como micro-texto cinza indiferenciado
  (`text-slate-400`) em `components/PropertyGroup.tsx:71-91`: qualidade, fonte e
  condição de medição têm o mesmo peso visual, que é o de ruído. **Um valor
  estimado tem de parecer diferente de um valor medido à primeira vista.**
- O `ProvenancePopover` mostra a trilha completa que o backend já devolve: valor
  original + unidade original → valor normalizado + unidade canônica, **método
  de conversão** (`pint:GPa->Pa`), incerteza, faixa, condição de medição,
  qualidade e **referência bibliográfica da fonte**.
- Aplique em **todos** os pontos onde um número aparece: ficha do material,
  tabela do catálogo, tabela do comparador, tooltip do mapa, tabela de
  candidatos e de contribuições.
- Crie uma **legenda** reutilizável e ponha-a onde há muitos valores.

`AUSENTE` merece regra própria: badge com rótulo textual "ausente", **jamais** um
traço, célula vazia ou zero.

---

## 6. Entrega B — as quatro promessas não cumpridas

### B.1 Cartão de índice com condições de validade (§3.1) — prioridade máxima

Crie `components/selection/IndexCard.tsx`. Quando um índice é escolhido em
`/selecao` ou `/mapas`, mostre, sem exigir clique:

- nome e expressão renderizada de forma legível (`E^(1/2) / ρ`, não
  `sqrt(modulo_young) / densidade` cru — mas **mostre também** a expressão
  literal, que é o que o parser recebeu);
- **função**, **geometria**, **objetivo** e **restrição** vindos de
  `assumptions`;
- **dimensão derivada** do resultado (o backend já a devolve; ela é derivada por
  Pint, não declarada — D-06);
- **referência bibliográfica**;
- quando houver linha de índice, a **inclinação** e o lado favorável;
- quando **não** houver, o motivo que o backend já informa, em texto claro.

Substitua o `<select>` de índices por um seletor que mostre essas hipóteses
**antes** da escolha — um grupo de cartões selecionáveis, não uma lista de
`<option>`. O objetivo declarado em §3.1 é *evitar a aplicação fora das
condições de validade*; uma `<option>` com nome e expressão não faz isso.

Ao criar índice personalizado, deixe as hipóteses editáveis e avise que um índice
sem hipóteses declaradas não pode ser validado quanto ao uso.

### B.2 Aviso de limitação no próprio sistema (§3.6)

O texto canônico está em `apps/api/app/exporters/report.py:23` e hoje só sai nos
arquivos exportados. Acrescente-o ao i18n e exiba:

- no rodapé de toda página (junto do aviso de dados demonstrativos, que já
  existe, sem competir com ele);
- com destaque na tela de **resultados** da seleção e no topo do relatório na
  tela — é ali que alguém pode confundir triagem com conclusão de engenharia.

Não o transforme em modal descartável: a proposta diz "exibida", não "exibida uma
vez".

### B.3 Referência da fonte na interface (§3.2)

Coberto por A.3, mas verifique rota a rota: **todo** valor exibido tem de ter a
fonte alcançável em no máximo um gesto (hover ou clique), inclusive dentro dos
gráficos.

### B.4 Raciocínio visível (§1)

O funil de eliminação já existe no backend (quantos candidatos restam por
restrição). Hoje aparece como texto. Transforme-o num **componente de funil**:
cada etapa, a restrição que a produziu, quantos entraram, quantos saíram e
**quais materiais** foram eliminados ali. É a peça mais didática do sistema e a
que mais justifica a alegação de auditabilidade.

Idem para a tabela de contribuições: barra proporcional por critério ao lado do
número, para que se veja **o que** empurrou cada material para cima.

---

## 7. Entrega C — responsividade e tema

- **Mobile-first de verdade.** Alvos: 375 px (celular), 768 px (tablet),
  1280 px (notebook), 1920 px. Nenhuma página pode rolar horizontalmente.
- **Navegação:** o cabeçalho com 8 links vira, em telas estreitas, um menu
  lateral acessível (foco preso, `Esc` fecha, `aria-expanded`). Em telas largas,
  agrupe: **Estudar** (Seleção, Mapas, Comparar), **Dados** (Catálogo,
  Importar), **Administrar** (Classes, Propriedades). Marque a rota atual com
  `aria-current="page"` — hoje não há indicação de onde se está.
- **Tabelas largas:** cabeçalho fixo, primeira coluna fixa e rolagem contida na
  própria caixa; abaixo de 768 px, considere lista de cartões. Nunca deixe a
  tabela empurrar o `<body>`.
- **Assistente de seleção no celular:** stepper compacto, uma etapa por tela,
  barra de ação fixa no rodapé com a ação primária sempre alcançável com o
  polegar.
- **Gráficos:** altura responsiva, barra de ferramentas do Plotly enxuta,
  legendas que não cubram os dados em tela pequena.
- **Tema escuro** com `prefers-color-scheme` + alternador manual persistido.
  Aplique também ao tema do Plotly. Contraste mínimo **WCAG AA** nos dois temas.
- **`prefers-reduced-motion`** respeitado em toda transição.

---

## 8. Entrega D — rota por rota

**`/` (hoje 37 linhas, estática).** Vira a porta de entrada didática: o que a
ferramenta faz em duas frases, o método de Ashby em quatro passos
(Função → Restrições → Objetivo → Resultados) como caminho clicável, **lista dos
estudos salvos** para retomar (§4.2 pede "persistência de análises como projetos
reabríveis"), atalho para o roteiro didático, e os dois avisos.

**`/selecao` (528 linhas, o coração).** Stepper com estados reais
(concluído / atual / pendente / bloqueado e **por quê**). Contador de candidatos
ao vivo como elemento visual persistente, não texto solto. Cartão de índice
(B.1). Barra de ação fixa. Painel de IA claramente marcado como **opcional e
revisável** — a proposta é explícita quanto a isso (§3.4). Tela de resultados
reorganizada: candidatos, funil, contribuições, excluídos por dado ausente,
sensibilidade e proveniência, cada um com título próprio e âncora.

**`/catalogo`.** Busca com estados vazio/carregando/erro decentes, filtro por
classe e por qualidade do dado, alternância tabela/cartões, legenda de qualidade.

**`/materiais/[id]`.** A ficha é onde a proveniência tem de brilhar: agrupamento
por categoria mantido, valor em destaque, trilha de conversão acessível,
miniatura de mapa posicionando o material.

**`/mapas` e `/comparar`.** Painel de controle organizado (eixos, escala,
classes, índice, níveis) em vez de controles enfileirados; barra de ferramentas
do gráfico consistente; lista de exclusões com motivo, que já existe, apresentada
como informação e não como erro.

**`/importar` (492 linhas).** Mesma linguagem de stepper de `/selecao` — são o
mesmo padrão mental e hoje não se parecem. Relatório de validação linha a linha
com severidade visual clara.

**`/admin/*`.** Não é tela de estudante. Aplique as primitivas e pare por aí.

---

## 9. Entrega E — acessibilidade (fecha o M3 do TODO)

- Navegação completa por teclado, com ordem de foco previsível e anel de foco
  visível em ambos os temas.
- Link "pular para o conteúdo".
- Todo controle com rótulo programático; erros ligados por `aria-describedby` e
  anunciados em `aria-live`.
- Contraste AA (texto normal 4.5:1, grande 3:1) verificado nos dois temas.
- Gráficos: alternativa textual real — a **tabela de dados** que originou a
  figura, acessível a partir dela. É o que torna um mapa de Ashby utilizável por
  leitor de tela, e o dado já está no cliente.
- Nada codificado **apenas** por cor.

---

## 10. Entrega F — ferramental

1. **Rota `/estilo`** (não linkada na navegação principal): vitrine viva do
   sistema de design — tokens, primitivas, estados, badges de qualidade, temas
   claro e escuro lado a lado. Serve de documentação para quem continuar o
   trabalho e **rende figuras prontas para a monografia**.
2. **Teste automatizado de acessibilidade:** `vitest-axe` (ou `axe-core` +
   `jest-axe`) sobre as primitivas e as telas principais, no mesmo `npm run
   test` que a CI já roda. Um teste que falha é melhor que uma auditoria manual
   que ninguém repete.
3. **Testes de regressão visual** só se couber sem inchar a CI; se couber,
   Playwright com screenshots das rotas nos quatro alvos de largura. Isso
   conversa com o item **A4** do TODO (end-to-end), que já está no backlog.
4. **Instrumentação do teste de usabilidade (§3.5).** Crie
   `docs/11-usabilidade.md` com: roteiro de tarefas (o estudante recebe um
   enunciado e tem de chegar ao relatório), formulário de coleta cobrindo os três
   eixos que a proposta nomeia — **clareza da apresentação dos critérios**,
   **facilidade de operação**, **utilidade percebida** — e a tabela onde as
   melhorias decorrentes serão registradas. A proposta cobra o formulário, a
   análise e as melhorias implementadas como **entrega** (§4.1).

---

## 11. Ordem de execução

Não faça isso num PR só. Sequência, cada etapa com a CI verde antes da seguinte:

1. **PR 1 — fundação.** Tokens, `cn()`, primitivas em `components/ui/`, rota
   `/estilo`, teste de acessibilidade. Nenhuma tela alterada ainda. Este PR é
   mecânico e revisável.
2. **PR 2 — promessas da proposta.** B.1 (cartão de índice), B.2 (aviso de
   limitação), A.3 (linguagem de qualidade do dado). **É o PR que mais importa
   para a banca.**
3. **PR 3 — casca e navegação.** Layout, navegação responsiva, tema escuro,
   home.
4. **PR 4 — `/selecao` e `/importar`.** Os dois assistentes, com o funil visual.
5. **PR 5 — catálogo, ficha, mapas, comparar.**
6. **PR 6 — acessibilidade e polimento**, mais o `docs/11-usabilidade.md`.

Atualize `docs/` no mesmo PR que muda o comportamento — e comece corrigindo
`docs/04-metodologia-selecao.md:25`, que hoje descreve algo que o código não faz.
Registre em `docs/DECISIONS.md` as decisões de design que alguém razoável poderia
ter tomado diferente (a escolha de não usar biblioteca de componentes, a paleta
segura para daltonismo, a codificação da qualidade do dado).

---

## 12. Portão de aceitação

Um PR só está pronto quando:

- [ ] `npm run typecheck && npm run lint && npm run test && npm run build` passa;
- [ ] backend intacto: `ruff check app`, `black --check app`, `pytest` verdes
      (o redesign não deve tocar no backend, exceto para expor `assumptions` se
      algum campo faltar no schema de saída);
- [ ] nenhuma rota rola horizontalmente a 375 px;
- [ ] contraste AA nos temas claro e escuro;
- [ ] nenhum cálculo novo em componente React;
- [ ] nenhuma lacuna de dado exibida como `0`, `—` ou célula vazia;
- [ ] nenhuma string em português fora de `lib/i18n.ts`;
- [ ] `lib/types.ts` e `packages/shared-types/index.ts` em sincronia;
- [ ] verificado no navegador, não só nos testes — a prática da seção 9 de
      `docs/CLAUDE.md` já pegou dois bugs que os testes não pegaram.

---

## 13. O que **não** fazer

- Não instale biblioteca de componentes nem framework de animação.
- Não substitua o Plotly.
- Não mova cálculo para o cliente para "ficar mais rápido".
- Não troque "ausente" por um traço, um zero ou uma célula vazia — em nenhuma
  tabela, em nenhum gráfico, em nenhum tooltip.
- Não use inglês em texto de tela nem português em identificador.
- Não transforme o aviso de limitação em modal que se fecha e não volta.
- Não redesenhe `/admin/*` além de aplicar as primitivas.
- Não renumere itens de `docs/TODO.md`: os identificadores são estáveis e outros
  documentos os citam.
