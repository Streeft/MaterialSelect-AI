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
  "maleável" — 2% de `transform` na curva do Material 3, sem biblioteca.
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

