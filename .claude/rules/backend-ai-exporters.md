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

Em `exporters/`, o arquivo exportado **não** carrega aviso de limitação de uso nem
de dado demonstrativo ([D-138](docs/DECISIONS.md) revogou o compromisso do item 5
da proposta); fonte, qualidade e licença de cada valor continuam. O modelo `Report` é agnóstico de formato e
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

O **e-mail do laudo** ([D-242](docs/DECISIONS.md)) é um terceiro formato, com escape e estilo próprios:
`exporters/laudo_email.py` escreve estilos **inline** (cliente de e-mail ignora `<style>` e `var(--)`) com os tokens de
`laudo_theme.py` e passa todo texto de pessoa por `html.escape`. Quem fala com o servidor de e-mail é
`services/email_service.py` (`mock` por padrão, `smtp` por `smtplib`): a falha é uma frase nossa em português, **nunca** o texto da
exceção, e `SMTP_PASSWORD` não pode chegar a log, resposta nem linha de banco.

O **laudo do projeto** ([D-263](docs/DECISIONS.md)) é um `Report` comum (`services/assembly_report_service.py`): não calcula, só dispõe o que
`AssemblyService` responde; figura ausente sai com o motivo na célula e total recusado como "sem total". Não é o laudo emitido (sem selo,
código nem QR). Desde a [D-264](docs/DECISIONS.md) sai **sem avisos no topo** (pedido do autor), e `html.py` não desenha a caixa quando
`Report.notices` vem vazio.

D-243: o PDF assinado (`issued_report_pdf`) fica **ao lado** da versão emitida e nunca altera o HTML congelado nem o `content_sha256`;
só se confere `%PDF-` e o tamanho (não se abre nem se verifica assinatura), a substituição é uma linha nova e **nada se apaga**. O link
público de um envio **vence** (`expires_at`), **revoga** e **conta aberturas** sem guardar IP, user agent nem pixel: revogado ou vencido
é 410 com página em português e **nada do laudo**. `laudo_docx.py` e `laudo_pptx.py` partem do mesmo `LaudoDocument` do HTML; os gráficos
são o mesmo SVG, rasterizado por `svg_png.py` (`resvg-py` sob demanda, fonte DejaVu embarcada em `exporters/fonts`), e figura que não
desenha é declarada, nunca omitida em silêncio. Word e PowerPoint **não são o laudo emitido** (sem selo, código nem QR).

Na camada `ai/`, o provedor recebe só o catálogo e o texto — nunca uma sessão de
banco ou o avaliador de expressões — e **toda** saída passa por
`app/ai/guardrails.py` antes de chegar ao usuário. Ao mexer ali, não afrouxe duas
regras: **ancoragem numérica** (todo número de uma restrição proposta tem de
aparecer no enunciado do usuário, inclusive quando uma conversão estaria correta)
e **unidade explícita** (limiar sobre propriedade dimensionada não pode omitir a
unidade — unidade ausente vira a canônica e, numa escala com offset, inverte o
sentido do enunciado). As duas valem para a origem `usuario`. No assistente de
projeto (`/ai/plan`, [D-224](../../docs/DECISIONS.md), decisão do usuário em
12/11/2026) um número pode vir também de um cenário de `use_scenarios.py` (o
modelo escolhe o id; o servidor expande da tabela) ou ser `sugestao_ia`, que
exige unidade compatível e valor dentro de `observed_ranges` e não entra na
execução sem `confirmed`: `sugestao_ia` segue essas salvaguardas, não a ancoragem
no texto. Não afrouxe nenhuma das três checagens e não deixe o modelo escrever a
origem `cenario`.

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

