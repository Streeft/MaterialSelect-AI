# Roteiro final — vídeo de apresentação do MaterialSelect AI

Versão completa: **10:28** (628.5 s). Corte curto: **2:59** (179.7 s).
Narração: versão completa com a voz "Marcio" (ElevenLabs, `eleven_v4`); corte curto com a voz "Andre" (ElevenLabs, via Higgsfield). Valores do catálogo: demonstrativos (fictícios). Texto aprovado: versão completa em [`roteiro-v3.md`](roteiro-v3.md); corte curto em [`roteiro-mestre.md`](roteiro-mestre.md) com a decisão R1(b).

## Capítulos (versão completa)

| Capítulo | Início |
|---|---|
| Abertura | 0:00 |
| 1. O método | 0:57 |
| 2. Seleção | 2:13 |
| 3. Mapas e comparação | 5:03 |
| 4. Dados confiáveis | 6:30 |
| 5. Dimensionar e custo | 7:39 |
| 6. Demais recursos | 8:50 |
| 7. Verificação e limites | 9:32 |
| Encerramento | 10:05 |

## Cenas (versão completa)

| Cena | Bloco | Início | Duração (s) | Narração |
|---|---|---|---|---|
| A0 | sem narração, 8 s | 0:00 | 8.0 | (sem narração) |
| A1 | Abertura | 0:08 | 31.4 | E aí! Já precisou escolher um material e acabou indo no de sempre? Normal. Só que escolher por costume esconde o critério da escolha. O método de Ashby faz o contrário: parte do que a peça precisa fazer e chega a números que dá pra comparar. E o MaterialSelect AI é uma aplicação web pra você aprender e praticar esse método. Ah, um aviso importante: os materiais do catálogo são demonstrativos. Os valores são fictícios e servem pra mostrar o método. |
| I1 | Abertura | 0:39 | 18.3 | Quando você abre o app, cai aqui no Início, com uma pergunta bem direta: o que a peça precisa fazer? Tem um guia de primeiros passos, com três tarefinhas pra marcar. E aqui embaixo ficam os estudos salvos, pra retomar de onde parou. Bora começar pela Seleção! |
| C1 | cartela: O método | 0:57 | 2.5 | (cartela: O método) |
| M1 | 1. O método | 1:00 | 20.6 | Antes de clicar em qualquer coisa, deixa eu te mostrar a lógica. A seleção tem quatro passos. A função diz o que a peça faz. O objetivo diz o que você quer minimizar ou maximizar, tipo a massa. Os limites dizem o que o material precisa aguentar. E o resultado ordena quem sobrou. |
| M2 | 1. O método | 1:20 | 29.7 | Ashby, em 2017, organiza o problema em função, restrições, objetivo e variáveis livres. Olha o tirante leve e rígido: a massa é a área vezes o comprimento vezes a densidade. A rigidez exigida fixa a área. Substituindo, sobra um grupinho só de propriedades do material: o módulo de Young sobre a densidade. Minimizar a massa é maximizar esse índice de desempenho. Simples assim! |
| M3 | 1. O método | 1:50 | 23.2 | Primeiro vem a triagem: os limites eliminam quem não atende. Depois, a classificação: o índice ordena quem passou. Todo número é calculado no servidor, de forma determinística. E a inteligência artificial? Ela é opcional: só interpreta o texto do pedido e redige explicações. Ela não produz valores e não decide. |
| C2 | cartela: Seleção | 2:13 | 2.5 | (cartela: Seleção) |
| S1 | 2. Seleção | 2:16 | 30.1 | Na Seleção, o estudo virou um documento. O nome é o título: vamos chamar de Tirante leve. Logo abaixo, uma linha resume função, objetivo, limites e variáveis livres, e cada item leva direto pro passo dele. Na etapa Função, descrevemos a peça: um tirante em tração, com a menor massa para uma rigidez dada. E ao lado, o funil começa com o catálogo inteiro: 678 materiais demonstrativos. |
| S2 | 2. Seleção | 2:46 | 13.1 | Na etapa Objetivo, escolhemos o índice: rigidez específica, E sobre rô. O cartão mostra quando ele vale: função, geometria, objetivo e limite. |
| S3 | 2. Seleção | 2:59 | 15.1 | Quer montar o seu próprio índice? Tem calculadora, com cartões de propriedade e um teclado. O servidor confere a expressão e devolve a dimensão e a unidade do resultado. Nada de unidade misturada! |
| S4 | 2. Seleção | 3:14 | 14.0 | A classificação pode combinar critérios: o índice pesa 0,7 e o custo por massa, 0,3. E os pesos precisam somar um. |
| S5 | 2. Seleção | 3:28 | 34.6 | Agora, os Limites. Cada restrição tem unidade explícita: resistência à tração de pelo menos 100 megapascal. A frase embaixo confirma como o app leu. Somamos tenacidade à fratura de pelo menos 15 megapascal raiz de metro, e temperatura de serviço de pelo menos 200 graus Celsius. E olha o funil recalculando no servidor: de 678 materiais, sobram 364, depois 268 e, no fim, 194! |
| S6 | 2. Seleção | 4:03 | 15.1 | E o vencedor é… um compósito de fibras de carbono contínuas, com nota 0,999 numa escala de zero a um! A aba Classificação lista os candidatos, com o valor do índice e a nota. |
| S7 | 2. Seleção | 4:18 | 13.6 | Na aba Eliminados você vê quem saiu e em que etapa. E repara: um material sem o dado necessário não ganha zero. Ele sai da classificação e aparece listado, com o motivo. |
| S8 | 2. Seleção | 4:31 | 15.8 | A Sensibilidade refaz a classificação com outros pesos. Aqui, o primeiro colocado se mantém nos três cenários. E a aba Origem dos dados guarda os limites, a expressão do índice e os pesos que geraram esse resultado. |
| S9 | 2. Seleção | 4:47 | 16.3 | Gostou do resultado? Salve o estudo. O botão Meus estudos, lá em cima, abre a lista num painel ao lado, com exportar, laudo, explicação e executar de novo. Tudo pronto pra você voltar depois. |
| C3 | cartela: Mapas e comparação | 5:03 | 2.5 | (cartela: Mapas e comparação) |
| P1 | 3. Mapas e comparação | 5:06 | 24.6 | Bora pros Mapas! No mapa de propriedades, os dois eixos estão em escala logarítmica: densidade na horizontal, módulo de Young na vertical. Cada ponto é um material, e cada envelope reúne uma classe. Aqui, 673 de 678 materiais aparecem. Os outros cinco ficam listados abaixo, com o motivo. |
| P2 | 3. Mapas e comparação | 5:30 | 15.5 | Agora, a placa leve e rígida. O índice é a raiz cúbica do módulo de Young sobre a densidade. Em escala log-log, ele vira uma reta de inclinação 3, calculada no servidor a partir da expressão. |
| P3 | 3. Mapas e comparação | 5:46 | 16.7 | A reta liga materiais de mesmo desempenho. Quem fica acima dela tem índice maior: pra mesma rigidez, faz uma placa mais leve. No tirante, com E sobre rô, a mesma leitura vale pra uma reta de inclinação 1. |
| P4 | 3. Mapas e comparação | 6:03 | 10.8 | Repara no painel do lado: é um inspetor, com seções que dobram. E os mapas clássicos de Ashby trocam os eixos com um clique. |
| K1 | 3. Mapas e comparação | 6:13 | 16.4 | E pra colocar dois materiais frente a frente? O Comparar já sugere pares clássicos, como cobre e alumínio. Um clique, e eles aparecem lado a lado, propriedade por propriedade, com o melhor de cada linha marcado. |
| C4 | cartela: Dados confiáveis | 6:30 | 2.5 | (cartela: Dados confiáveis) |
| D1 | 4. Dados confiáveis | 6:32 | 14.3 | O Catálogo lista os 678 materiais, com a classe e a qualidade de cada dado. As famílias ficam logo no topo: cerâmicas, compósitos, elastômeros, metais e polímeros. |
| D2 | 4. Dados confiáveis | 6:47 | 21.1 | Abrindo uma ficha, cada valor mostra a unidade original, a unidade de leitura, a conversão, a fonte e a qualidade. Neste catálogo, a qualidade é estimada: não há valores medidos. E um valor que falta aparece escrito: ausente. Ele nunca vira zero. |
| D3 | 4. Dados confiáveis | 7:08 | 31.4 | O Importar recebe planilhas CSV ou XLSX. Este arquivo, criado pro vídeo, tem três materiais fictícios. A ferramenta sugere o mapeamento das colunas e pede a unidade de cada uma. A validação mostra o resultado de cada linha antes de importar. No material B, a resistência à tração ficou em branco: na ficha, ela aparece como ausente, não como zero. |
| C5 | cartela: Dimensionar e custo | 7:39 | 2.5 | (cartela: Dimensionar e custo) |
| Z1 | 5. Dimensionar e custo | 7:42 | 29.4 | O Dimensionar leva do índice à peça. E agora não tem botão de calcular: o resultado aparece enquanto você digita. Para um tirante de 0,5 metro e rigidez de 2 vezes 10 à sétima newtons por metro, cada material recebe a massa e a área necessárias. A massa é o fator estrutural dividido pelo índice. Aqui entra o catálogo inteiro, sem os limites da seleção. |
| Z2 | 5. Dimensionar e custo | 8:11 | 23.5 | Na placa, de 0,4 por 0,3 metro, biapoiada, a variável livre é a espessura. E olha que curioso: com o expoente um terço, espumas e madeira de balsa sobem ao topo! Elas compensam a baixa rigidez com espessura. |
| Z3 | 5. Dimensionar e custo | 8:35 | 15.8 | Quer saber quanto custa? O botão Estimar custo leva a massa pro Custo, que avisa: massa calculada no Dimensionar. Dá pra comparar outros materiais com a mesma massa, lote e premissas. |
| C6 | cartela: Demais recursos | 8:50 | 2.5 | (cartela: Demais recursos) |
| R1 | 6. Demais recursos | 8:53 | 39.3 | E tem mais, em passagem rápida! Os Processos têm uma matriz com os materiais. O Painel mostra o preenchimento e a qualidade do catálogo. Os Cadernos respondem citando a fonte. O Eco audita energia e carbono em cinco fases. O Baterias dimensiona um conjunto de células. O Sintetizar estima compósitos, espumas e painéis sanduíche, cada um com seu desenho. O Glossário explica cada propriedade. Meus registros guarda os seus materiais. E Classes e Propriedades organizam o catálogo. |
| C7 | cartela: Verificação e limites | 9:32 | 2.5 | (cartela: Verificação e limites) |
| V1 | 7. Verificação e limites | 9:35 | 15.4 | E dá pra confiar nas contas? A gente refez à mão os casos do tirante e da placa, em 50 materiais cada. A maior diferença relativa ficou na ordem de 10 à menos 16: é o arredondamento do próprio computador. |
| V2 | 7. Verificação e limites | 9:50 | 14.8 | Agora, os limites, com sinceridade: a ferramenta não substitui ensaio, não traz valores medidos e não especifica material pra um projeto real. Ela serve pra ensinar o método e pra uma triagem inicial. |
| C8 | cartela: Encerramento | 10:05 | 2.5 | (cartela: Encerramento) |
| E1 | Encerramento | 10:07 | 20.8 | E aí, curtiu? Se você é estudante de Engenharia de Materiais, participe do teste de usabilidade pelo formulário: o link está na descrição. O código está no repositório público, no GitHub. Valeu demais, e até a próxima! |

## Corte curto

| Capítulo | Início |
|---|---|
| Abertura | 0:00 |
| Seleção | 0:30 |
| Mapas e comparação | 1:58 |
| Encerramento | 2:40 |

Cenas: A0 → A1 → C2 → S1 → S2 → S5 → S6 → C3 → P1 → P2 → C8 → E1.
