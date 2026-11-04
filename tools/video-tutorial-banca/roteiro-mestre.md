# Roteiro-mestre — vídeo tutorial do MaterialSelect AI para a banca

**Status:** rascunho para aprovação do autor. Nada foi gravado.
**Trabalho:** TCC de Engenharia de Materiais, UFRGS. Autor: Francisco de Almeida Lemos.
Orientador: Prof. Dr. Felipe Antonio Lucca Sánchez.
**Duração-alvo:** cerca de 13 min 30 s (12 a 15 min). As durações abaixo são
estimadas a 2,3 palavras por segundo, mais o tempo de tela sem fala; a duração real
de cada cena é a do áudio dela, com 0,5 s de folga.

## Base desta versão

- App rodando localmente em modo produção (`next build --webpack` + `next start`),
  API local com `ENVIRONMENT=development`, banco SQLite **local de gravação**,
  semeado com `app.db.seed` + `app.db.seed_extended` (678 materiais demonstrativos,
  48 propriedades numéricas, 144 processos). Produção não é tocada.
- Sessão pela mesma via da suíte E2E (`E2E_SESSION_TOKEN` + cookie `msai_session`).
  No banco de gravação o usuário foi renomeado para **"Participante"** (e-mail
  fictício). O código não muda.
- Números marcados **[medido]** já foram conferidos contra a API local nesta
  preparação. Números marcados **[conferir na gravação]** só entram na narração
  depois de lidos na tela durante a gravação; se divergirem, a narração é
  corrigida antes de gerar o áudio da cena.

## Regras editoriais aplicadas

1. Nenhuma cena mostra o botão "Carregar exemplo: viga leve de bicicleta", a linha
   de índice "Viga leve limitada por rigidez", o dimensionamento da viga com
   S = 100 000 N/m nem a ficha do vencedor desse exemplo. Os estudos usados são o
   **tirante leve e rígido** (E/ρ) e a **placa leve e rígida** (E^(1/3)/ρ).
2. Os limites do tirante também evitam os números do enunciado de usabilidade
   (70 GPa, 200 MPa, 80 °C): usamos **Resistência à tração ≥ 100 MPa** e
   **Tenacidade à fratura ≥ 15 MPa·m^½**.
3. Toda cena com valor do catálogo tem a legenda fixa no canto: **"Valores
   demonstrativos (fictícios) — não são medições."** A narração repete isso na
   primeira vez em cada capítulo.
4. A IA aparece só como recurso **opcional**, que interpreta texto e nunca produz
   número. O cálculo é descrito como determinístico, feito no servidor.

## Pontos que dependem da sua decisão

Estes três itens surgiram ao percorrer o app. Preciso do seu sim ou não antes de
gravar.

| # | O que encontrei | O que proponho |
|---|---|---|
| D1 | A etapa 1 da Seleção sempre mostra o botão **"Carregar exemplo: viga leve de bicicleta"**, e o campo "Nome do estudo" tem a dica **"Ex.: Viga de bicicleta."** O Início tem o atalho **"Viga leve e rígida em flexão"** e o texto de exemplo "viga leve que não pode fletir muito, a até 80 °C". | Esconder esses quatro elementos **só no navegador da gravação**, com uma folha de estilo injetada pelo Playwright (como a troca do nome). O app não muda. Alternativa: enquadrar com zoom para que fiquem fora do quadro. |
| D2 | A lista de índices (etapa Objetivo e painel de Mapas) mostra os 12 índices cadastrados, entre eles **"Viga leve limitada por rigidez"**, no fim da lista. | Rolar e ampliar só até o índice escolhido; a viga fica fora do quadro. Nada é escondido. |
| D3 | O funil escreve os rótulos como o servidor os gera: "≥ 100.0 MPa" (ponto decimal) e "MPa\*m\*\*0.5". A frase "Lê-se: …" da etapa mostra a forma legível. | Gravar como está (é a tela real) e citar na narração a frase "Lê-se". Registro o defeito no relatório final; não corrijo, porque `apps/web` e `apps/api` estão fora do escopo. |

Outro achado de preparação, sem decisão sua: com um único processo de API a prévia do
funil enfileirava e o botão Executar ficava desabilitado por mais de 20 s. Com
`uvicorn --workers 4` o estado estabiliza em cerca de 6 s. Durante a gravação a
captura **pausa** enquanto aparece "Recalculando…" ou "Conferindo a soma dos
pesos…", e o trecho de espera não entra no vídeo (corte seco). Se o botão seguir
desabilitado depois de 10 s, a gravação para e eu te aviso.

## Dados preparados antes da gravação (banco local)

- Estudo salvo **"Tirante leve e rígido"** (para o Início mostrar "Retomar um
  estudo" e para a cena de Origem dos dados).
- Caderno **"Seleção de materiais: anotações"** com uma fonte de texto curta
  escrita por mim (resumo do método, sem número de material).
- Um registro próprio **"Liga Exemplo do Participante"** (fictício, `is_demo`
  não se aplica a registro próprio; nome deixa claro que é exemplo), para a cena
  de Meus registros.
- CSV fictício de três materiais, criado por mim, em
  `tools/video-tutorial-banca/dados/materiais-ficticios-video.csv`:
  "Material Fictício A/B/C (vídeo)", com densidade, módulo de Young e resistência
  à tração em unidades declaradas no cabeçalho, e uma lacuna proposital.

---

## Estrutura e tempos

| Capítulo | Conteúdo | Tempo estimado |
|---|---|---|
| Abertura | Título, autor, orientador, problema, o que o vídeo mostra | 0:50 |
| Parte 1 — O método | Função, objetivo, limites, resultado, numa tela real | 2:00 |
| Parte 2 — A ferramenta passo a passo | Início, Seleção, Mapas, Comparar, Catálogo e ficha, Dimensionar, Importar, Processos, Painel | 7:50 |
| Parte 3 — Demais recursos | Cadernos, Custo, Eco, Baterias, Sintetizar, Glossário, Meus registros, Classes e Propriedades | 1:15 |
| Encerramento | Limites da ferramenta e convite ao teste de usabilidade | 1:00 |
| Cartelas de capítulo (5 × 2 s) e transições | | 0:15 |
| **Total** | | **≈ 13:10** |

**Conferência do tempo.** O texto de narração abaixo tem 1 101 palavras
(6 596 caracteres): cerca de **8 min de fala** a 2,3 palavras/s. Os tempos da
tabela somam a fala e as pausas de ação sem fala (digitação, cliques, troca de
aba), estimadas em 3 a 4 min, mais vinhetas. Se a voz escolhida for mais rápida
que isso, o total cai para perto de 11 min e eu acrescento frases nas cenas 1.2,
2.7 e 2.14 para voltar a 12 min ou mais — com o seu aval no texto novo.

Convenções das ações de tela: **cursor** = trajetória curva até o alvo, destaque
com contorno e pulso, espera de 300 ms, clique; **digitar** = 40 a 70 ms por tecla;
**zoom** = 1,15× a 1,3×, transição de 400 ms; **legenda demo** = selo fixo
"Valores demonstrativos (fictícios)".

---

## Abertura (≈ 0:50)

### Cena 0.1 — Vinheta de título (8 s, sem tela do app)
- **Tela:** fundo animado discreto. Texto renderizado por ffmpeg/HTML (nunca por IA):
  "MaterialSelect AI" · "Seleção de materiais pelo método de Ashby" ·
  "Trabalho de Conclusão de Curso — Engenharia de Materiais — UFRGS" ·
  "Francisco de Almeida Lemos" · "Orientador: Prof. Dr. Felipe Antonio Lucca Sánchez".
- **Narração:** nenhuma; trilha entra.

### Cena 0.2 — O problema (≈ 22 s)
- **Tela:** Início do app (`/app`), parado, cursor em repouso. Zoom lento no
  título "O que a peça precisa fazer?".
- **Narração:**
  > Escolher um material pela lista do que se conhece costuma esconder o critério.
  > O método de Ashby faz o contrário. Ele parte do que a peça precisa fazer e
  > transforma isso em números que se comparam.
  > O MaterialSelect AI é uma aplicação web para ensinar e praticar esse método.

### Cena 0.3 — O que o vídeo mostra (≈ 20 s)
- **Tela:** cartela simples com os três capítulos; depois volta ao Início.
- **Narração:**
  > Este vídeo tem três partes. Primeiro, o método. Depois, a ferramenta, passo a
  > passo, com dois estudos clássicos: o tirante e a placa, leves e rígidos. Por
  > fim, os demais recursos e o que a ferramenta não faz.
  > Os materiais do catálogo são demonstrativos. Os valores são fictícios e servem
  > para mostrar o método, não para projetar.

---

## Cartela — "Parte 1 · O método · 2 min" (2 s)

## Parte 1 — O método (≈ 2:00)

### Cena 1.1 — Quatro passos (≈ 30 s)
- **Tela:** `/app/selecao`, etapa 1. Zoom 1,2× no cabeçalho
  "Função → Objetivo → Limites → Resultados (determinístico, sem IA)"; cursor passa
  pelos quatro cartões de etapa sem clicar.
- **Narração:**
  > A seleção segue quatro passos.
  > A função diz o que a peça faz.
  > O objetivo diz o que se quer minimizar ou maximizar, como a massa.
  > Os limites dizem o que o material não pode deixar de atender.
  > O resultado ordena quem sobrou.

### Cena 1.2 — Do objetivo ao índice (≈ 35 s)
- **Tela:** `/app/dimensionar`, caso "Tirante em tração, rigidez especificada"
  já escolhido. Zoom no bloco "Como o índice sai daí", aberto, mostrando a derivação.
- **Narração:**
  > O objetivo e a restrição se combinam num índice de desempenho, como descreve
  > Ashby, em 2017.
  > No tirante, a massa é área vezes comprimento vezes densidade. A rigidez fixa a
  > área. Substituindo, sobra um grupo só de material: módulo de Young sobre
  > densidade. Minimizar a massa é maximizar E sobre rô.

### Cena 1.3 — Mapas e funil (≈ 35 s)
- **Tela:** `/app/mapas`, mapa padrão Módulo de Young × Densidade, em escala
  log-log, com envelopes. **Legenda demo.** Depois, corte para a Seleção, com o
  painel "Funil de candidatos" ampliado.
- **Narração:**
  > Num mapa de propriedades em escala log-log, cada material é um ponto e cada
  > classe é um envelope. Um índice desse tipo vira uma reta.
  > Os limites funcionam como um funil. Cada limite retira candidatos, e a
  > ferramenta mostra quantos e por quê.

### Cena 1.4 — Quem calcula (≈ 20 s)
- **Tela:** Seleção, zoom no texto "(determinístico, sem IA)".
- **Narração:**
  > Todo número é calculado no servidor, de forma determinística. O mesmo estudo,
  > executado de novo, dá o mesmo resultado.
  > A inteligência artificial é opcional. Ela só interpreta texto. Não produz
  > valores e não decide.

---

## Cartela — "Parte 2 · A ferramenta passo a passo · 8 min" (2 s)

## Parte 2 — A ferramenta passo a passo (≈ 7:50)

### Cena 2.1 — Início (≈ 25 s)
- **Tela:** `/app`. Cursor até a caixa "Função do componente"; **digitar**
  "Tirante leve e rígido em tração". Destaque no botão "Montar a seleção". Mostra
  "Retomar um estudo" com o estudo salvo. (D1: atalhos e exemplo de viga ocultos.)
- **Narração:**
  > O Início começa pela função da peça. O texto vira a função do estudo. Os limites
  > e o índice vêm depois.
  > Os estudos salvos ficam aqui, para reabrir e executar de novo.

### Cena 2.2 — Seleção, etapa Função (≈ 25 s)
- **Tela:** clique em "Montar a seleção". Em `/app/selecao`, **digitar**
  "Tirante leve e rígido" em "Nome do estudo" e "Mínima massa para rigidez axial
  dada" em "Objetivo". Destaque no painel "Funil de candidatos": **678 de 678
  continuam** [medido]. **Legenda demo.**
- **Narração:**
  > Na etapa Função, damos nome ao estudo e descrevemos o objetivo.
  > Ao lado, o funil começa com o catálogo inteiro: 678 materiais demonstrativos.

### Cena 2.3 — Seleção, etapa Objetivo: o índice (≈ 35 s)
- **Tela:** "Próximo: Objetivo". Rolar a lista até "Rigidez específica" (D2), zoom
  1,25×, clicar. Mostrar o cartão do índice: expressão em KaTeX, "Dimensão do
  resultado", "Condições de validade" e "Referência: Ashby…".
- **Narração:**
  > Na etapa Objetivo, escolhemos o índice. Para o tirante, é a rigidez específica,
  > E sobre rô.
  > Antes de usar, a ferramenta mostra as condições em que o índice vale: função,
  > geometria, objetivo e limite. Fora delas, o índice não se aplica.

### Cena 2.4 — Calculadora de índices (≈ 25 s)
- **Tela:** abrir a calculadora de índices (modo de montar expressão), arrastar ou
  clicar "Módulo de Young", "÷", "Densidade"; mostrar o visor com validade,
  dimensão e unidade. Fechar sem trocar o índice escolhido.
- **Narração:**
  > Um índice também pode ser montado na calculadora. Os cartões de propriedade e o
  > teclado formam a expressão. O servidor confere a validade e devolve a dimensão e
  > a unidade do resultado.

### Cena 2.5 — Critérios e pesos (≈ 30 s)
- **Tela:** "Continuar: critérios e pesos". Critério 1 = índice, peso 0,7;
  "Adicionar critério": "Custo por massa", menor é melhor, peso 0,3. Esperar
  "Total 1 de 1 — fechado." Zoom na tabela de pesos.
- **Narração:**
  > A classificação pode combinar critérios. Aqui, o índice vale sete décimos da
  > nota e o custo por massa, três décimos. Os pesos precisam somar um, e a tabela
  > mostra quanto cada critério vale.

### Cena 2.6 — Limites com unidade (≈ 45 s)
- **Tela:** "Próximo: Limites". Propriedade: **digitar** "tração", escolher
  "Resistência à tração"; operador "≥ maior ou igual"; valor **100**; unidade
  **MPa**. Zoom na frase **"Lê-se: Resistência à tração ≥ 100 MPa"**. "Adicionar
  limite": "Tenacidade à fratura" ≥ **15** MPa·m^½. Funil ao lado:
  **678 → 364 → 268** [medido na API; conferir na gravação].
- **Narração:**
  > Na etapa Limites, cada linha é uma restrição com unidade explícita. Digitamos
  > cem e escolhemos megapascal. A frase abaixo confirma a leitura.
  > O segundo limite pede tenacidade à fratura de pelo menos quinze. Ele afasta os
  > materiais frágeis, que não servem para tração.
  > O funil recalcula no servidor: de 678, restam 364 e depois 268.

### Cena 2.7 — Resultado: resumo e Classificação (≈ 40 s)
- **Tela:** "Executar seleção". Aba Resumo: zoom em "Vencedor: …" [conferir na
  gravação; na API: "CFRP UD Alto Módulo / Epóxi"]. Aba **Classificação**:
  tabela com posição, material, classe, índice e pontuação. **Legenda demo.**
- **Narração:**
  > O resultado abre no vencedor, com a nota e o que mais pesou nela.
  > A aba Classificação lista todos os candidatos, com o valor do índice e a
  > pontuação de zero a um. Lembrando: os valores são demonstrativos.

### Cena 2.8 — Eliminados (≈ 25 s)
- **Tela:** aba **Eliminados**. Zoom no material excluído por dado ausente [na API:
  um material, "Aço Demo B"; conferir na gravação] e no motivo escrito.
- **Narração:**
  > A aba Eliminados diz quem saiu e por quê. Um material sem o dado necessário
  > não recebe zero. Ele sai da classificação e aparece aqui, com o motivo.

### Cena 2.9 — Sensibilidade (≈ 20 s)
- **Tela:** aba **Sensibilidade**: três cenários de pesos (pesos iguais, ênfase no
  índice, ênfase no custo). [Na API, o vencedor não muda nos três; conferir.]
- **Narração:**
  > A aba Sensibilidade refaz a classificação com outros pesos. Neste estudo, o
  > primeiro colocado se mantém nos três cenários.

### Cena 2.10 — Origem dos dados (≈ 30 s)
- **Tela:** aba **Origem dos dados**: clicar num valor; mostrar valor original,
  unidade original, valor convertido, unidade canônica, fonte e qualidade.
  **Legenda demo.** Em seguida, "Salvar estudo" e o aviso "Estudo salvo."
- **Narração:**
  > Cada número tem origem. A ferramenta guarda o valor e a unidade em que ele foi
  > escrito, o valor convertido, a fonte e a qualidade do dado.
  > Salvo, o estudo pode ser reaberto e executado de novo, com o mesmo resultado.

### Cena 2.11 — Mapas: níveis e eixos (≈ 30 s)
- **Tela:** `/app/mapas`. Cursor em "Nível 1 / Nível 2 / Nível 3" e em "Eixo X /
  Eixo Y" (Densidade e Módulo de Young). Zoom em "673 de 678 materiais plotados"
  [medido] e na lista "Materiais fora do mapa". **Legenda demo.**
- **Narração:**
  > Nos Mapas, escolhemos o nível de detalhe e as propriedades de cada eixo. O nível
  > só muda o que se vê, nunca o cálculo.
  > Um material sem valor não some em silêncio. Ele aparece na lista dos que ficaram
  > fora do mapa, com o motivo.

### Cena 2.12 — Mapas: envelopes e linha de índice da placa (≈ 40 s)
- **Tela:** "Personalizar o mapa". Envelope "Fecho convexo"; em "Linha de índice",
  escolher **"Placa leve limitada por rigidez"** (D2: a lista não rola até a
  viga). Zoom na reta sobre o mapa e no texto da inclinação. **Legenda demo.**
- **Narração:**
  > Agora, a placa leve e rígida. O índice é a raiz cúbica do módulo de Young sobre
  > a densidade.
  > Em escala log-log, ele vira uma reta de inclinação três. A inclinação é
  > calculada no servidor a partir da própria expressão. Os materiais acima da reta
  > são melhores que os que estão sobre ela.

### Cena 2.13 — Comparar (≈ 35 s)
- **Tela:** em Resultados do tirante, "Comparar candidatos" (ou `/app/comparar` com
  os três primeiros). Mostrar tabela com proveniência e trocar para barras e radar.
  **Legenda demo.**
- **Narração:**
  > O Comparar coloca candidatos lado a lado. A tabela mantém a origem de cada
  > valor. Barras, radar, coordenadas paralelas e mapa de calor usam valores
  > normalizados no servidor.

### Cena 2.14 — Catálogo e ficha (≈ 45 s)
- **Tela:** `/app/catalogo`, buscar um material do tirante que **não** seja o
  vencedor do exemplo da viga (ex.: o 3.º colocado do tirante) e abrir a ficha.
  Zoom num valor: unidade original, conversão, fonte e qualidade ("ESTIMADO").
  **Legenda demo.**
- **Narração:**
  > O Catálogo lista os materiais e a qualidade de cada dado. Na ficha, cada
  > propriedade mostra o valor na unidade de leitura e a unidade original, como foi
  > feita a conversão, de que fonte veio e com que qualidade.
  > Neste catálogo, a qualidade é estimada. Não há valores medidos.

### Cena 2.15 — Dimensionar: o tirante (≈ 35 s)
- **Tela:** `/app/dimensionar`, caso tirante. **Digitar** Comprimento **0,5** m,
  Rigidez **20000000** N/m (2 × 10⁷). "Dimensionar". Zoom no fator estrutural e
  nas colunas massa e área. [Números conferidos na gravação.] **Legenda demo.**
- **Narração:**
  > O Dimensionar transforma o índice em massa. Para um tirante de meio metro e
  > rigidez de dois vezes dez à sétima newtons por metro, cada material recebe a
  > massa e a área necessárias.
  > Aqui o catálogo entra inteiro, sem os limites da seleção. Por isso aparecem
  > materiais que a seleção já teria afastado.

### Cena 2.16 — Dimensionar: a placa (≈ 30 s)
- **Tela:** caso "Placa em flexão, rigidez especificada". Comprimento **0,4** m,
  largura **0,3** m, rigidez **5000** N/m, apoio "Biapoiada, carga no meio do
  vão". "Dimensionar". Zoom na coluna de espessura. **Legenda demo.**
- **Narração:**
  > Na placa, a espessura é a variável livre. Com o expoente um terço, materiais
  > muito leves, como espumas e madeira de balsa, sobem na lista, porque compensam
  > a baixa rigidez com espessura.

### Cena 2.17 — Importar (≈ 45 s)
- **Tela:** `/app/importar`. Enviar o CSV fictício de três materiais. Etapa
  Mapeamento: colunas sugeridas, unidade declarada, classe padrão. "Validar":
  relatório com a lacuna proposital marcada como ausente. "Importar linhas
  válidas". [Contagens conferidas na gravação.]
- **Narração:**
  > O Importar recebe planilhas em CSV ou XLSX. Este arquivo tem três materiais
  > fictícios. A ferramenta sugere o mapeamento das colunas e pede a unidade de
  > cada uma.
  > A validação aponta o problema de cada linha. A célula vazia vira dado ausente,
  > e não zero.

### Cena 2.18 — Processos (≈ 25 s)
- **Tela:** `/app/processos`. Famílias; abrir um processo de conformação e mostrar
  atributos de capacidade e materiais compatíveis. **Legenda demo.**
- **Narração:**
  > Os Processos são o segundo universo do método. Cada processo tem atributos de
  > capacidade e a lista de materiais compatíveis, que também entram como etapa da
  > seleção.

### Cena 2.19 — Painel (≈ 25 s)
- **Tela:** `/app/painel`. Abas Visão geral e Qualidade; filtro de classe.
  **Legenda demo.**
- **Narração:**
  > O Painel mostra quanto do catálogo está preenchido, com que qualidade, e como
  > cada propriedade se distribui entre as classes.

---

## Cartela — "Parte 3 · Demais recursos · 1 min" (2 s)

## Parte 3 — Demais recursos (≈ 1:15)

Passagem rápida, uma tela por recurso, cerca de 8 s cada, com o nome do recurso
em legenda inferior.

### Cena 3.1 — Passagem (≈ 75 s)
- **Telas e legendas:** Cadernos (caderno preparado) · Custo · Eco · Baterias ·
  Sintetizar · Glossário · Meus registros (registro próprio preparado) · Classes e
  Propriedades. **Legenda demo** nas telas com valores.
- **Narração:**
  > Há outros recursos.
  > Os Cadernos guardam fontes próprias e respondem citando o trecho de onde veio a
  > resposta.
  > O Custo estima o custo por peça. O Eco faz uma auditoria de energia e carbono.
  > O Baterias dimensiona um conjunto de células.
  > O Sintetizar estima compósitos, espumas e painéis sanduíche, e diz qual lei
  > produziu cada valor.
  > O Glossário explica cada propriedade e como ela se mede.
  > Em Meus registros ficam os materiais próprios de cada pessoa.
  > E em Classes e Propriedades se administra o vocabulário do catálogo.

---

## Cartela — "Encerramento · 1 min" (2 s)

## Encerramento (≈ 1:00)

### Cena 4.1 — O que a ferramenta não faz (≈ 35 s)
- **Tela:** cartela com três linhas, renderizada por mim:
  "Não substitui ensaio." · "Não traz valores medidos: o catálogo é
  demonstrativo." · "Não especifica material para projeto real."
- **Narração:**
  > A ferramenta tem limites claros.
  > Ela não substitui ensaio.
  > O catálogo atual é demonstrativo, sem valores medidos.
  > E ela não especifica material para um projeto real. Serve para ensinar o método
  > e para uma triagem inicial.

### Cena 4.2 — Teste de usabilidade e créditos (≈ 25 s)
- **Tela:** cartela final com "Teste de usabilidade com estudantes de Engenharia de
  Materiais" e o endereço `material-select-ai-web.vercel.app`; créditos (autor,
  orientador, UFRGS) e "Trilha e sons: ver CREDITOS.md".
- **Narração:**
  > O próximo passo é o teste de usabilidade com estudantes. Se você cursa
  > Engenharia de Materiais e quer participar, fale com o autor.
  > Obrigado.

---

## Saídas previstas

Em `tools/video-tutorial-banca/out/` (fora do Git): versão completa com narração,
trilha e legendas; `.srt` separado; `capitulos.txt`; versão sem narração (trilha
e legendas); `roteiro-final.md` com o texto integral e a tabela de tempos.

---

## Alterações feitas na produção (depois da aprovação)

Registradas aqui para que o roteiro aprovado e o vídeo não divirjam em silêncio.
O texto integral narrado está em `roteiro-final.md`.

| Cena | Alteração | Motivo |
|---|---|---|
| 2.2, 2.6 | Estudo "Tirante leve e rígido a 200 °C"; terceiro limite **Temperatura máxima de serviço ≥ 200 °C**; funil 678 → 364 → 268 → **194**; vencedor **CFRP (Fibras de Carbono Contínuas)** | Sem o limite de temperatura, o vencedor do tirante era o mesmo do exemplo da viga (a resposta da tarefa T4). Com ele, o vencedor da viga sai até do top 5. |
| 2.4 | A calculadora passou para os Mapas (eixo Y como expressão), logo depois da placa | Na Seleção, a opção "Expressão personalizada" fica ao lado do cartão "Viga leve limitada por rigidez" |
| 2.8 | "A aba Eliminados mostra quem saiu, e em que etapa." | Pronúncia da voz sintética |
| 2.10 | Narração descreve a "Proveniência do resultado" (limites, expressão, dimensão, método, pesos) | É o que a aba Origem dos dados mostra; a origem de cada valor fica na ficha (2.14) |
| 2.17 | "A validação mostra o resultado de cada linha antes de importar. No material B, a célula vazia não vira zero: na ficha, o valor aparece como ausente." | O relatório de validação não marca a célula vazia; a ausência aparece na ficha do material B, mostrada na cena |
| 2.18 | "…e o conjunto de materiais que ele atende…" | A ficha do processo mostra "Serve N materiais do catálogo", não uma lista |
| 4.2 | "Se você é estudante de Engenharia de Materiais…" | Pronúncia da voz sintética |
