# Roteiro-mestre — vídeo de apresentação do MaterialSelect AI

**Status:** rascunho para aprovação do autor. Nada foi gravado nem narrado.
**Trabalho:** TCC de Engenharia de Materiais, UFRGS. Autor: Francisco de Almeida Lemos.
Orientador: Prof. Dr. Felipe Antonio Lucca Sánchez.
**Versão principal:** cerca de 8 min 14 s nesta versão, ou cerca de 7 min 55 s com a opção R1(a) (alvo 6 a 8 min), 9 blocos com capítulos.
**Corte curto:** cerca de 3 min (Abertura, Seleção resumida, Mapas resumido,
Encerramento), para o formulário.

Esta versão substitui o roteiro de 13 min aprovado antes (a versão entregue tinha
9 min 20 s). O histórico dele fica no Git.

## Base e convenções

- App local em modo produção (`next build --webpack` + `next start`), API local com
  `ENVIRONMENT=development`, 4 processos `uvicorn`, banco SQLite **local de
  gravação** semeado com `app.db.seed` + `app.db.seed_extended`. Produção não é
  tocada. Conta da sessão fixa renomeada para **"Participante"**, e-mail
  `participante@exemplo.invalid` (só no banco local).
- Durações-alvo calculadas a **2,4 palavras/s** (voz calma) mais o tempo de ação
  sem fala. A duração real de cada cena = áudio da cena + 0,5 s.
- **Cursor** = trajetória curva, contorno e pulso no alvo, 300 ms, clique.
  **Digitar** = 40 a 70 ms por tecla. **Zoom** = 1,15× a 1,3×, entrada e saída de
  400 ms. **Selo demo** = cartela fixa no canto inferior direito "Dados
  demonstrativos (fictícios)". **Cartela de capítulo** = 2 s, número e nome.
- **Sons:** `clique` (curto, −30 dBFS), `ok` (confirmação), `trans` (transição de
  capítulo). Trilha sob toda a peça, com *ducking* sob a voz.
- Coluna "Número citado": todo número narrado, com o elemento de tela que o
  mostra **no mesmo instante**. ✔ = conferido nesta preparação contra a API
  local (09/11/2026). ◐ = valor conferido na API; a forma escrita na tela será
  lida de volta pelo gravador (`r.expect`) e a cena para se divergir.

## Números conferidos na preparação (API local, banco de gravação)

| Grandeza | Valor | Origem da conferência |
|---|---|---|
| Materiais no catálogo demo | 678 | `select count(*) from material`; tela Catálogo "678 materiais" |
| Funil do tirante (tração ≥ 100 MPa; tenacidade ≥ 15 MPa·m^½; Tmáx ≥ 200 °C) | 678 → 364 → 268 → 194 | `POST /api/selection/run` |
| Vencedor do tirante (índice 0,7 + custo por massa 0,3) | CFRP (Fibras de Carbono Contínuas), nota 0,9991 | idem |
| Sensibilidade | mesmo primeiro colocado nos 3 cenários (pesos iguais, ênfase no índice, ênfase no custo) | idem |
| Mapa padrão Módulo de Young × Densidade | 673 de 678 plotados; 5 listados em "Materiais fora do mapa" | tela `/app/mapas` |
| Inclinação da reta da placa, E^(1/3)/ρ | 3 | `docs/08-visualizacao.md` + tela "Inclinação (log-log)" (◐) |
| Inclinação da reta do tirante, E/ρ | 1 | idem (◐) |
| Dimensionar tirante, L = 0,5 m, S = 2 × 10⁷ N/m | fator estrutural 5 × 10⁶; 1.º: 0,0167 kg | `POST /api/solver/resolver` |
| Dimensionar placa, 0,4 × 0,3 m, S = 5 000 N/m, biapoiada | 1.º EPS 15 kg/m³ (0,079 kg), 2.º madeira de balsa (0,081 kg) | idem |
| Conferência à mão, 50 materiais por caso | maior diferença relativa 3,2 × 10⁻¹⁶ (tirante) e 7,7 × 10⁻¹⁶ (placa) | script `scripts/verificar_casos.py` (a criar a partir de `probe2`), valores originais × fatores exatos de unidade, aritmética decimal de 50 dígitos |

A diferença da ordem de 10⁻¹⁶ é o arredondamento da aritmética de ponto flutuante
(ε de máquina ≈ 2,2 × 10⁻¹⁶); ela vem, por exemplo, de 3,51 g/cm³ virar
3509,9999999999995 kg/m³ na conversão. O repositório não documentava esse número;
ele foi medido agora e vai para a tela numa cartela que cita o script.

## Regras editoriais aplicadas (e como)

1. **Tarefas T1 a T5 protegidas.** Nenhuma cena mostra o botão de exemplo pronto da
   etapa Função, a linha de índice da viga nem o dimensionamento da viga. O
   exemplo pronto vence com **"CFRP UD Alto Módulo / Epóxi"** (conferido na API);
   a ficha desse material **não** aparece, e o nome dele não recebe zoom em
   nenhuma lista.
2. **Elementos que citam a viga, ocultos só no navegador da gravação** (folha de
   estilo injetada pelo Playwright, o app não muda; decisão D1 já aprovada na
   versão anterior): o botão de exemplo pronto na etapa Função, a dica do campo
   "Nome do estudo", o atalho de viga do Início e o texto de exemplo da caixa
   "Função do componente".
3. **Listas que contêm a viga** (cartões de índice da etapa Objetivo, seletor de
   linha de índice dos Mapas, seletor de caso do Dimensionar): o gravador
   escolhe a opção por `selectOption` ou clique direto, **sem abrir a lista
   nativa**; o enquadramento recorta o cartão escolhido. O OCR da verificação
   final procura as strings proibidas em todos os quadros.
4. Selo demo em toda cena com valor; a narração diz isso na **primeira** cena
   (A1) e o repete na cena da ficha (D2).
5. IA descrita como opcional: interpreta o pedido e redige explicações; nunca
   produz número nem decide.
6. Sem dados pessoais: conta "Participante"; nenhum e-mail na tela (o menu da
   conta não é aberto).

---

## Abertura (alvo 0:30)

| Cena | Bloco | Duração-alvo | Narração (texto exato) | Ações de tela | Destaque/zoom | Motion graphic | Som | Número citado e onde aparece |
|---|---|---|---|---|---|---|---|---|
| A0 | Abertura | 5 s | (sem narração) | — | — | Vinheta de título: "MaterialSelect AI" · "Seleção de materiais pelo método de Ashby" · "Trabalho de Conclusão de Curso · Engenharia de Materiais · UFRGS" · "Francisco de Almeida Lemos" · "Orientador: Prof. Dr. Felipe Antonio Lucca Sánchez" | trilha entra (fade-in 1,5 s) | — |
| A1 | Abertura | 28 s | Escolher um material por uma lista do que já se conhece esconde o critério da escolha. O método de Ashby faz o contrário: parte do que a peça precisa fazer e chega a números que se comparam. O MaterialSelect AI é uma aplicação web para ensinar e praticar esse método. Os materiais do catálogo são demonstrativos: os valores são fictícios e servem para mostrar o método. | `/app` (Início) parado; cursor em repouso no canto | zoom lento 1,0 → 1,15× no título "O que a peça precisa fazer?" | selo demo entra junto da frase "Os materiais do catálogo…" | — | nenhum |

## 1. O método (alvo 1:00)

| Cena | Bloco | Duração-alvo | Narração (texto exato) | Ações de tela | Destaque/zoom | Motion graphic | Som | Número citado e onde aparece |
|---|---|---|---|---|---|---|---|---|
| C1 | 1. O método | 2 s | (sem narração) | — | — | Cartela "1 · O método" | trans | — |
| M1 | 1. O método | 18 s | A seleção segue quatro passos. A função diz o que a peça faz. O objetivo diz o que se quer minimizar ou maximizar, como a massa. Os limites dizem o que o material precisa atender. O resultado ordena os candidatos que sobraram. | `/app/selecao`, etapa 1; cursor passa pelos quatro cartões de etapa (Função, Objetivo, Limites, Resultados) sem clicar, um a cada frase | zoom 1,25× na faixa dos quatro cartões | contorno animado no cartão citado | — | nenhum |
| M2 | 1. O método | 27 s | Ashby, em 2017, organiza o problema em função, restrições, objetivo e variáveis livres. No tirante leve e rígido, a massa é a área vezes o comprimento vezes a densidade. A rigidez exigida fixa a área. Substituindo, sobra um grupo só de propriedades do material: o módulo de Young sobre a densidade. Minimizar a massa é maximizar esse índice de desempenho. | `/app/dimensionar`, caso "Tirante em tração, rigidez especificada" já selecionado (sem abrir a lista); clique em "Como o índice sai daí" | zoom 1,2× no bloco da derivação, rolando com a narração | à direita, cartela com as equações em KaTeX: m = A·L·ρ; S = E·A/L; m = S·L²·(ρ/E); M = E/ρ | clique | nenhum |
| M3 | 1. O método | 21 s | Primeiro vem a triagem: os limites eliminam quem não atende. Depois, a classificação: o índice ordena quem passou. Todo número é calculado no servidor, de forma determinística. A inteligência artificial é opcional: só interpreta o texto do pedido e redige explicações. Ela não produz valores e não decide. | `/app/selecao`: painel "Funil de candidatos" e cabeçalho "Função → Objetivo → Limites → Resultados (determinístico, sem IA)" | zoom 1,2× no funil; depois 1,3× no texto "(determinístico, sem IA)" | — | — | nenhum |

## 2. Seleção (alvo 1:30)

Estudo do tirante leve e rígido. Para encurtar, "Função do componente", "Objetivo"
e "Variáveis livres" chegam preenchidos pelo Início (cena S1 digita só o nome), e
o 2.º e o 3.º limites entram com corte seco depois do primeiro digitado em tela.

| Cena | Bloco | Duração-alvo | Narração (texto exato) | Ações de tela | Destaque/zoom | Motion graphic | Som | Número citado e onde aparece |
|---|---|---|---|---|---|---|---|---|
| C2 | 2. Seleção | 2 s | (sem narração) | — | — | Cartela "2 · Seleção" | trans | — |
| S1 | 2. Seleção | 17 s | Na etapa Função, damos nome ao estudo e descrevemos a peça: um tirante em tração, com a menor massa para uma rigidez dada. Ao lado, o funil começa com o catálogo inteiro: 678 materiais demonstrativos. | Digitar "Tirante leve e rígido" em "Nome do estudo" | zoom 1,2× no formulário; depois no painel "Funil de candidatos" | selo demo | teclas (muito baixo) | **678** — painel do funil, "678 de 678 continuam" ✔ |
| S2 | 2. Seleção | 13 s | Na etapa Objetivo, escolhemos o índice: rigidez específica, E sobre rô. O cartão mostra as condições em que ele vale: função, geometria, objetivo e limite. | "Próximo: Objetivo"; clique no cartão "Rigidez específica"; mostrar "Condições de validade" | zoom 1,3× recortando só o cartão escolhido | sobreposição KaTeX "M = E/ρ" junto ao cartão | clique | nenhum |
| S3 | 2. Seleção | 13 s | O índice também pode ser montado na calculadora, com cartões de propriedade e um teclado. O servidor confere a expressão e devolve a dimensão e a unidade do resultado. | Abrir a calculadora de índices; clicar "Módulo de Young", "÷", "Densidade"; o visor mostra validade, dimensão e unidade; fechar sem trocar o índice | zoom 1,25× no visor da calculadora | — | clique ×3 | nenhum |
| S4 | 2. Seleção | 11 s | A classificação combina critérios: o índice pesa 0,7 e o custo por massa, 0,3. Os pesos precisam somar um. | "Continuar: critérios e pesos"; peso do índice 0,7; "Adicionar critério": Custo por massa, menor é melhor, 0,3; esperar "Total 1 de 1" | zoom 1,25× na tabela de pesos | — | clique, ok | **0,7** e **0,3** — campos de peso ◐; **um** — "Total 1 de 1" ◐ |
| S5 | 2. Seleção | 29 s | Na etapa Limites, cada restrição tem unidade explícita: resistência à tração de pelo menos 100 megapascal. A frase abaixo confirma a leitura. Somamos tenacidade à fratura de pelo menos 15 megapascal raiz de metro e temperatura de serviço de pelo menos 200 graus Celsius. O funil recalcula no servidor: de 678 materiais, restam 364, depois 268 e, por fim, 194. | "Próximo: Limites"; digitar "tração", escolher "Resistência à tração", "≥", 100, MPa. **Corte seco** para os três limites prontos | zoom 1,3× em "Lê-se: Resistência à tração ≥ 100 MPa"; depois 1,2× no funil, uma barra por frase | contorno pulsando em cada linha do funil ao ser citada | ok a cada recálculo | **100** MPa, **15** MPa·m^½, **200** °C — linhas de limite ✔; **678, 364, 268, 194** — funil ✔ |
| S6 | 2. Seleção | 15 s | O resultado abre no vencedor: um compósito de fibras de carbono contínuas, com nota 0,999 numa escala de zero a um. A aba Classificação lista os candidatos com o valor do índice e a nota. | "Executar seleção"; aba Resumo; depois aba Classificação | zoom 1,25× em "Vencedor: CFRP (Fibras de Carbono Contínuas)" e na nota | selo demo | ok | **0,999** — "Maior nota ponderada: 0,999 (de 0 a 1)" ◐ |
| S7 | 2. Seleção | 13 s | A aba Eliminados mostra quem saiu e em que etapa. Um material sem o dado necessário não recebe zero: ele sai da classificação e aparece listado, com o motivo. | Aba Eliminados; mostrar "Excluídos por dados ausentes" (Aço Demo B) | zoom 1,25× na linha do excluído e no motivo | — | clique | nenhum |
| S8 | 2. Seleção | 17 s | A aba Sensibilidade refaz a classificação com outros pesos; aqui, o primeiro colocado se mantém nos três cenários. A aba Origem dos dados registra os limites, a expressão do índice e os pesos que geraram o resultado. | Aba Sensibilidade; aba Origem dos dados | zoom 1,2× nos três cenários; depois no bloco "Proveniência do resultado" | — | clique ×2 | **três** cenários — tabela de sensibilidade ✔ |

## 3. Mapas (alvo 1:00)

| Cena | Bloco | Duração-alvo | Narração (texto exato) | Ações de tela | Destaque/zoom | Motion graphic | Som | Número citado e onde aparece |
|---|---|---|---|---|---|---|---|---|
| C3 | 3. Mapas | 2 s | (sem narração) | — | — | Cartela "3 · Mapas" | trans | — |
| P1 | 3. Mapas | 21 s | No mapa de propriedades, os dois eixos estão em escala logarítmica: densidade na horizontal, módulo de Young na vertical. Cada ponto é um material, e cada envelope reúne uma classe. Aqui, 673 de 678 materiais aparecem. Os outros cinco ficam listados abaixo, com o motivo. | `/app/mapas` já carregado (espera do carregamento cortada); rolar até "Materiais fora do mapa" | zoom 1,2× nos eixos; 1,3× em "673 de 678 materiais plotados"; 1,2× na lista dos cinco | setas finas indicando eixo X e eixo Y | — | **673 de 678** — legenda do mapa ✔; **cinco** — lista "Materiais fora do mapa" ✔ |
| P2 | 3. Mapas | 17 s | Agora, a placa leve e rígida. O índice é a raiz cúbica do módulo de Young sobre a densidade. Em escala log-log, ele vira uma reta de inclinação 3, calculada no servidor a partir da expressão. | "Personalizar o mapa"; em "Linha de índice", escolher "Placa leve limitada por rigidez" sem abrir a lista; a reta aparece | zoom 1,3× em "Inclinação (log-log): 3" | KaTeX "M = E^(1/3)/ρ  →  log E = 3·log ρ + 3·log M" ao lado do controle | clique | **3** — "Inclinação (log-log)" ◐ |
| P3 | 3. Mapas | 18 s | A reta liga materiais de mesmo desempenho. Os que ficam acima dela têm índice maior: para a mesma rigidez, dão uma placa mais leve. No tirante, com E sobre rô, a mesma leitura vale para uma reta de inclinação 1. | Mover o nível da reta até um material; depois trocar a linha para "Rigidez específica" (sem abrir a lista) | zoom 1,2× na região acima da reta; 1,3× em "Inclinação (log-log): 1" | sombreado translúcido na região acima da reta (camada Remotion alinhada às coordenadas da captura) | clique | **1** — "Inclinação (log-log)" ◐ |

## 4. Dados confiáveis (alvo 1:00)

| Cena | Bloco | Duração-alvo | Narração (texto exato) | Ações de tela | Destaque/zoom | Motion graphic | Som | Número citado e onde aparece |
|---|---|---|---|---|---|---|---|---|
| C4 | 4. Dados confiáveis | 2 s | (sem narração) | — | — | Cartela "4 · Dados confiáveis" | trans | — |
| D1 | 4. Dados confiáveis | 8 s | O Catálogo lista os 678 materiais, com a classe e a qualidade de cada dado. | `/app/catalogo` | zoom 1,25× em "678 materiais" | selo demo | — | **678** — cabeçalho "678 materiais" ✔ |
| D2 | 4. Dados confiáveis | 21 s | Na ficha, cada valor mostra a unidade original, a unidade de leitura, a conversão, a fonte e a qualidade. Neste catálogo, a qualidade é estimada: não há valores medidos. E um valor que falta aparece escrito como ausente. Ele nunca vira zero. | Buscar e abrir "CMC SiC/SiC por Infiltração de Fundido (MI)" (2.º do tirante; não é o vencedor do exemplo das tarefas); clicar num valor para abrir a proveniência; rolar até uma propriedade "Ausente" | zoom 1,3× no popover de proveniência; 1,25× no rótulo "Ausente" | selo demo | clique | nenhum |
| D3 | 4. Dados confiáveis | 28 s | O Importar recebe planilhas CSV ou XLSX. Este arquivo, criado para o vídeo, tem três materiais fictícios. A ferramenta sugere o mapeamento das colunas e pede a unidade de cada uma. A validação mostra o resultado de cada linha antes de importar. No material B, a resistência à tração ficou em branco: na ficha, ela aparece como ausente, não como zero. | `/app/importar`: enviar `dados/materiais-ficticios-video.csv`; Mapeamento; Validar; Importar linhas válidas; abrir a ficha de "Material Fictício B (vídeo)" | zoom 1,2× no mapeamento (coluna de unidade); 1,25× no relatório; 1,3× em "Resistência à tração: Ausente" | selo demo | clique, ok | **três** materiais — relatório de validação "3 linhas" ◐ |

## 5. Dimensionar (alvo 0:45)

| Cena | Bloco | Duração-alvo | Narração (texto exato) | Ações de tela | Destaque/zoom | Motion graphic | Som | Número citado e onde aparece |
|---|---|---|---|---|---|---|---|---|
| C5 | 5. Dimensionar | 2 s | (sem narração) | — | — | Cartela "5 · Dimensionar" | trans | — |
| Z1 | 5. Dimensionar | 24 s | O Dimensionar leva do índice à peça. Para um tirante de 0,5 metro e rigidez de 2 vezes 10 à sétima newtons por metro, cada material recebe a massa e a área necessárias. A massa é o fator estrutural dividido pelo índice. Aqui entra o catálogo inteiro, sem os limites da seleção. | Caso tirante; digitar comprimento 0,5 e rigidez 20000000; "Dimensionar" | zoom 1,25× nos campos; depois na tabela, **recortada nas 4 primeiras linhas** (a 5.ª é o vencedor do exemplo das tarefas) | rótulo Remotion "S = 2 × 10⁷ N/m" sobre o campo de rigidez | clique, ok | **0,5** m e **2 × 10⁷** N/m — campos do formulário ◐ (o campo mostra 20000000; o rótulo traz a notação científica) |
| Z2 | 5. Dimensionar | 18 s | Na placa, de 0,4 por 0,3 metro, biapoiada, a variável livre é a espessura. Com o expoente um terço, espumas e madeira de balsa sobem ao topo: compensam a baixa rigidez com espessura. | Trocar o caso para "Placa em flexão, rigidez especificada" sem abrir a lista; comprimento 0,4, largura 0,3, rigidez 5000, apoio "Biapoiada, carga no meio do vão"; "Dimensionar" | zoom 1,25× nas três primeiras linhas e na coluna de espessura | — | clique, ok | **0,4** e **0,3** m — campos ◐ |

## 6. Demais recursos (alvo 0:45)

Uma tela por recurso, cerca de 3,5 s cada, corte seco, nome do recurso em
etiqueta inferior esquerda (Remotion), selo demo nas telas com valores.

| Cena | Bloco | Duração-alvo | Narração (texto exato) | Ações de tela | Destaque/zoom | Motion graphic | Som | Número citado e onde aparece |
|---|---|---|---|---|---|---|---|---|
| C6 | 6. Demais recursos | 2 s | (sem narração) | — | — | Cartela "6 · Demais recursos" | trans | — |
| R1 | 6. Demais recursos | 40 s | Outros recursos, em passagem rápida. O Comparar coloca candidatos lado a lado. Os Processos reúnem os processos de fabricação e o que cada um atende. O Painel mostra o preenchimento e a qualidade do catálogo. Os Cadernos respondem citando a fonte. O Custo estima o custo por peça; o Eco, energia e carbono; o Baterias dimensiona um conjunto de células. O Sintetizar estima compósitos e espumas. O Glossário explica cada propriedade. Meus registros guarda materiais próprios. E Classes e Propriedades organizam o catálogo. | Comparar (três primeiros do tirante, gráfico de radar) → Processos (ficha de um processo de conformação) → Painel (Visão geral) → Cadernos (caderno "Seleção de materiais: anotações", uma resposta com citação) → Custo → Eco → Baterias → Sintetizar → Glossário → Meus registros ("Liga Exemplo do Participante") → Classes → Propriedades | zoom 1,15× fixo em cada tela | etiqueta com o nome do recurso, entrando 150 ms antes do corte | clique suave a cada troca | nenhum |

## 7. Verificação e limites (alvo 0:30)

| Cena | Bloco | Duração-alvo | Narração (texto exato) | Ações de tela | Destaque/zoom | Motion graphic | Som | Número citado e onde aparece |
|---|---|---|---|---|---|---|---|---|
| C7 | 7. Verificação e limites | 2 s | (sem narração) | — | — | Cartela "7 · Verificação e limites" | trans | — |
| V1 | 7. Verificação e limites | 15 s | Para conferir o cálculo, refizemos à mão os casos do tirante e da placa, em 50 materiais cada. A maior diferença relativa ficou na ordem de 10 à menos 16, o arredondamento do próprio computador. | Fundo: captura do Dimensionar com a derivação aberta, escurecida | — | Cartela de dados: "Conferência à mão · 50 materiais por caso" · "Tirante: 3,2 × 10⁻¹⁶" · "Placa: 7,7 × 10⁻¹⁶" · fonte: `tools/video-tutorial-banca/scripts/verificar_casos.py` | ok | **50**, **10⁻¹⁶** — cartela ✔ |
| V2 | 7. Verificação e limites | 13 s | A ferramenta não substitui ensaio, não traz valores medidos e não especifica material para um projeto real. Serve para ensinar o método e para uma triagem inicial. | — | — | Cartela com três linhas que entram uma a uma: "Não substitui ensaio" · "Não traz valores medidos" · "Não especifica material para projeto real" | — | nenhum |

## Encerramento (alvo 0:30)

| Cena | Bloco | Duração-alvo | Narração (texto exato) | Ações de tela | Destaque/zoom | Motion graphic | Som | Número citado e onde aparece |
|---|---|---|---|---|---|---|---|---|
| C8 | Encerramento | 2 s | (sem narração) | — | — | Cartela "Encerramento" | trans | — |
| E1 | Encerramento | 28 s | Se você é estudante de Engenharia de Materiais, participe do teste de usabilidade pelo formulário. O código está no repositório público, no GitHub. Obrigado. | — | — | Vinheta final: "Teste de usabilidade: link na descrição" · `material-select-ai-web.vercel.app` · `github.com/Streeft/MaterialSelect-AI` · autor, orientador, UFRGS · "Dados demonstrativos (fictícios)" · "Trilha e sons: ver CREDITOS.md" | trilha sai em fade de 3 s | nenhum |

---

## Corte curto (alvo 2 a 3 min)

Mesma narração e mesmas capturas das cenas abaixo, sem regravar:
**A0, A1, C2, S1, S2, S5, S6, C3, P1, P2, C8, E1**. Soma das durações-alvo:
**2 min 59 s**. A cena S1 já cita o funil e S5 dá os limites e a contagem, então o
corte se sustenta sem o Bloco 1.

## Tempos previstos

| Bloco | Cenas | Alvo | Previsto |
|---|---|---|---|
| Abertura | A0, A1 | 0:30 | 0:33 |
| 1. O método | C1, M1–M3 | 1:00 | 1:08 |
| 2. Seleção | C2, S1–S8 | 1:30 | 2:10 |
| 3. Mapas | C3, P1–P3 | 1:00 | 0:58 |
| 4. Dados confiáveis | C4, D1–D3 | 1:00 | 0:59 |
| 5. Dimensionar | C5, Z1–Z2 | 0:45 | 0:44 |
| 6. Demais recursos | C6, R1 | 0:45 | 0:42 |
| 7. Verificação e limites | C7, V1–V2 | 0:30 | 0:30 |
| Encerramento | C8, E1 | 0:30 | 0:30 |
| **Total** | | **7:30** | **≈ 8:14** |

O Bloco 2 passa do alvo em cerca de 40 s porque a Etapa 4 pede, dentro dele,
quatro etapas, calculadora, pesos, limites, funil e quatro abas. Ver decisão R1.

## Decisões que preciso de você antes de gravar

| # | Ponto | Proposta |
|---|---|---|
| R1 | O Bloco 2 fica com cerca de 2:10 (alvo 1:30) e o total passa de 8 min | **(a)** tirar a calculadora (S3) da Seleção e citá-la em uma frase no Bloco 6, e fundir S7 e S8: Bloco 2 ≈ 1:50, total ≈ 7:55. **(b)** manter tudo e aceitar ≈ 8:14. **Decidido: (b)**, aprovado pelo autor; todas as cenas ficam. |
| R2 | A lista do Dimensionar do tirante tem, na 5.ª linha, o material que vence o exemplo das tarefas | Recortar a tabela nas 4 primeiras linhas (já previsto em Z1). |
| R3 | Ocultar no navegador da gravação os quatro elementos que citam a viga (regra 2) | Manter a decisão D1 aprovada na versão anterior. |
| R4 | O número 10⁻¹⁶ não estava documentado no repositório | Medido nesta preparação; comito `scripts/verificar_casos.py` e a cartela V1 cita o script. Se preferir, troco por "abaixo de um em um trilhão" (mais leigo). |
| R5 | Voz: o Higgsfield tem 10 créditos no plano gratuito; a versão anterior estimou cerca de 54 créditos para a narração completa | Na Etapa 6 eu mostro o custo exato antes de gastar qualquer crédito. |
