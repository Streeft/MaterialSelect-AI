# Roteiro v3 — vídeo completo, tom de tutorial (para aprovação)

**Status:** rascunho para aprovação do autor. Nada foi narrado nem regravado.
**Voz:** Marcio (ElevenLabs, `eleven_v4`), com marcas de emoção entre colchetes.
As marcas guiam a voz e **não** entram na legenda.
**Corte curto:** não muda (continua o aprovado).
**App:** `main` em `5b3f25b3` (D-218 a D-223), rodando local em modo produção, com banco
de gravação próprio e a conta "Participante". Produção não é tocada.

## Números conferidos na API nova (12/11/2026)

Os mesmos da v2: 678 materiais; funil 678 → 364 → 268 → 194; vencedor CFRP (Fibras de
Carbono Contínuas) com nota 0,9991; mesmo 1.º colocado nos 3 cenários; mapa com 673 de
678; placa com EPS 15 kg/m³ em 1.º e balsa em 2.º. A conferência à mão (3,2 × 10⁻¹⁶ e
7,7 × 10⁻¹⁶) não depende da interface e continua valendo.

## Regras mantidas

- Nada da viga da bicicleta: nem "Carregar exemplo", nem "Usar o exemplo" do
  Dimensionar, nem o atalho "Viga leve e rígida em flexão" do Início (escondido só no
  navegador da gravação), nem a ficha do vencedor do exemplo.
- Selo "Dados demonstrativos (fictícios)" em toda tela gravada.
- Todo número dito aparece na tela no mesmo instante.
- A IA nunca decide; Ashby (2017) citado como antes.
- Legenda: no máximo 2 linhas de 42 caracteres.

## Capítulos

| Capítulo | Cenas |
|---|---|
| Abertura | A0, A1, **I1** |
| 1. O método | C1, M1, M2, M3 |
| 2. Seleção | C2, S1 (refeita), S2, S3, S4, S5, S6, S7, S8, **S9** |
| 3. Mapas e comparação | C3, P1, P2, P3, **P4**, **K1** |
| 4. Dados confiáveis | C4, D1, D2, D3 |
| 5. Dimensionar e custo | C5, Z1 (refeita), Z2, **Z3** |
| 6. Demais recursos | C6, R1 (refeita) |
| 7. Verificação e limites | C7, V1, V2 |
| Encerramento | C8, E1 |

Em **negrito**, as cenas novas. Todas as cenas com tela são regravadas, porque a
interface mudou.

## Cenas

| Cena | Narração (com as marcas da voz) | Tela | Animação nova (motion) |
|---|---|---|---|
| A0 | (sem narração, 8 s) | Abertura animada da v2 | Igual à v2 |
| A1 | [excited] E aí! Já precisou escolher um material e acabou indo no de sempre? [laughs] Normal. Só que escolher por costume esconde o critério da escolha. [warmly] O método de Ashby faz o contrário: parte do que a peça precisa fazer e chega a números que dá pra comparar. E o MaterialSelect AI é uma aplicação web pra você aprender e praticar esse método. [short pause] Ah, um aviso importante: os materiais do catálogo são demonstrativos. Os valores são fictícios e servem pra mostrar o método. | Início, voo 3D da v2 | Terço inferior com autor e orientador; a palavra "fictícios" ganha um carimbo |
| I1 | [curious] Quando você abre o app, cai aqui no Início, com uma pergunta bem direta: o que a peça precisa fazer? [excited] Tem um guia de primeiros passos, com três tarefinhas pra marcar. E aqui embaixo ficam os estudos salvos, pra retomar de onde parou. Bora começar pela Seleção! | Início: campo "O que a peça precisa fazer?", "Primeiros passos", "Retomar um estudo" | Lista de 3 caixas desenhada que se marca ✓ ✓ ✓ no ritmo da fala; seta desenhada à mão até "Retomar um estudo"; zoom suave no título |
| C1 | (cartela: O método) | | Igual à v2 |
| M1 | [warmly] Antes de clicar em qualquer coisa, deixa eu te mostrar a lógica. A seleção tem quatro passos. A função diz o que a peça faz. O objetivo diz o que você quer minimizar ou maximizar, tipo a massa. Os limites dizem o que o material precisa aguentar. E o resultado ordena quem sobrou. | Passos da Seleção | Escada dos 4 passos da v2 |
| M2 | Ashby, em 2017, organiza o problema em função, restrições, objetivo e variáveis livres. Olha o tirante leve e rígido: a massa é a área vezes o comprimento vezes a densidade. A rigidez exigida fixa a área. [excited] Substituindo, sobra um grupinho só de propriedades do material: o módulo de Young sobre a densidade. Minimizar a massa é maximizar esse índice de desempenho. Simples assim! | Quadro da v2 | Tirante que estica e equações coloridas (v2) |
| M3 | Primeiro vem a triagem: os limites eliminam quem não atende. Depois, a classificação: o índice ordena quem passou. [confident] Todo número é calculado no servidor, de forma determinística. E a inteligência artificial? Ela é opcional: só interpreta o texto do pedido e redige explicações. Ela não produz valores e não decide. | Quadro da v2 | Chips e carimbo "não decide" (v2) |
| C2 | (cartela: Seleção) | | |
| S1 | Na Seleção, o estudo virou um documento. O nome é o título: vamos chamar de Tirante leve. Logo abaixo, uma linha resume função, objetivo, limites e variáveis livres, e cada item leva direto pro passo dele. [excited] Na etapa Função, descrevemos a peça: um tirante em tração, com a menor massa para uma rigidez dada. E ao lado, o funil começa com o catálogo inteiro: 678 materiais demonstrativos. | Título vivo "Estudo sem título" → "Tirante leve"; linha de propriedades; Função | Sublinhado que corre sob o título digitado; linhas finas ligando cada item da linha de propriedades ao seu passo; contador 678 |
| S2 | Na etapa Objetivo, escolhemos o índice: rigidez específica, E sobre rô. O cartão mostra quando ele vale: função, geometria, objetivo e limite. | Objetivo | Chip da fórmula (v2) |
| S3 | Quer montar o seu próprio índice? Tem calculadora, com cartões de propriedade e um teclado. O servidor confere a expressão e devolve a dimensão e a unidade do resultado. [laughs] Nada de unidade misturada! | Calculadora do índice | Chip "Servidor confere" + um cubo de unidades que gira e encaixa |
| S4 | A classificação pode combinar critérios: o índice pesa 0,7 e o custo por massa, 0,3. E os pesos precisam somar um. | Pesos | Barras de pesos e "0,7 + 0,3 = 1" (v2) |
| S5 | Agora, os Limites. Cada restrição tem unidade explícita: resistência à tração de pelo menos 100 megapascal. A frase embaixo confirma como o app leu. Somamos tenacidade à fratura de pelo menos 15 megapascal raiz de metro, e temperatura de serviço de pelo menos 200 graus Celsius. [excited] E olha o funil recalculando no servidor: de 678 materiais, sobram 364, depois 268 e, no fim, 194! | Limites e funil | Funil 3D (v2), agora com uma "chuva" de pontos que some a cada etapa |
| S6 | [excited] E o vencedor é… um compósito de fibras de carbono contínuas, com nota 0,999 numa escala de zero a um! A aba Classificação lista os candidatos, com o valor do índice e a nota. | Resultado | Rufar: holofote que varre a tela e para no vencedor; nota 0,999 em chip |
| S7 | Na aba Eliminados você vê quem saiu e em que etapa. [warmly] E repara: um material sem o dado necessário não ganha zero. Ele sai da classificação e aparece listado, com o motivo. | Eliminados | Carimbo "ausente ≠ zero" (v2) |
| S8 | A Sensibilidade refaz a classificação com outros pesos. Aqui, o primeiro colocado se mantém nos três cenários. E a aba Origem dos dados guarda os limites, a expressão do índice e os pesos que geraram esse resultado. | Sensibilidade, Origem dos dados | Três balanças que pendem e voltam, com o mesmo 1.º colocado |
| S9 | Gostou do resultado? Salve o estudo. O botão Meus estudos, lá em cima, abre a lista num painel ao lado, com exportar, laudo, explicação e executar de novo. [warmly] Tudo pronto pra você voltar depois. | Salvar; "Meus estudos (1)" abre o painel lateral | Selo "Salvo ✓" que pula; o botão ganha um brilho e o número 1 pula no contador |
| C3 | (cartela: Mapas e comparação) | | |
| P1 | Bora pros Mapas! No mapa de propriedades, os dois eixos estão em escala logarítmica: densidade na horizontal, módulo de Young na vertical. Cada ponto é um material, e cada envelope reúne uma classe. Aqui, 673 de 678 materiais aparecem. Os outros cinco ficam listados abaixo, com o motivo. | Mapa Módulo de Young × Densidade | Setas dos eixos (v2) e uma lupa que passa sobre um envelope |
| P2 | Agora, a placa leve e rígida. O índice é a raiz cúbica do módulo de Young sobre a densidade. Em escala log-log, ele vira uma reta de inclinação 3, calculada no servidor a partir da expressão. | Linha de índice no inspetor | Giro da inclinação 1 → 3 (v2) |
| P3 | A reta liga materiais de mesmo desempenho. [excited] Quem fica acima dela tem índice maior: pra mesma rigidez, faz uma placa mais leve. No tirante, com E sobre rô, a mesma leitura vale pra uma reta de inclinação 1. | Reta da placa e do tirante | Área acima da reta acende (v2) |
| P4 | Repara no painel do lado: é um inspetor, com seções que dobram. E os mapas clássicos de Ashby trocam os eixos com um clique. | Inspetor; um mapa clássico e volta | Dobra das seções com um "clique" sonoro; eixos que se trocam num giro |
| K1 | E pra colocar dois materiais frente a frente? O Comparar já sugere pares clássicos, como cobre e alumínio. [excited] Um clique, e eles aparecem lado a lado, propriedade por propriedade, com o melhor de cada linha marcado. | Comparar: "Pares clássicos" → Cobre × Alumínio | Dois cartões que entram de lados opostos e batem num selo "VS" antes de abrir a tabela real |
| C4 | (cartela: Dados confiáveis) | | |
| D1 | O Catálogo lista os 678 materiais, com a classe e a qualidade de cada dado. As famílias ficam logo no topo: cerâmicas, compósitos, elastômeros, metais e polímeros. | Catálogo com "Famílias" | Os cartões das famílias sobem em cascata; contador 678 |
| D2 | Abrindo uma ficha, cada valor mostra a unidade original, a unidade de leitura, a conversão, a fonte e a qualidade. Neste catálogo, a qualidade é estimada: não há valores medidos. E um valor que falta aparece escrito: ausente. [confident] Ele nunca vira zero. | Ficha de material | Carimbo "nunca vira zero" (v2) |
| D3 | O Importar recebe planilhas CSV ou XLSX. Este arquivo, criado pro vídeo, tem três materiais fictícios. A ferramenta sugere o mapeamento das colunas e pede a unidade de cada uma. A validação mostra o resultado de cada linha antes de importar. No material B, a resistência à tração ficou em branco: na ficha, ela aparece como ausente, não como zero. | Importar em 4 passos | Linhas do CSV (v2); a célula vazia pisca e vira a etiqueta "ausente" |
| C5 | (cartela: Dimensionar e custo) | | |
| Z1 | O Dimensionar leva do índice à peça. E agora não tem botão de calcular: o resultado aparece enquanto você digita. Para um tirante de 0,5 metro e rigidez de 2 vezes 10 à sétima newtons por metro, cada material recebe a massa e a área necessárias. A massa é o fator estrutural dividido pelo índice. Aqui entra o catálogo inteiro, sem os limites da seleção. | Caso "Tirante em tração", campos com unidade dentro, resultado ao vivo | Etiqueta "ao vivo" com um pulso a cada tecla; o botão "Calcular" antigo aparece riscado e sai voando |
| Z2 | Na placa, de 0,4 por 0,3 metro, biapoiada, a variável livre é a espessura. [surprised] E olha que curioso: com o expoente um terço, espumas e madeira de balsa sobem ao topo! Elas compensam a baixa rigidez com espessura. | Caso da placa | Placa que flete (v2) e uma espuma que "incha" de espessura |
| Z3 | Quer saber quanto custa? O botão Estimar custo leva a massa pro Custo, que avisa: massa calculada no Dimensionar. Dá pra comparar outros materiais com a mesma massa, lote e premissas. | Dimensionar → Custo | Um "pacote" escrito "massa" voa de uma tela para a outra |
| C6 | (cartela: Demais recursos) | | |
| R1 | E tem mais, em passagem rápida! Os Processos têm uma matriz com os materiais. O Painel mostra o preenchimento e a qualidade do catálogo. Os Cadernos respondem citando a fonte. O Eco audita energia e carbono em cinco fases. O Baterias dimensiona um conjunto de células. O Sintetizar estima compósitos, espumas e painéis sanduíche, cada um com seu desenho. O Glossário explica cada propriedade. Meus registros guarda os seus materiais. E Classes e Propriedades organizam o catálogo. | Passeio rápido | Movimentos rápidos de câmera da v2 + um ícone animado por recurso (folha no Eco, pilha carregando no Baterias, camadas do sanduíche se montando) |
| C7 | (cartela: Verificação e limites) | | |
| V1 | E dá pra confiar nas contas? [confident] A gente refez à mão os casos do tirante e da placa, em 50 materiais cada. A maior diferença relativa ficou na ordem de 10 à menos 16: é o arredondamento do próprio computador. | Cartela da v2 | Igual à v2 |
| V2 | Agora, os limites, com sinceridade: a ferramenta não substitui ensaio, não traz valores medidos e não especifica material pra um projeto real. Ela serve pra ensinar o método e pra uma triagem inicial. | Cartela da v2 | Igual à v2 |
| C8 | (cartela: Encerramento) | | |
| E1 | [excited] E aí, curtiu? Se você é estudante de Engenharia de Materiais, participe do teste de usabilidade pelo formulário: o link está na descrição. O código está no repositório público, no GitHub. [warmly] Valeu demais, e até a próxima! | Encerramento da v2 | Pequena chuva de confete em volta do anel de pontos |

## Estimativa

- **Duração:** cerca de 9 min 30 s (a v2 tinha 8 min).
- **Narração:** cerca de 7 300 caracteres sem as marcas. Na `eleven_v4`, 1 crédito por
  caractere: cerca de **7 300 créditos** por tomada, mais uma margem de uns 20% para
  refazer frases: **cerca de 9 000 créditos** no total.
- Antes de gerar o vídeo inteiro, gero **uma cena curta** (A1, cerca de 450 créditos)
  para você ouvir o tom.
