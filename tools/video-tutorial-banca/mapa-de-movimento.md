# Mapa de movimento — vídeo de apresentação do MaterialSelect AI

Sequência visual cena a cena do [`roteiro-mestre.md`](roteiro-mestre.md): o que entra,
o que sai, transições, zooms e legendas. Os tempos são relativos ao início de cada
cena; a duração real vem da narração (áudio + 0,5 s).

## Linguagem visual comum

| Elemento | Especificação |
|---|---|
| Quadro | 1920×1080, 30 fps. Captura real do app, `deviceScaleFactor` 1 |
| Identidade | Tokens do próprio app (`apps/web/app/globals.css`): roxo da seção Estudar `#73599e`, primário `#4567a8`, superfície `#ffffff`, contêiner `#ebeef5`, texto `#171a21`, contorno `#6f7789`; barra lateral escura do app como fundo das cartelas. Tipografia **Public Sans** (texto) e **IBM Plex Mono** (valores, caminhos), as mesmas do app. Equações em **KaTeX** renderizado no Remotion |
| Cartela de capítulo | 2 s. Fundo escuro liso; número grande em `#73599e` e nome em branco, alinhados à esquerda; entra com *fade* + deslocamento vertical de 12 px em 300 ms, sai com *fade* |
| Transição entre capítulos | *Fade* pelo preto de 0,5 s (0,25 s de saída + 0,25 s de entrada) em volta da cartela |
| Transição dentro do capítulo | Corte seco |
| Zoom | 1,15× a 1,3×, curva `easeInOutCubic`, 400 ms na entrada e na saída; centro no elemento citado; nunca dois zooms se sobrepondo |
| Destaque | Contorno arredondado de 3 px em `#73599e` com pulso suave (escala 1,00 → 1,03 → 1,00, 600 ms), desenhado pelo `overlay.js` na própria captura, antes do clique |
| Cursor | Visível o tempo todo nas cenas de tela; trajetória curva (Bézier), 300 ms parado sobre o alvo antes do clique; círculo de clique de 24 px que expande e some em 250 ms |
| Selo demo | "Dados demonstrativos (fictícios)" no canto inferior direito, 24 px de margem, acima da faixa de legenda; fundo `#ffffff` a 85 %, texto `#171a21`, 22 px. Fixo em toda cena com valores (lista na coluna "Selo" abaixo) |
| Legenda | Até 2 linhas × 42 caracteres, Public Sans 44 px semibold, branco sobre caixa `#000000` a 60 %, centralizada a 72 px da base; sem animação palavra a palavra; troca a cada frase do roteiro, com os tempos do Whisper |
| Etiqueta de recurso (Bloco 6) | Inferior esquerda, nome do recurso em Public Sans 40 px, faixa `#73599e`; entra 150 ms antes do corte |
| Espera do servidor | Qualquer "Recalculando…", "Conferindo a soma dos pesos…" ou carregamento acima de 0,5 s é cortado (relógio do gravador pausa) |

## Sequência

### Abertura

| Cena | t | Entra | Sai | Zoom | Legenda | Selo |
|---|---|---|---|---|---|---|
| A0 | 0–5 s | Vinheta de título: fundo escuro com textura abstrata lenta (gerada por IA, sem texto) ou gradiente próprio; linhas de texto (Remotion) entram em cascata de 120 ms: título, subtítulo, curso, autor, orientador | *Fade* cruzado de 0,5 s para A1 | — | não | não |
| A1 | 0–28 s | Início do app, cursor em repouso | corte para C1 | 1,0 → 1,15× lento (ken burns de 20 s) no título | sim | entra aos ~22 s, com a frase "Os materiais do catálogo…" |

### 1. O método

| Cena | t | Entra | Sai | Zoom | Legenda | Selo |
|---|---|---|---|---|---|---|
| C1 | 0–2 s | Cartela "1 · O método" | *fade* | — | não | não |
| M1 | 0–18 s | Seleção, etapa 1 | corte | 1,25× na faixa das quatro etapas; contorno passa de cartão a cartão, sincronizado com cada frase | sim | não |
| M2 | 0–27 s | Dimensionar, derivação aberta | corte | 1,2× no bloco da derivação, rolagem lenta; à direita, painel Remotion (40 % da largura) com as quatro equações, cada uma entrando quando é dita | sim | não |
| M3 | 0–21 s | Seleção, funil e cabeçalho | corte | 1,2× no funil → 1,3× em "(determinístico, sem IA)" | sim | não |

### 2. Seleção

| Cena | t | Entra | Sai | Zoom | Legenda | Selo |
|---|---|---|---|---|---|---|
| C2 | 0–2 s | Cartela "2 · Seleção" | *fade* | — | não | não |
| S1 | 0–17 s | Etapa Função com o formulário preenchido pelo Início; digitação do nome | corte | 1,2× no formulário → 1,2× no funil ("678") | sim | sim |
| S2 | 0–13 s | Etapa Objetivo; clique em "Rigidez específica" | corte | 1,3× recortando **só** o cartão escolhido; equação "M = E/ρ" em KaTeX ao lado | sim | sim |
| S3 | 0–13 s | Calculadora; três cliques | corte | 1,25× no visor | sim | não |
| S4 | 0–11 s | Critérios e pesos | corte | 1,25× na tabela; "Total 1 de 1" pulsa | sim | sim |
| S5 | 0–29 s | Limites; digitação do primeiro limite; corte seco para os três limites | corte | 1,3× em "Lê-se: …" → 1,2× no funil; cada barra recebe contorno quando citada (364, 268, 194) | sim | sim |
| S6 | 0–15 s | Resultado (Resumo → Classificação) | corte | 1,25× no vencedor e na nota | sim | sim |
| S7 | 0–13 s | Aba Eliminados | corte | 1,25× na linha excluída e no motivo | sim | sim |
| S8 | 0–17 s | Aba Sensibilidade → aba Origem dos dados | *fade* para C3 | 1,2× nos três cenários → 1,2× na proveniência | sim | sim |

### 3. Mapas

| Cena | t | Entra | Sai | Zoom | Legenda | Selo |
|---|---|---|---|---|---|---|
| C3 | 0–2 s | Cartela "3 · Mapas" | *fade* | — | não | não |
| P1 | 0–21 s | Mapa já desenhado (carregamento cortado) | corte | setas Remotion nos eixos (2 s cada) → 1,3× em "673 de 678" → rolagem e 1,2× na lista dos cinco | sim | sim |
| P2 | 0–17 s | Painel "Personalizar o mapa"; reta da placa aparece | corte | 1,3× em "Inclinação (log-log): 3"; a reta é a do app; ao lado, equação KaTeX | sim | sim |
| P3 | 0–18 s | Nível da reta ajustado; troca para a reta do tirante | *fade* para C4 | sombreado translúcido `#73599e` a 15 % acima da reta (camada Remotion alinhada pelas coordenadas da captura) → 1,3× em "Inclinação (log-log): 1" | sim | sim |

### 4. Dados confiáveis

| Cena | t | Entra | Sai | Zoom | Legenda | Selo |
|---|---|---|---|---|---|---|
| C4 | 0–2 s | Cartela "4 · Dados confiáveis" | *fade* | — | não | não |
| D1 | 0–8 s | Catálogo | corte | 1,25× em "678 materiais" | sim | sim |
| D2 | 0–21 s | Ficha do material; popover de proveniência; rolagem até "Ausente" | corte | 1,3× no popover → 1,25× no rótulo "Ausente" | sim | sim |
| D3 | 0–28 s | Importar: arquivo → mapeamento → validação → importação → ficha do Material Fictício B | *fade* para C5 | 1,2× no mapeamento → 1,25× no relatório → 1,3× em "Ausente" | sim | sim |

### 5. Dimensionar

| Cena | t | Entra | Sai | Zoom | Legenda | Selo |
|---|---|---|---|---|---|---|
| C5 | 0–2 s | Cartela "5 · Dimensionar" | *fade* | — | não | não |
| Z1 | 0–24 s | Caso tirante; digitação dos dois valores; tabela | corte | 1,25× nos campos (rótulo Remotion "S = 2 × 10⁷ N/m") → tabela recortada nas 4 primeiras linhas | sim | sim |
| Z2 | 0–18 s | Caso placa; quatro campos; tabela | *fade* para C6 | 1,25× nas três primeiras linhas e na coluna de espessura | sim | sim |

### 6. Demais recursos

| Cena | t | Entra | Sai | Zoom | Legenda | Selo |
|---|---|---|---|---|---|---|
| C6 | 0–2 s | Cartela "6 · Demais recursos" | *fade* | — | não | não |
| R1 | 0–40 s | 12 telas, cerca de 3,3 s cada, na ordem do roteiro; etiqueta com o nome do recurso | *fade* para C7 | 1,15× fixo, leve deriva de 2 % para dar movimento | sim | nas telas com valores (Comparar, Processos, Painel, Custo, Eco, Baterias, Sintetizar) |

### 7. Verificação e limites

| Cena | t | Entra | Sai | Zoom | Legenda | Selo |
|---|---|---|---|---|---|---|
| C7 | 0–2 s | Cartela "7 · Verificação e limites" | *fade* | — | não | não |
| V1 | 0–15 s | Fundo: captura do Dimensionar escurecida a 70 %; cartela de dados (Remotion) com os dois resultados em IBM Plex Mono e a fonte do script | corte | — | sim | não |
| V2 | 0–13 s | Cartela de limites: três linhas entram uma a uma, cada uma quando é dita | *fade* para C8 | — | sim | não |

### Encerramento

| Cena | t | Entra | Sai | Zoom | Legenda | Selo |
|---|---|---|---|---|---|---|
| C8 | 0–2 s | Cartela "Encerramento" | *fade* | — | não | não |
| E1 | 0–28 s | Vinheta final: links do app e do repositório (IBM Plex Mono), créditos, aviso de dados demonstrativos; fica parada nos últimos 15 s | *fade* para preto de 1,5 s; trilha sai em 3 s | — | sim, durante a fala | o aviso faz parte da vinheta |

## Corte curto

A0 → A1 → C2 → S1 → S2 → S5 → S6 → C3 → P1 → P2 → C8 → E1. Mesmas transições;
o *fade* de saída de S6 leva a C3 e o de P2 leva a C8.

## O que é renderizado por quem

| Camada | Ferramenta |
|---|---|
| Telas, cursor, contorno e pulso de clique | Captura real (Playwright + CDP screencast) com `overlay.js` |
| Zoom, cortes, *fades*, montagem | Remotion (zooms e cartelas) + FFmpeg (concatenação, áudio, legenda queimada) |
| Cartelas, etiquetas, setas, sombreado, selo demo, equações | Remotion, texto e fórmulas por código (KaTeX) |
| Textura abstrata de fundo da vinheta (opcional) | Higgsfield, **sem texto**; se não houver crédito, gradiente animado próprio |
