# Material 3 — valores de referência e de onde vêm

Este arquivo guarda **só números e a origem de cada um**. É a fonte que as decisões
de design (D-133 em diante) citam, para que nenhum valor do design system "venha de
memória": cada token M3 do app rastreia a uma linha daqui, e cada linha a uma página.

Não copia texto de página. Descreve o que o app adota, o que ele deliberadamente **não**
adota e por quê (as regras do projeto prevalecem onde o M3 pede menos — D-34, D-38, D-91).

## Fontes e como foram lidas (16/10/2026)

| Fonte | Como | Serve para |
|---|---|---|
| `m3.material.io` (páginas abaixo) | Chromium sem cabeçalho, JavaScript ligado. O site é uma SPA: o `curl` e o WebFetch devolvem só o título. | Papéis, regras de uso, escala de forma, estados, movimento. |
| `@material/web` 2.5.0 (npm, Apache-2.0), `tokens/versions/v0_192/` | `npm pack` numa pasta isolada. | **Números** dos tokens de tipografia, forma, elevação, movimento. |

Páginas lidas: `styles/color/roles`, `styles/color/system/overview`,
`styles/typography/type-scale-tokens`, `styles/shape/corner-radius-scale`,
`styles/elevation/overview` e `…/applying-elevation`,
`foundations/interaction/states/state-layers`,
`styles/motion/easing-and-duration/tokens-specs`, e as de componente
(`components/search`, `snackbar`, `navigation-rail`, `lists`, `cards`).

**Divergência entre as duas fontes — vale a página.** O pacote npm (tokens da versão 0.192) dá
**12%** para foco e pressionado; a página atual de *State layers* dá **10%**. O app segue a página.

## Cor — papéis

Pares obrigatórios: todo papel de preenchimento tem o seu `on-…` para texto e ícone.

| Grupo | Papéis | Uso |
|---|---|---|
| Primary | `primary`, `on-primary`, `primary-container`, `on-primary-container` | Ação principal e o que pede mais ênfase. O *container* é um preenchimento de ênfase média, **não** serve para texto. |
| Secondary | `secondary`, `on-secondary`, `secondary-container`, `on-secondary-container` | Elementos recessivos (botão tonal, item selecionado). |
| Tertiary | `tertiary`, `on-tertiary`, `tertiary-container`, `on-tertiary-container` | Contraponto de ênfase pequena (selo, campo). |
| Error | `error`, `on-error`, `error-container`, `on-error-container` | Urgência. Cor **estática**: não muda com a cor dinâmica. |
| Surface | `surface`, `on-surface`, `on-surface-variant`, `surface-variant` | Fundos neutros e texto sobre eles. |
| Surface container | `surface-container-lowest`, `-low`, `surface-container`, `-high`, `-highest` (cinco, por ênfase) | Cartões, folhas, diálogos. Dois degraus de distância no mínimo para o contorno ser percebido. |
| Outline | `outline`, `outline-variant` | Bordas. `outline` é a borda de controle (3:1). |
| Inversa | `inverse-surface`, `inverse-on-surface`, `inverse-primary` | Snackbar e afins. |
| Outros | `scrim`, `shadow`, `surface-tint` | Véu de modal, sombra, tinta de elevação tonal. |

**No app:** `--md-sys-color-*` já existe em `globals.css` para quase todos. O que muda é o
`primary-container`, hoje o azul saturado com texto branco; no M3 é o **tom claro** com texto
escuro (conflito já previsto no plano; decide-se com a medição, ver D-133).

## Tipografia — 15 papéis (px)

Tamanho / altura de linha / espaçamento entre letras / peso. Os pesos vêm do pacote: 400 em
display, headline, body e *title-large*; 500 em *title-medium/small* e em todo label.

| Papel | Tamanho | Linha | Espaçamento | Peso |
|---|---|---|---|---|
| display-large | 57 | 64 | −0,25 | 400 |
| display-medium | 45 | 52 | 0 | 400 |
| display-small | 36 | 44 | 0 | 400 |
| headline-large | 32 | 40 | 0 | 400 |
| headline-medium | 28 | 36 | 0 | 400 |
| headline-small | 24 | 32 | 0 | 400 |
| title-large | 22 | 28 | 0 | 400 |
| title-medium | 16 | 24 | 0,15 | 500 |
| title-small | 14 | 20 | 0,1 | 500 |
| label-large | 14 | 20 | 0,1 | 500 |
| label-medium | 12 | 16 | 0,5 | 500 |
| label-small | 11 | 16 | 0,5 | 500 |
| body-large | 16 | 24 | 0,5 | 400 |
| body-medium | 14 | 20 | 0,25 | 400 |
| body-small | 12 | 16 | 0,4 | 400 |

Existe um segundo conjunto, **enfatizado** (15 estilos, mais pesados), para estado selecionado,
não lido e ação principal. Os componentes não o usam por padrão.

**Decisão do autor (16/10):** o app adota os **15 nomes** com os **tamanhos compactos que já
usa** (a tabela acima é a referência, não o alvo): tabelas e mapas densos não cabem com
`display-large` de 57 px. Fonte: Public Sans (o M3 usa Roboto por padrão e admite trocá-la).

**Tamanhos adotados no app (px, tamanho/linha):** display 28/36 · 24/32 · 22/28; headline
20/28 · 18/24 · 17/24; title 16/24 · 14/20 · 13/20; body 15/22 · 14/22 · 12/16; label 14/20 ·
12/16 · 11/16. Pesos e espaçamento da tabela acima. Em `tailwind.config.ts` (`text-m3-*`).

## Forma — raios (dp = px)

`none` 0 · `extra-small` 4 · `small` 8 · `medium` 12 · `large` 16 · `large-increased` 20 ·
`extra-large` 28 · `extra-large-increased` 32 · `extra-extra-large` 48 · `full` (totalmente arredondado).

Regra de cantos aninhados (*optical roundness*): **raio interno = raio externo − padding**
(exemplo da página: 48 − 14 = 34). Evitar grande/completo em componente denso de informação (cartão).

## Elevação — níveis

Nível 0 a 5, em dp: **0 · 1 · 3 · 6 · 8 · 12**. No tema escuro a elevação se lê também pela
sobreposição tonal (tinta `surface-tint` sobre o contêiner), não só pela sombra.

## Camadas de estado

Camada sobre o contêiner, na cor do conteúdo (normalmente a `on-…`), com opacidade fixa:
**hover 8% · foco 10% · pressionado 10% · arrastado 16%**. Desabilitado tem regra própria.

## Movimento

**Durações:** short1–4 = 50 · 100 · 150 · 200 ms; medium1–4 = 250 · 300 · 350 · 400 ms;
long1–4 = 450 · 500 · 550 · 600 ms; extra-long1–4 = 700 · 800 · 900 · 1000 ms.

**Curvas (cubic-bezier):**

| Token | Valor |
|---|---|
| emphasized / standard | 0,2 · 0 · 0 · 1 |
| emphasized-decelerate | 0,05 · 0,7 · 0,1 · 1 |
| emphasized-accelerate | 0,3 · 0 · 0,8 · 0,15 |
| standard-decelerate | 0 · 0 · 0 · 1 |
| standard-accelerate | 0,3 · 0 · 1 · 1 |
| legacy (e `-decelerate`/`-accelerate`) | 0,4·0·0,2·1 · 0·0·0,2·1 · 0,4·0·1·1 |

O M3 Expressive troca a base de curvas por **molas** (rápida/padrão/lenta; *spatial* com
overshoot para posição, tamanho e raio; *effects* sem overshoot para cor e opacidade). O app é
utilitário e usa o esquema **standard** com o `useSpring` do MSDS; as molas do MSDS são
"valores aproximados" até serem conferidas contra a especificação de movimento.

## Mapeamento M3 → app (o que este arquivo autoriza)

| M3 | App hoje | Ação |
|---|---|---|
| Forma: escala 0…full | `--radius-seat/control/card/panel/xl/full` (por papel) | Acrescentar `--shape-*`; os raios atuais apontam para ela. |
| Elevação 0–5 | `--shadow-card/control/raised/float/overlay/lift` | Acrescentar `--elevation-0…5`. |
| Estados 8/10/10/16 | `.msds-state-layer` 6%/10%; hover por borda/cor/translação | Um só mecanismo; hover sem movimento. |
| Tipografia 15 papéis | 6 papéis (display, title, heading, body, support, caption) | 15 nomes M3, tamanhos compactos. |
| Movimento | `--msds-ease*`, `--msds-dur*` | Variáveis M3 ao lado das atuais. |
| Cor: papéis completos | `--md-sys-color-*` (parcial no `container`) | Derivar do matiz de cada rota. |
