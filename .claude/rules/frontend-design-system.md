---
paths:
  - "apps/web/**"
---

# Sistema de design (frontend)

(Movido do `CLAUDE.md` da raiz sem alteração de texto; carrega só ao tocar nesta área.)

A interface tem um sistema de design próprio, **sem biblioteca de componentes
externa** (D-23): o MSDS (`apps/web/lib/msds/`, D-74) é código deste
repositório, e desde [D-80](docs/DECISIONS.md) nenhuma primitiva depende mais
de `@material/web` — a dependência saiu do `package.json` e a exceção de D-48
ficou sem objeto. Três regras que não são questão de gosto:

- **Cor só via token.** Todo valor de cor vive em `apps/web/app/globals.css` como
  triplo `"R G B"`; o Tailwind lê pelo `tailwind.config.ts` e a camada de gráfico
  lê o mesmo token em runtime por `lib/design/palette.ts`, de modo que interface
  e figura não possam discordar (D-28). Nada de classe de paleta crua
  (`bg-slate-800`) em componente.
- **A paleta é azul, e dois matizes estão onde estão de propósito** (D-38, que
  substitui a paleta de D-33 sem revogar o método dela). `--info` fica no ciano
  para que um alerta informativo não vire cromo de marca, e
  `--quality-importado` fica no violeta porque o único matiz com que uma
  procedência não pode ser confundida é aquele em que se clica. Ao mexer na
  paleta, meça: o par mais apertado é `--brand-700` sobre `--brand-50` a 5,01:1,
  e `--accent` **não** é o azul do Google (#1A73E8 dá 4,51:1 com branco). Estado
  de hover nomeia `800`/`900`, nunca `--accent` — que *é* `--brand-700` e
  produziria um hover invisível no tema claro. A paleta categórica de classes
  (Okabe–Ito) não é da marca e não se mexe: ela responde a daltonismo e a
  impressão monocromática.
- **Forma e movimento também são token.** `rounded-card`/`rounded-control`
  cobrem quase tudo; a classe `.pressable` (em `globals.css`) é o gesto de
  "maleável" — 2% de `transform` ao pressionar (nunca no hover, D-248), na
  mola do Material 3, sem biblioteca.
- **Primitivas em `components/ui/`**, importadas sempre pelo barril
  `@/components/ui` e documentadas ao vivo em `/estilo` — as figuras da
  monografia são capturas dessa rota, e por isso ela não pode envelhecer em
  relação ao código.
- **A navegação é a barra lateral** (`components/layout/AppSidebar.tsx`, D-37):
  fixa a partir de `lg`, gaveta modal abaixo, e recolhível a 76 px. Ao recolher,
  o rótulo de um link vira `sr-only` — **nunca** é removido, ou o link fica sem
  nome acessível. O estado recolhido não é persistido de propósito; se um dia
  precisar ser, o caminho é um cookie lido no servidor, não um `useEffect`.
- **A borda de um controle é informação, não moldura** (D-34). Um campo tem o
  mesmo fundo do cartão em que está, então aquela borda é a única coisa que diz
  que existe um controle ali: ela responde à WCAG 1.4.11 (3:1), e não ao
  orçamento de fio de cabelo dos outros contornos. Use `border-edge-control` no
  contorno do que se opera e nunca num divisor decorativo.
- **Papel antes de aparência** ([D-91](docs/DECISIONS.md)):
  - **Botões:** no máximo **um** `primary` visível por tela.
  - **Exportações:** um "Exportar ▾" (`MenuButton`), nunca uma fileira de
    botões.
  - **Dentro de um cartão:** um poço (`.well`) ou uma subseção
    (`.subsection`), **nunca outro cartão**.
  - **Texto:** o tamanho vem de um papel (`text-support`, `text-caption`…).
    O sobrescrito mono em caixa alta só aparece no cabeçalho da página.
  - **Código novo** usa os tokens semânticos (`bg-page`, `bg-panel`,
    `bg-well`, `border-line`, `bg-action`), e não os passos da paleta.
- **Gráfico é o do AI Studio, nas cores do app** ([D-95](docs/DECISIONS.md)):
  - **Resumo:** vem do `ChartTooltip` (categoria e uma linha por série),
    nunca do hover do Plotly.
  - **Canto do cartão:** botões de ícone (`ChartFrame` `views` para trocar o
    tipo, "Tabela", "Exportar").
  - **Eixo:** um só, **nunca eixo duplo**.

- **Busca global é a barra do topo** ([D-129](docs/DECISIONS.md)):
  `GlobalSearch` (Ctrl/Cmd+K ou `/`) só **navega** — telas, materiais, processos,
  cadernos, estudos. Nunca mostra valor de propriedade. Ideia nova vinda do
  Material 3 cita a página de `m3.material.io` na decisão.

- **Excluir tem "Desfazer"** ([D-130](docs/DECISIONS.md)): `useUndoableDelete` +
  `SnackbarProvider` — o item some na hora e a API só roda quando o aviso vence.
  Um aviso por vez, uma ação, sem ícone. Exclusão que apaga vocabulário usado por
  outras linhas (classe, propriedade) continua com confirmação.

- **Tabela ordena rótulo e seleciona linha** ([D-131](docs/DECISIONS.md), [D-254](docs/DECISIONS.md)): `SortTh` +
  `aria-sort`; só coluna de texto ou **contagem que o servidor mandou** é ordenável (nunca valor medido — ranquear é
  do backend). Fora do catálogo, use `useTableSort(rows, colunas)`: o ausente (`null`) fica **depois** de todos, nos dois
  sentidos, nunca vira 0. A seleção vale para as linhas **listadas** e o botão desligado diz o motivo. No celular os
  cartões do catálogo têm a mesma caixa (44 px) e **a mesma barra, desenhada uma vez** (`SelectionBar`; duas, uma por
  layout, seriam duas regiões com o mesmo nome).
- **Desabilitado desbota por `--state-disabled`** (0,38), nunca por número próprio: o teste `disabledState.test.ts`
  reprova `:disabled { opacity }` e `disabled:opacity-NN` fixos entre 30 e 55 %. Texto que precisa de contraste
  (link, opção, fonte bloqueada) não desbota: troca de cor ou diz em palavras.
- **Lista longa agrupa e dobra** ([D-254](docs/DECISIONS.md)): o cartão de família de Processos passa de 12 itens
  (`GROUP_FROM`) e agrupa por subfamília em `Disclosure` fechados, abertos com busca/filtro ligados, com contagem e os
  "marcados" na cabeça da seção.

- **Home devolve ao que se fazia** ([D-132](docs/DECISIONS.md)): `RecentRecords` lê a mesma
  `MY_RECORDS_KEY` de *Meus registros* (até 6, omite o que não resolve); `Greeting` só
  aparece com nome na conta. Continua **um** botão primário (D-86).

- **Material 3 é token antes de componente** ([D-133](docs/DECISIONS.md)): `--m3-*` por rota
  (gerado: `npm run tokens:m3`, nunca à mão), `--shape-*`, `--elevation-*`, `--state-*`,
  `.m3-state`. Valor novo cita a linha de `docs/21-material3-referencia.md`. Onde o M3 pede
  menos que o projeto (contraste D-34, Okabe–Ito, um `primary`), vale o projeto.

- **Hover é véu, não movimento da caixa** ([D-134](docs/DECISIONS.md), revista na [D-248](docs/DECISIONS.md)): botão,
  chip, FAB e demais `.msds-ripple-host` usam a camada de estado 8/10/10 e nunca sobem, crescem nem trocam borda; desde a
  D-248 **a forma** (raio) muda no hover e ao pressionar e **o ícone** faz o seu gesto. `tonal` é o botão quieto e não conta como `primary`.

- **Movimento do M3 Expressive** ([D-248](docs/DECISIONS.md)): todo ícone novo declara `gesture` no `Svg` (preencher, girar,
  balançar, saltar, deslizar, pulsar, desenhar) e entra em `APP_ICON_GESTURES` (`lib/design/iconGestures.ts`); glifo do `msdsIcon`
  entra em `MSDS_ICON_GESTURES`. Regra de gesto só dentro do bloco `prefers-reduced-motion: no-preference` com
  `:root:not([data-motion="reduced"])`. Duração e curva vêm em par (`--motion-*` + `-dur`; a mola é `linear()` sob `@supports`, nunca
  com outra duração). Forma que responde vive no `msds.css` (raio no hover/pressão, alternância ligada quadrada; `--btn-r` no botão),
  nunca raio em linha por JS. Indicador ativo de lista nova é `SlidingIndicator` + `useSlidingIndicator`.

- **Campos no contorno M3** ([D-135](docs/DECISIONS.md)): raio 4, borda `--m3-outline` (≥ 3:1
  sobre o painel, testado), foco em contorno de 2 px, rótulo **acima**. Caixa, rádio, switch e
  slider usam `--m3-primary`/`--m3-outline`; a borda desmarcada nunca fica abaixo de 3:1.

- **Contêineres e sobreposições no M3** ([D-136](docs/DECISIONS.md)): card interativo sem
  `translateY` (véu + elevação 2); diálogo 28 px em `surface-container-high`; scrim `--m3-scrim`
  a 32 %; menu/popover em `surface-container`; snackbar e dica em `inverse-surface`. Sobreposição
  entra com mola na própria superfície (escala/opacidade, D-248), nunca na página atrás.

- **Navegação e dados no M3** ([D-137](docs/DECISIONS.md)): aba com indicador de 3 px em
  `--m3-primary`; barra inferior com pílula 56 × 32 **sobre o trilho escuro** (D-37 vale);
  item de lista e linha de tabela com véu de 8 %, nunca preenchimento fixo.

- **Rascunho do assistente é local e por conta** ([D-139](docs/DECISIONS.md)): `lib/selectionDraft.ts`,
  `localStorage` com a chave do usuário, nunca o servidor. Intocado não grava; nada é restaurado
  sem o clique em "Continuar"; salvar o estudo apaga o rascunho. Todo acesso ao armazenamento em `try/catch`.

- **Tela nova esmaece, só opacidade** ([D-141](docs/DECISIONS.md)): `RouteTransition` em `app/app/layout.tsx`.
  Nunca `transform` num ancestral do conteúdo (quebra todo `position: fixed` dentro); movimento
  novo respeita `prefers-reduced-motion`.

- **O app é instalável, mas não guarda dado de material** ([D-142](docs/DECISIONS.md)): `public/sw.js`
  só responde com `/offline.html` a uma navegação que falhou **com o aparelho sem rede** (`navigator.onLine === false`,
  [D-199](docs/DECISIONS.md)); online, repassa o erro real. Nunca cache de API, catálogo, estudo
  ou resultado: propriedade sem fonte e data fere o princípio 1. Ao mudar `offline.html`, mude `CACHE`.
  **Exceção única** ([D-152](docs/DECISIONS.md)): a ficha já aberta fica no `localStorage` como texto
  (`lib/offlineSheets.ts`), com a fonte e a data da leitura em cada valor, e só `offline.html` a mostra. Nada de
  retrato de registro próprio, nem de número recalculado fora do backend. Ao mudar `ValueText`, mude `describeValue`.

- **Caderno tem menu no cartão e painéis ajustáveis** ([D-143](docs/DECISIONS.md)): ações do cartão
  ficam num `MenuButton` ao lado do link (nunca dentro); `PanelResizer` é um `separator` com teclado
  e só existe de `lg` para cima. Largura de painel não é gravada.

- **Uma região aria-live para o app** ([D-146](docs/DECISIONS.md)): o que muda sem o leitor digitar passa
  por `useAnnounce()`; etapa escolhida leva o foco ao título da etapa. Texto que já tem `role="status"` fica.

- **Tela nova entra na suíte de larguras** ([D-147](docs/DECISIONS.md)): acrescente a rota a `ROUTES` em
  `e2e/larguras.spec.ts`. A página nunca rola na horizontal a 375/768/1280/1920 px; só a caixa de uma tabela ou
  de um mapa pode. Sem comparação de pixel.

- **Abrir um detalhe a partir de uma lista é transformação de contêiner** ([D-148](docs/DECISIONS.md)): o cartão ou a linha leva
  `data-container-origin` e o link, `onClick={markContainerOrigin}`; quem se move é uma superfície vazia no `<body>`
  (`ContainerTransition`), **nunca** o conteúdo nem um ancestral dele. Desligada sob redução de movimento.

- **Olhe no navegador o que for movimento ou largura** ([D-149](docs/DECISIONS.md)): teste e CI não veem curva de animação
  nem painel espremido. Pause a animação (`getAnimations()`) e meça os valores computados; a conversa dos Cadernos nunca fica abaixo de 352 px.

- **Rota nova tem rótulo no sobrescrito** ([D-156](docs/DECISIONS.md)): `PageHeader` lê `labelForPath`
  (`lib/design/sections.ts`). Tela fora do mapa de seções entra em `ROUTE_LABELS` ou ganha seção; senão o cabeçalho escreve
  "início". Um estado vazio que já traz o botão da tela não repete o do cabeçalho. O grupo ("estudar · …") vem de
  `groupForPath`, espelho de `GROUPS` da barra ([D-205](docs/DECISIONS.md)): página não passa `group`; detalhe com trilha
  passa `eyebrow={false}`. Etapa bloqueada do `Stepper` é neutra, nunca cor de aviso.

- **Dois painéis são `PaneScaffold`** ([D-182](docs/DECISIONS.md)): lista e detalhe ou painel de apoio, decididos pela largura do bloco
  (container query, limiares M3 de `lib/design/breakpoints.ts`), nunca por `matchMedia` no render. `useWindowClass` é só para comportamento.
  Rumo do Expressive ([D-181](docs/DECISIONS.md)): barra escura fica, cor do app escolhível (qualidade e Okabe–Ito fixas), movimento expressivo.

- **Movimento é mola expressiva** ([D-183](docs/DECISIONS.md)): transição nova usa `--motion-spatial[-fast|-slow]` (posição, tamanho, forma)
  ou `--motion-effects[-fast]` (cor, opacidade), com o `-dur` correspondente; nunca curva solta. Botão dividido, menu do FAB e carregamento curto
  são `SplitButton`, `FabMenu` e `LoadingIndicator`; movimento reduzido desliga tudo.

- **Catálogo é lista e detalhe** ([D-184](docs/DECISIONS.md)): clique simples no nome, com bloco ≥ 840 px, abre `MaterialPreview` ao lado (a ficha
  de verdade, mesmos `PropertyGroupCard`); estreito ou com modificador, navega. Ação sobre marcados é a barra flutuante `.m3-floating-toolbar`.

- **Seleção tem o funil ao lado** ([D-186](docs/DECISIONS.md)): etapas de entrada em `PaneScaffold` *supporting-pane* com `LiveFunnel`, que só lê a prévia
  do servidor (nenhum número no cliente; `FunnelRow` é o mesmo dos resultados). Com objetivo, Executar é `SplitButton` com "Executar só os limites".

- **Início começa escrevendo** ([D-195](docs/DECISIONS.md)): `HomeComposer` é o `primary` da tela e só leva texto à função do estudo
  (`?funcao=`, `lib/selection/functionParam.ts`); nenhum número nasce ali. "Novo" é `FabMenu` no Início, não no trilho escuro.

- **Aparência é escolha de quem usa** ([D-196](docs/DECISIONS.md)): `lib/appearance.ts` (aparelho, `localStorage`, e **na conta** desde a [D-249](docs/DECISIONS.md): `lib/appearanceSync.ts`, `GET/PUT /api/me/appearance`; tema e densidade seguem por aparelho). Cor do app só entre
  paletas de tela que já existem (`APP_COLOR_SECTION`), nunca cor nova; contraste médio/alto só aponta token para token; script que anima
  pergunta `prefersReducedMotion()` dali, nunca `matchMedia` sozinho.

- **No celular, `Popover` é folha inferior** ([D-197](docs/DECISIONS.md)): abaixo de 600 px abre modal (foco preso e devolvido,
  véu, Esc); passe `title` com o que o valor é. Ações de uma tela longa no celular vão numa barra flutuante *standard* acima da navegação
  inferior (`SheetActions`), escondendo as cópias do cabeçalho com `.m3-hide-compact`; nunca uma segunda barra ancorada.

- **Fundações e peças da F1** ([D-206](docs/DECISIONS.md)): alvo de toque é `--target-min` (44 px; área invisível em `pointer: coarse`,
  nunca desenho maior); texto usa papel (`text-caption`/`text-body`, nunca `text-xs`/`text-sm`); hover é véu, nunca borda (só o campo
  de texto escurece o contorno). Reordenar é `useReorder` + `Block` (arrastar e Alt+↑/↓, anunciado); filtro é `FilterBar` (folha
  inferior no celular, nunca cartão de filtros); par nome → valor é `PropertyList`; página de registro é `PageDoc` (ações extras no ⋯);
  tela vazia é `EmptyState layout="page"` com `templates`; abrir ao lado é `SidePeek` modal; cálculo é `Workbench`. Nenhuma peça
  calcula, filtra ou ordena dado: relatam a escolha, o servidor responde. `foundations.test.ts` guarda as regras.

- **Bases de dados têm visões salvas na conta** ([D-209](docs/DECISIONS.md), revoga em parte a D-50): tela-base usa
  `useDatabaseView` + `SavedViewsBar` (abas "Todos" + visões; `aria-pressed`, não `tablist`) + `FilterBar`, e escolhe Tabela, Galeria
  ou Lista; a Tabela continua virando cartões no celular. Visão mora em `saved_view` (`/api/saved-views`, por usuário, `config`
  validado, sem número de material); escopo novo entra em `SavedViewScope` no backend e no `shared-types`. O layout do Painel é a
  linha `kind="layout"`. Glossário é wiki: verbete aberto no `SidePeek` pelo hash.

- **Ficha é documento** ([D-214](docs/DECISIONS.md), [D-215](docs/DECISIONS.md)): trilha + cabeça com uma ação visível e o resto no
  "⋯" + seções em `CollapsibleSection` (montadas só ao abrir) com `SheetOutline` na `.sheet-layout`, que marca a seção lida; processo
  e famílias seguem o mesmo molde. Unidade de leitura é `UnitChip` no próprio valor (escolha na URL, D-70; quem converte é o servidor);
  nunca uma fileira de seletores antes dos números. Grandeza de uma unidade e valor ausente não ganham chip.

- **Calculadora é bancada ao vivo** ([D-220](docs/DECISIONS.md), sobre a D-216): o resultado segue os campos por `useLiveResult` (pergunta ao
  servidor depois de uma pausa, mantém a resposta anterior marcada "Atualizando…"; nunca calcula no cliente) e o painel do resultado
  diz o que falta. Exemplo só com clique ("Usar o exemplo", valores declarados no backend). Unidade dentro do campo
  (`NumberInput unit`). Lista de itens que se editam é `InlineTable` (linha nova, ⋯ com Duplicar e Remover com Desfazer).

- **Estudar é documento e inspetor** ([D-221](docs/DECISIONS.md)): o estudo da Seleção é `PageDoc` (nome como título vivo, problema
  como propriedades que levam ao passo; "Meus estudos" num `SidePeek`, nunca faixa na página); `Stepper compact` no celular. O mapa
  tem um inspetor de seções que dobram (`InspectorSection`), folha inferior padrão abaixo de `lg`; controle que só serve ao mouse
  leva `.ds-fine-pointer-only`. Pino e layout começam no aparelho (`lib/pinnedMaps.ts`) e só guardam id e nome — abrir pede ao
  servidor. Atalho de comparação acha o material pelo nome no catálogo e some quando um lado falta; nunca id fixo. O nome casa por palavra inteira, na classe do lado, e o que começa pelo termo vence ([D-230](docs/DECISIONS.md)).

- **Blocos que a pessoa arruma ficam na conta** ([D-232b](docs/DECISIONS.md)): Início e Painel usam `LayoutBlocks` (escopo do
  `saved_view`, linha `kind="layout"`); bloco sem conteúdo fica no lugar com uma linha (`emptyLabel`), nunca escondido. Favoritos
  (estrela, conta) têm seção na barra lateral, distinta de Fixados (páginas, aparelho).

- **Cadernos ([D-235b](docs/DECISIONS.md))**: modelos vêm de `GET /api/notebooks/templates` (nunca uma lista no React); a ordem das
  notas é da conta (`PUT …/notes/order`, `Block` + `useReorder`); "/" num campo de nota é `SlashTextarea` (ficha entra como link,
  nunca como valor copiado); `ToolTile` é monocromático — cor só para estado; aviso do provedor é chip no cabeçalho.

- **Entrada e Conta ([D-236b](docs/DECISIONS.md))**: `/entrar` e `/assinatura` usam `EntryFrame`; a landing mostra capturas reais em
  `public/landing/` (refaça-as quando a Seleção mudar de cara). Conta é `/app/conta`, dentro do app; números de uso vêm do servidor e
  aparecem num `<meter>` nativo, nunca numa barra calculada. Barra lateral clara é `data-rail="light"`, só no tema claro e só sob
  `[data-surface="rail"]`; elemento novo da moldura leva esse atributo e lê `--rail-*`, nunca branco fixo.

- **Administração edita na linha ([D-238](docs/DECISIONS.md))**: texto curto de vocabulário (nome, descrição) se edita com
  `EditableText` (lápis → campo; Enter/sair salva, Esc desiste; recusa do servidor fica na célula). Classe se edita pelo `PATCH`
  (nunca o `PUT`, que muda o slug e apaga a prosa). Formulário de criação fica atrás de um botão no cabeçalho, não aberto em cima da tabela.

- **O que o M3 Expressive trouxe por último** ([D-252b](docs/DECISIONS.md)): o escolhido usa o peso **enfatizado** do seu papel
  (`text-m3-*-emphasized`; aba ativa e assento do grupo conectado a 700) e reserva a largura com `.m3-emph-label`, nunca troca de peso
  que empurra o vizinho. Menu é o **vertical** (`surface-container-low`, raio 16, item 4/12); opção de escolha é `MenuItem selected`
  (`menuitemradio`, `tertiary-container`), nunca um ✓ à mão. Lista de registros nova é `.m3-list-segmented` sobre a página ou um poço,
  nunca dentro de cartão com borda. Inventário completo do site contra o app no doc 21.

- **Ambiente "Oficina" é fantasia de superfície** ([D-256](docs/DECISIONS.md), rumo em `docs/22-oficina.md`): escolha em Aparência
  (`lib/ambience.ts`, aparelho), lida no CSS por `[data-ambience="oficina"]` e no React por `useAmbience()`. Nenhum número, papel de cor ou nome
  acessível muda. Superfície nova usa os tokens `--oficina-*`; textura **só se afasta do texto** e **nunca vai num painel** (papel é onde se lê;
  nada escrito sobre a madeira). Sem imagem: o veio é `feTurbulence` em `data:` URL. Ícone de destino no trilho passa por `NavIcon`; gaveta é
  `Drawer` (um disclosure), envelope é `Envelope`, e o que a gaveta mostra vem da busca do servidor. `ambience.test.ts` guarda as regras.

- **Projeto com peças** ([D-257](docs/DECISIONS.md)): `ProjectWorkspace` só imprime o que `/api/assemblies/{id}` devolve. Nenhuma soma,
  multiplicação ou valor padrão no cliente; figura ausente mostra o **motivo** que veio do servidor, e total recusado mostra a lista das peças
  e a soma parcial dita como parcial. Toda escrita de peça devolve o projeto inteiro: ponha a resposta no cache, não remonte a soma. Custo sai
  sem símbolo de moeda, com a nota do servidor uma vez na página. Remover peça é imediato e o "Desfazer" regrava a peça.

- **A bandeja** ([D-258](docs/DECISIONS.md)): o que a pessoa leva fica na conta (`/api/tray`) e num só cache (`lib/tray.ts`); toda escrita
  guarda a resposta do servidor. É marcador: nunca ponha valor de material num item nem no arrasto (o arrasto leva tipo, id e nome). Onde algo
  pode ser arrastado para a bandeja, o botão `TakeToTrayButton` está ao lado; destino novo de arrasto usa `carriesTrayTarget`/`readTrayDrag` e
  oferece o mesmo por menu. Aviso com "Desfazer" de dentro de um painel modal fica **no painel**, nunca no snackbar atrás dele. O link dentro de
  um elemento arrastável leva `draggable={false}`.

- **Fórmula é KaTeX vindo do backend** ([D-191](docs/DECISIONS.md)): `ExpressionBuilder` para editar índice (cartões arrastáveis por
  HTML5 nativo, com clique e teclado como alternativa) e `ExpressionLabel`/`MathTex` para mostrar. KaTeX (MIT) é a única dependência de
  fórmula; o TeX vem de `/api/expressions/describe` ou da paleta, nunca montado no cliente, e o slug não aparece fora do modo "Digitar".

- **Padrões de página** ([D-212](docs/DECISIONS.md)): `PageHeader` com `secondaryActions`, `overflow` ("⋯") e `primaryAction`,
  nessa ordem, e a trilha em `breadcrumb`; calculadora é `ParamsResultLayout` (`ParamsPanel` + `ResultPanel`); entrada que se
  reabre vai para a URL por `useUrlState`, nunca `setState` no render; carregamento por tipo (`TableSkeleton`, `ChartSkeleton`,
  `SheetSkeleton`); `StatTile` e `formatTyped` são um só. O MSDS é um arquivo por componente em `lib/msds/`, importado de `@/lib/msds`.

E as proibições do §13 de [`docs/REDESIGN.md`](docs/REDESIGN.md), que continuam
valendo depois da Fase 8: nenhuma biblioteca de componentes, **nenhum framework
de animação** (a proibição vale igual quando a animação vem bonita), nenhum
cálculo movido para o cliente, e **ausência nunca é renderizada como `0`, `—` ou
célula vazia** — é o quarto estado da qualidade do dado, com rótulo escrito
(D-24). Número na tela usa a convenção do pt-BR (D-30), e todo gráfico tem como
alternativa textual a tabela que o originou (D-31).

**O Plotly é montado à la carte, e desde D-80 só desenha os mapas.**
`apps/web/lib/plotly-custom.ts` registra exatamente a família de traço que as
figuras ainda usam (`scatter` — `AshbyMap` e `PropertyChart`, que precisam de
log–log, zoom e da caixa do Chart Stage); barras, box-plot, radar, coordenadas
paralelas e heatmap do painel e do comparador são SVG próprio no desenho do
MSDS (`components/charts/`). O `webpack.resolve.alias` do `next.config.mjs`
aponta para lá o `plotly.js/dist/plotly` que o `react-plotly.js` exige — a
build completa custava 4,5 MB, 79% de todo o JavaScript da aplicação. Três
consequências que não são opcionais: **um segundo tipo de traço tem de ser
registrado ali**, ou o Plotly falha em runtime com
"Trace type not found" — o verificador de tipos não pega isso —; o alias vale
**só para o cliente** (`if (!isServer)`), porque aplicá-lo ao grafo do servidor
quebra o runtime de desenvolvimento com um erro que **não reproduz em
`next build`** e só aparece quando alguém abre a aplicação; e desde o Next 16
(que trocou o bundler padrão para Turbopack) **o `--webpack` em `dev`, `build` e
no `webServer` do `playwright.config.ts` é load-bearing** — sem ele a build roda
noutro bundler, com outro fatiamento de chunks ([D-51](docs/DECISIONS.md)).

