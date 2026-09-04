# Patch de design "Prisma" — design

Spec de aplicação de um patch de frontend, recebido pronto (não escrito nesta
sessão) sob o nome "Prisma": paleta com matiz por rota, tipografia nova, cinco
refinamentos de componente já feitos, e uma segunda fase que transforma `/`
numa vitrine comercial. O patch chegou como arquivo (`.zip`) anexado pelo
autor, com README próprio descrevendo cada arquivo e as decisões que deixou
em aberto — este spec resolve essas decisões e sequencia a aplicação; não
reescreve o patch.

**Fora deste spec:** qualquer mudança de `apps/api`; `GeneratedReport` (spec
em aberto, pausado por este pedido — ver `docs/TODO.md`); os cinco
"refinamentos ainda opcionais" que o próprio README do patch lista como não
feitos (tabular-nums generalizado, `PanelShell` em todo shell de rota, link
de estudo-modelo por query string, aviso de demonstração como convite) —
ficam registrados no TODO, não neste patch.

---

## 1. Decisões de escopo já tomadas

Fechadas em conversa com o autor antes deste spec:

| Decisão | Resposta |
|---|---|
| Fase 2 (vitrine pública, preços, camada comercial) entra, mesmo o projeto sendo TCC acadêmico? | **Sim, as duas fases.** |
| Segmento `/app` explícito ou route group `(app)` preservando URLs atuais? | **Segmento `/app` explícito** — o próprio README recomendava o route group para não quebrar links, mas o autor optou pela URL explícita mesmo assim. Links já compartilhados para `/selecao`, `/mapas` etc. passam a 404. |
| Preços da vitrine (`R$ —` placeholder) — valor real, remover seção, ou manter placeholder? | **Manter `R$ —`.** Decisão de negócio explícita, não pendência esquecida — o preço fica para quando houver um valor real a colocar. |
| `materialTheme.test.ts` fica inválido (o patch não gera mais o esquema M3 de uma seed única) — remover, reescrever, ou deixar quebrado e sinalizado? | **Reescrever** para a garantia equivalente no novo desenho (seção 4). |

## 2. Fase 1 — sistema visual

### 2.1 Arquivos substituídos ou novos

| Arquivo | Natureza | O que muda |
|---|---|---|
| `app/globals.css` | Substitui | Tokens Prisma + um bloco `[data-section="…"]` por rota (claro e escuro), reescrevendo `--brand-*`, `--accent`, `--accent-fg` e os `--md-sys-color-primary*` correspondentes. Acrescenta `--rail`, `--rail-ink`, `--rail-accent`. |
| `tailwind.config.ts` | Substitui | Fontes (`--font-sans`, `--font-mono`), raios, sombras, keyframes novos. |
| `lib/design/sections.ts` | Novo | Mapa rota → seção (`sectionForPath`), consumido por `SectionTheme` e por `PageHeader`. |
| `components/layout/SectionTheme.tsx` | Novo | Client component que escreve `data-section` no `<html>` a partir da rota atual — é o gatilho que ativa o bloco certo de `globals.css`. |
| `components/layout/AppSidebar.tsx` | Substitui | Rail escuro nos dois temas (usa `--rail`, não `--surface-inverted` — este último clareia no tema escuro e apagaria o rail onde a página é grafite), indicador de 3px acompanhando o matiz da seção, versalete mono nos grupos. |
| `components/ui/PageHeader.tsx` | Novo | Título de rota com subtítulo "grupo · rota", lido de `sectionForPath`. |
| `components/ui/Bar.tsx` | Novo | Barra de proporção animada (cresce da origem); `value: null` é o estado de ausência (D-24 — nunca vira barra vazia lida como zero). |
| `components/ui/Card.tsx` | Substitui | Acrescenta `riseIndex` (entrada escalonada, teto de seis itens) e `PanelShell` (`rounded-panel`). |
| `components/ui/index.ts` | Substitui | Barril: acrescenta `Bar`, `PageHeader`, `PanelShell` às exportações existentes. |
| `components/dashboard/CoverageSummary.tsx` | Substitui | Quadros com traço de matiz, números maiores, cobertura geral com leitura invertida (mostra o que falta, não só o que existe). |

### 2.2 Integração em `app/layout.tsx` (raiz) — três passos do README

1. Montar `<SectionTheme />` dentro do `<body>`, ao lado do que já existe.
2. Trocar fontes para `Public_Sans` (`--font-sans`) e `IBM_Plex_Mono`
   (`--font-mono`, novo — `tailwind.config.ts` do patch aponta `mono` para
   ele).
3. Nenhuma outra mudança é obrigatória nesta fase: qualquer componente que já
   usava `bg-brand-50`/`text-brand-700`/`shadow-glow`/`ring-brand`/
   `bg-brand text-brand-fg` passa a acompanhar o matiz da rota automaticamente,
   e os componentes `@material/web` (D-48) acompanham junto porque
   `--md-sys-color-primary` é reescrito no mesmo escopo `[data-section]`.

### 2.3 Adoção nas doze rotas (trabalho novo, não incluído nos arquivos do patch)

As rotas ainda escrevem `<h1 className="text-xl font-semibold text-ink">` à
mão. Trocar por `PageHeader` é o que faz o matiz aparecer no conteúdo, não só
no rail — sem essa troca, o patch fica só parcialmente visível.

- `group="estudar"`: `/selecao`, `/mapas`, `/comparar`.
- `group="dados"`: `/catalogo`, `/painel`, `/importar`.
- Sem `group`: as demais rotas do produto.

Nas barras do painel, do funil de seleção e da coluna de cobertura do
catálogo, `Bar` substitui o `<span>` com `width` inline — mesmo padrão
`value: null` para ausência descrito acima.

### 2.4 Contraste (medido pelo autor do patch, na paleta nova)

Par mais apertado: `--accent` sobre branco no tema claro, 5,59:1. Nenhum par
`--brand-700`/`--brand-50` cai abaixo de 6,2:1 — folga maior que a paleta de
D-38 (5,01:1 no par mais apertado). `--ink-subtle` foi escurecido em relação
a D-38 porque, sobre a superfície mais clara desta paleta, o valor anterior
caía a 4,3:1 — abaixo do limiar de texto secundário.

**Intocado, por decisão do próprio patch**: `--quality-*`,
`--success`/`--warning`/`--danger`/`--info`, e a paleta categórica Okabe–Ito.
Proveniência e alerta continuam sem variar por rota — é o que os torna
leitura confiável em qualquer tela.

## 3. Fase 2 — camada comercial

### 3.1 Arquivos substituídos ou novos

| Arquivo | Natureza | O que faz |
|---|---|---|
| `app/page.tsx` | Substitui | `/` passa a ser a vitrine pública (metadados de busca, Open Graph). |
| `app/app/layout.tsx` | Novo | Invólucro autenticado: rail + barra inferior + aviso de limite — o que hoje vive no `app/layout.tsx` raiz. |
| `components/marketing/Landing.tsx` | Novo | A vitrine inteira, server component. |
| `components/marketing/AshbyPreview.tsx` | Novo | Mapa de Ashby em SVG estático (sem Plotly) para a vitrine. |
| `components/marketing/FunnelPreview.tsx` | Novo | Funil 48→9 com barras animadas. |
| `lib/marketing/content.ts` | Novo | Cópia de venda, separada de `lib/i18n.ts` — inclui os três planos com `R$ —`. |
| `components/layout/BottomNav.tsx` | Novo | Navegação inferior para telefone: cinco destinos, alvos de 48px, respeita a área segura do iOS. |
| `components/catalog/MaterialCards.tsx` | Novo | Catálogo como cartões abaixo de 640px, ao lado da tabela (não em vez dela — ver 3.3). |

### 3.2 Migração de rotas para `/app` (decisão do autor: segmento explícito)

1. Mover o conteúdo atual de `app/page.tsx` (painel/entrada do produto) para
   `app/app/page.tsx`.
2. Mover as seis rotas do produto para dentro de `app/app/`: `selecao`,
   `mapas`, `comparar`, `catalogo`, `painel`, `importar`.
3. **Mover `AuthGate` para `app/app/layout.tsx`, junto com `AppSidebar` e
   `LimitationNotice`.** Verificado nesta sessão (não estava no README do
   patch, que só fala em mover sidebar e aviso): hoje `app/layout.tsx` raiz
   monta `<AuthGate>` envolvendo a `<div>` inteira que contém `AppSidebar` +
   `<main>` + rodapé — é `AuthGate`, não um redirecionamento solto, que hoje
   torna toda rota (exceto `/entrar`/`/assinatura`, que ele reconhece por
   `pathname` e deixa passar) condicionada a sessão + assinatura ativa. Se
   `AuthGate` continuar no layout raiz depois da Fase 2, a vitrine em `/`
   herda o portão de login e deixa de ser pública — o oposto do objetivo
   desta fase. O raiz fica só com `<html>`, `<head>` (script de tema),
   `<body><Providers>{children}</Providers></body>` e `<SectionTheme />`;
   `/entrar` e `/assinatura` continuam como rotas de topo, fora de `/app`, e
   deixam de precisar dos dois `if (isLoginRoute)`/`if (isBillingRoute)` de
   passagem em `AuthGate.tsx` — sem gate nenhum na árvore acima delas, o
   comportamento observável não muda, então simplificar esses dois ramos é
   opcional, não obrigatório.
4. Ajustar `sectionForPath` em `lib/design/sections.ts`: as rotas do produto
   passam a ser `/app/selecao`, `/app/mapas` etc.
5. **Toda referência interna** a essas seis rotas — mais `/materiais/[id]` e
   `/materiais/novo`, que existem no código hoje e não aparecem na lista do
   patch — precisa do prefixo `/app`: links de navegação (`AppSidebar`,
   `BottomNav`), e qualquer `router.push`/`<Link href>` fixo. Uma busca nesta
   sessão já localizou pelo menos quatro arquivos com link fixo para uma
   rota do produto (`ResultsView.tsx`, `app/mapas/page.tsx`,
   `SavedStudies.tsx`, `app/materiais/[id]/page.tsx`) — ponto de partida para
   o levantamento exaustivo, que é trabalho de implementação, não deste
   spec. É o item de maior risco de regressão silenciosa da Fase 2: um link
   antigo continua compilando e só falha em runtime, com 404.
6. `apps/web/e2e/session.ts` e as specs Playwright que hoje navegam direto
   para `/selecao` etc. (D-42, D-46 — sessão injetada por cookie) precisam do
   mesmo prefixo. Sem isso a suíte E2E (check obrigatório de CI) quebra
   inteira, não parcialmente — é o primeiro sinal de que a migração ficou
   incompleta.
7. Lighthouse (`apps/web/lighthouserc.json`) audita 11 rotas fixas por URL —
   precisam do prefixo `/app` também, ou passam a medir 404s.

### 3.3 Catálogo responsivo

`MaterialCards` é renderizado ao lado da tabela, cada um escondido no
breakpoint do outro (`sm:hidden` / `hidden sm:block`), não uma reformatação
CSS da mesma marcação — um `<table>` forçado a virar lista via CSS perde a
associação entre célula e cabeçalho para leitor de tela. Custo aceito:
duplica os nós no DOM; o catálogo é paginado, então o custo é limitado.

### 3.4 Preços — placeholder mantido

`lib/marketing/content.ts` chega com as três faixas de plano com eixo
definido (número de materiais cadastrados, quem pode importar dados) e valor
`R$ —`. Por decisão do autor (seção 1), fica assim: nenhum número é
inventado.

## 4. `materialTheme.test.ts` — reescrita

O teste atual (`lib/design/materialTheme.test.ts`) trava um único esquema
`--md-sys-color-*` global, gerado de `M3_SEED_HEX = "#1A73E8"` por
`buildMdSysColorScheme()`, e compara byte a byte com os valores colados em
`globals.css`. Essa garantia deixa de existir: o patch reescreve
`--md-sys-color-primary`/`-primary-container` **por seção** via
`[data-section="…"]`, então não há mais "o" esquema — há sete, um por rota
(mais o default de `/`).

Reescrita proposta, preservando o espírito do teste original (travar os
valores colados em `globals.css` contra o que o algoritmo geraria, para que
uma futura edição de paleta não escape sem querer):

- `buildMdSysColorScheme` deixa de ser a fonte de verdade de
  `--md-sys-color-primary`/`-primary-container` — essas duas chaves saem do
  objeto que ela retorna (ou o teste para de comparar essas duas chaves
  especificamente) e passam a ser verificadas por seção, lendo o hex de
  `accent (claro)`/`accent (escuro)` da tabela de matizes do patch (seção
  2, "Matizes" no README) como fonte esperada — sete pares de valores
  (claro/escuro), um por `data-section`.
- As chaves M3 que **não** variam por seção (`--md-sys-color-secondary`,
  `-tertiary`, `-surface*`, `-outline*`, `-error*` etc.) continuam sob o
  teste atual, sem mudança — o patch não toca nelas.
- Cada par (seção, tema) ganha uma asserção de contraste mínimo — a mesma
  medição que o README do patch já fez manualmente (seção 2.4 acima) vira
  prova automatizada: `--accent` sobre `--accent-fg` documentado no próprio
  arquivo de teste, e o par mais apertado (`--accent`/branco, 5,59:1) como
  caso explícito, para que uma futura edição de matiz não possa reintroduzir
  o problema que já existia em D-38 (`--ink-subtle` a 4,3:1) sem que o teste
  acuse.

Este trabalho é tarefa própria dentro da implementação (seção 6) — não é
alteração ao patch em si, é o item que o próprio README classificou como
obrigatório resolver ("o segundo deixa de valer").

## 5. Nova entrada em `docs/DECISIONS.md` — D-49

D-38 mediu e fixou uma paleta única (`--brand-700`/`--brand-50` a 5,01:1,
`--accent` deliberadamente não o azul do Google). Este patch substitui essa
paleta por sete, uma por rota, com números de contraste próprios e melhores
na maioria dos pares. Seguindo o padrão do projeto (D-38 já supersedeu D-33
"sem revogar o método dela"; D-46 registra qual dos dois desenhos coexistentes
em código venceu; D-48 registra uma divergência encontrada no código depois
do fato), esta mudança ganha sua própria entrada — não uma edição silenciosa
de D-38 nem uma omissão:

> **D-49 — Paleta por rota ("Prisma") substitui a paleta única de D-38, sem
> revogar seu método de medição**
>
> **Contexto.** D-38 fixou uma paleta única, medida (`--brand-700`/`--brand-50`
> a 5,01:1), com dois matizes deliberados (`--info` ciano,
> `--quality-importado` violeta). O patch "Prisma" (aplicado nesta sessão,
> [spec](../superpowers/specs/2026-09-02-design-system-prisma-design.md))
> muda o mecanismo: cada rota tem seu próprio matiz de `--accent`/`--brand-*`,
> trocado via `[data-section]` no `<html>`, com `--md-sys-color-primary`
> acompanhando no mesmo escopo.
>
> **Decisão.** Adotar a paleta por rota. O método que D-38 estabeleceu —
> medir cada par antes de aceitar, documentar o par mais apertado — continua
> valendo e foi seguido pelo patch: par mais apertado 5,59:1 (era 5,01:1),
> nenhum par abaixo de 6,2:1. `--ink-subtle` foi escurecido porque a nova
> superfície mais clara reprovava o valor antigo (4,3:1).
>
> **O que continua intocado.** `--quality-*`, `--success`/`--warning`/
> `--danger`/`--info` e a paleta categórica Okabe–Ito — nenhum dos dois
> matizes deliberados de D-38 muda de propósito ou de posição; a rota nunca
> os sobrescreve.
>
> **Consequência aceita.** A paleta deixa de ser "uma cor por conceito em todo
> lugar" e passa a ser "uma cor por conceito, modulada por onde a tela está" —
> uma leitura a mais para quem edita a paleta pela primeira vez (qual valor é
> o de uma seção específica vs. o de um token semântico como `--success`).
> Mitigado por manter os dois tipos de token em blocos CSS visivelmente
> distintos em `globals.css` (default vs. `[data-section]`).

(Texto acima é o rascunho a colar em `DECISIONS.md` durante a implementação,
depois do bloco de D-48; ajustar apenas se a implementação revelar detalhe
que o rascunho não previu.)

## 6. Sequência de implementação

Ordem que minimiza tela quebrada a cada passo intermediário (cada item é
committável e testável isoladamente):

1. **Fase 1, mecânica:** aplicar os 10 arquivos da seção 2.1, os três passos
   de integração em `app/layout.tsx` (seção 2.2). Rodar `npm run dev` e
   conferir visualmente as rotas existentes nos dois temas — nenhuma rota
   muda de URL nesta etapa.
2. **Reescrever `materialTheme.test.ts`** (seção 4) — na mesma leva, porque
   deixa de compilar/passar assim que o passo 1 muda `globals.css`.
3. **Adoção de `PageHeader`/`Bar`** nas doze rotas (seção 2.3) — mecânico,
   arquivo por arquivo, mesma forma em cada.
4. **Nova entrada D-49** em `docs/DECISIONS.md` (seção 5).
5. **Migração `/app`** (seção 3.2, todos os sete passos, incluindo E2E e
   Lighthouse) — a etapa de maior risco; só depois que 1-4 estiverem verdes,
   para isolar qualquer regressão de rota da regressão de paleta.
6. **Vitrine e catálogo responsivo** (arquivos restantes da seção 3.1, 3.3).
7. **Gate completo** (seção 7) e verificação ao vivo no navegador (regra do
   `CLAUDE.md` raiz para mudança de frontend/UI).

Passos 1-4 e 6 têm baixo acoplamento entre si e podem, dentro da
subagent-driven-development, virar tarefas paralelas de um mesmo plano;
passo 5 depende de 1-4 e bloqueia a validação final.

## 7. Testes e validação

- `npm run typecheck && npm run lint && npm run test && npm run build` —
  portão padrão da seção 5 do `docs/CLAUDE.md`.
- `npm run test:e2e` (Playwright) — check obrigatório de CI; primeira suíte a
  acusar um link ou navegação `/selecao`-sem-prefixo esquecido na migração
  `/app`.
- Lighthouse local (`apps/web/lighthouserc.json`) — rotas do relatório
  precisam do prefixo `/app` (seção 3.2, item 7); confirmar limiares de
  acessibilidade não regridem com a paleta nova antes do PR.
- Verificação manual no navegador, nos dois temas e em largura de telefone —
  regra explícita do `CLAUDE.md` raiz para mudança de UI: "monitore
  regressões em outras funcionalidades", não só a tela alvo.
- Novo teste de contraste por seção em `materialTheme.test.ts` (seção 4) —
  ele é, ele mesmo, parte da validação: falha se uma paleta futura reduzir
  contraste sem medir.

## 8. Fora de escopo (registrar em `docs/TODO.md`, não fazer agora)

Os cinco "refinamentos ainda opcionais" do README do patch: `tabular-nums`
generalizado, `PanelShell` em todo shell de rota, estudos-modelo por query
string em `/selecao`, aviso de demonstração como convite de ativação, e
qualquer copy adicional de vitrine além do que o patch já traz pronto.
