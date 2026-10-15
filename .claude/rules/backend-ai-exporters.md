---
paths:
  - "apps/api/app/ai/**"
  - "apps/api/app/exporters/**"
  - "apps/api/app/importers/**"
---

# Backend: importers, exporters e camada de IA

(Movido do `CLAUDE.md` da raiz sem alteração de texto; carrega só ao tocar nesta área.)

`importers/` (Fase 3), `ai/` (Fase 6) e `exporters/` (Fase 7) estão
implementadas.

Em `exporters/`, **todo arquivo exportado carrega o aviso de limitação de uso**
(compromisso do item 5 da proposta). O modelo `Report` é agnóstico de formato e
tem dois renderizadores: `spreadsheet.py` (CSV/XLSX) e `html.py` (imprimível). O cartão
de material para CAE ([D-104](docs/DECISIONS.md)) **não** passa pelo `Report`:
`exporters/cae/` lê um `CaeCard` já convertido para o sistema de unidades que o
usuário escolheu, e cada formato declara o que exige — faltando, a exportação é
recusada (422), nunca escrita com o branco que o solver preencheria.

`Report.figures` é uma **lista** porque um documento de seleção tem mais de uma
figura, e a ordem é a da leitura. O relatório leva o **mapa de seleção**; o
laudo leva o mapa e o gráfico de ranking ([D-53](docs/DECISIONS.md)). Os eixos
do mapa saem da expressão do índice, na ordem em que ela os nomeia — é nesse par
que o índice é uma reta —, e a geometria vem de `ChartService.property_map`, a
mesma chamada que serve a tela: reimplementá-la no exportador criaria duas
verdades sobre a mesma figura. Figura que não pode ser desenhada é **omitida com
a razão na legenda**, nunca falha a exportação.

O envelope de classe é uma **nuvem** ([D-54](docs/DECISIONS.md)): elipse com
folga e piso de tamanho, para que uma classe de um material ainda se leia como
família — o fecho convexo precisa de três pontos e some no catálogo didático. A
nuvem **alarga** a região além dos materiais nela, então é indicativa, e a
legenda diz isso. O **fecho continua literal** e nunca recebe folga: ele responde
a "qual região exatamente estes materiais ocupam".

**O escape é por formato, e não intercambiável.** `cells.py` neutraliza injeção
de fórmula na planilha com apóstrofo à frente — visível, nunca destrutivo;
números negativos saem como célula numérica de propósito. `html.py` neutraliza
injeção de **marcação** com `html.escape` em todo valor, cabeçalho, título e
nota. Não reaproveite um no outro: um `=` é inerte em HTML, e o apóstrofo
apareceria na tela como corrupção do dado. O HTML ainda é servido sob
`Content-Security-Policy: default-src 'none'`, camada independente do escape.

Na camada `ai/`, o provedor recebe só o catálogo e o texto — nunca uma sessão de
banco ou o avaliador de expressões — e **toda** saída passa por
`app/ai/guardrails.py` antes de chegar ao usuário. Ao mexer ali, não afrouxe duas
regras: **ancoragem numérica** (todo número de uma restrição proposta tem de
aparecer no enunciado do usuário, inclusive quando uma conversão estaria correta)
e **unidade explícita** (limiar sobre propriedade dimensionada não pode omitir a
unidade — unidade ausente vira a canônica e, numa escala com offset, inverte o
sentido do enunciado).

Há quatro provedores: `mock` (padrão, determinístico, sem rede), `claude-api`
(API da Anthropic, chave própria), `claude-cli` (o Claude Code instalado na
máquina, pela assinatura já autenticada) e `openai-compat` (qualquer servidor que
fale `/chat/completions`, escolhido por `AI_BASE_URL` — o Gemini no plano
gratuito do Google AI Studio, que é a IA oficial do projeto desde o D-93, Groq,
Ollama local, OpenRouter, OpenAI). O que os provedores reais compartilham está em
`app/ai/model_base.py` — **não** em um arquivo com "claude" no nome, porque as
garantias são da camada. Duas delas não são negociáveis (D-35): **o modelo
escolhe um índice pelo slug** e a expressão é lida do catálogo depois — não peça
esse campo ao modelo — e **as ressalvas da explicação são do backend**
(`app/ai/caveats.py`), fora do esquema enviado. Um provedor real não é
determinístico, e é por isso que o padrão continua `mock`.

No `openai-compat`, duas coisas parecem descuido e são decisão (D-36):
`AI_BASE_URL` **não tem padrão** (um padrão escolheria um fornecedor pelo
operador; sem ele, o erro traz as receitas prontas) e **chave vazia é
configuração válida** — sem `AI_API_KEY` o cabeçalho `Authorization` não é
enviado, que é o que um Ollama local espera. Degradar o modo JSON é decisão do
operador via `AI_JSON_MODE`, nunca queda silenciosa. E o aviso mostrado ao
usuário nomeia **o host** de destino, nunca o caminho — um caminho de gateway
pode carregar token.

