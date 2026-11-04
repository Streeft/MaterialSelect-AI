# Roteiro final — vídeo tutorial do MaterialSelect AI
Duração total da versão completa: **9 min 20 s** (559.9 s).
Narração: voz sintética Piper `pt_BR-cadu-medium` (local). Valores do catálogo: demonstrativos (fictícios).

## Capítulos

| Capítulo | Início | Duração |
|---|---|---|
| Abertura | 00:00 | 52 s |
| Parte 1 · O método | 00:52 | 1 min 18 s |
| Parte 2 · A ferramenta passo a passo | 02:10 | 5 min 59 s |
| Parte 3 · Demais recursos | 08:09 | 38 s |
| Encerramento | 08:47 | 33 s |

## Cenas

| Cena | Capítulo | Início | Duração (s) | Narração |
|---|---|---|---|---|
| 0.1 | Abertura | 00:00 | 8.0 | (sem narração) |
| 0.2 | Abertura | 00:08 | 17.8 | Escolher um material pela lista do que se conhece costuma esconder o critério. O método de Ashby faz o contrário. Ele parte do que a peça precisa fazer e transforma isso em números que se comparam. O MaterialSelect AI é uma aplicação web para ensinar e praticar esse método. |
| 0.3 | Abertura | 00:25 | 26.4 | Este vídeo tem três partes. Primeiro, o método. Depois, a ferramenta, passo a passo, com dois estudos clássicos: o tirante e a placa, leves e rígidos. Por fim, os demais recursos e o que a ferramenta não faz. Os materiais do catálogo são demonstrativos. Os valores são fictícios e servem para mostrar o método, não para projetar. |
| cap-parte1 | Parte 1 · O método | 00:52 | 2.0 | (cartela: O método) |
| 1.1 | Parte 1 · O método | 00:54 | 16.9 | A seleção segue quatro passos. A função diz o que a peça faz. O objetivo diz o que se quer minimizar ou maximizar, como a massa. Os limites dizem o que o material não pode deixar de atender. O resultado ordena quem sobrou. |
| 1.2 | Parte 1 · O método | 01:11 | 23.6 | O objetivo e a restrição se combinam num índice de desempenho, como descreve Ashby, em 2017. No tirante, a massa é área vezes comprimento vezes densidade. A rigidez fixa a área. Substituindo, sobra um grupo só de material: módulo de Young sobre densidade. Minimizar a massa é maximizar esse índice. |
| 1.3 | Parte 1 · O método | 01:34 | 18.4 | Num mapa de propriedades em escala log-log, cada material é um ponto e cada classe é um envelope. Um índice desse tipo vira uma reta. Os limites funcionam como um funil. Cada limite retira candidatos, e a ferramenta mostra quantos e por quê. |
| 1.4 | Parte 1 · O método | 01:53 | 17.0 | Todo número é calculado no servidor, de forma determinística. O mesmo estudo, executado de novo, dá o mesmo resultado. A inteligência artificial é opcional. Ela só interpreta texto. Não produz valores e não decide. |
| cap-parte2 | Parte 2 · A ferramenta passo a passo | 02:10 | 2.0 | (cartela: A ferramenta passo a passo) |
| 2.1 | Parte 2 · A ferramenta passo a passo | 02:12 | 13.5 | O Início começa pela função da peça. O texto vira a função do estudo. Os limites e o índice vêm depois. Os estudos salvos ficam aqui, para reabrir e executar de novo. |
| 2.2 | Parte 2 · A ferramenta passo a passo | 02:25 | 13.1 | Na etapa Função, damos nome ao estudo e descrevemos o objetivo. Ao lado, o funil começa com o catálogo inteiro: 678 materiais demonstrativos. |
| 2.3 | Parte 2 · A ferramenta passo a passo | 02:38 | 21.1 | Na etapa Objetivo, escolhemos o índice. Para o tirante, é a rigidez específica: módulo de Young sobre densidade. Antes de usar, a ferramenta mostra as condições em que o índice vale: função, geometria, objetivo e limite. Fora delas, o índice não se aplica. |
| 2.5 | Parte 2 · A ferramenta passo a passo | 02:59 | 17.2 | A classificação pode combinar critérios. Aqui, o índice vale sete décimos da nota e o custo por massa, três décimos. Os pesos precisam somar um, e a tabela mostra quanto cada critério vale. |
| 2.6 | Parte 2 · A ferramenta passo a passo | 03:16 | 47.4 | Na etapa Limites, cada linha é uma restrição com unidade explícita. Digitamos cem e escolhemos megapascal. A frase abaixo confirma a leitura. O segundo limite pede tenacidade à fratura de pelo menos quinze megapascal raiz de metro. Ele afasta os materiais frágeis. O terceiro pede que o tirante trabalhe a 200 °C. O funil recalcula no servidor: de 678, restam 364, depois 268, e por fim 194. |
| 2.7 | Parte 2 · A ferramenta passo a passo | 04:04 | 15.2 | O resultado abre no vencedor, com a nota e o que mais pesou nela. A aba Classificação lista todos os candidatos, com o valor do índice e a pontuação de zero a um. Lembrando: os valores são demonstrativos. |
| 2.8 | Parte 2 · A ferramenta passo a passo | 04:19 | 12.3 | A aba Eliminados mostra quem saiu, e em que etapa. Um material sem o dado necessário não recebe zero. Ele sai da classificação e aparece listado, com o motivo. |
| 2.9 | Parte 2 · A ferramenta passo a passo | 04:31 | 9.7 | A aba Sensibilidade refaz a classificação com outros pesos. Neste estudo, o primeiro colocado se mantém em todos os cenários. |
| 2.10 | Parte 2 · A ferramenta passo a passo | 04:41 | 19.8 | A aba Origem dos dados mostra o que gerou estes números: os limites, a expressão do índice, a dimensão, o método de classificação e os pesos. É o mesmo conteúdo que vai para o relatório exportado. Salvo, o estudo pode ser reaberto e executado de novo, com o mesmo resultado. |
| 2.11 | Parte 2 · A ferramenta passo a passo | 05:01 | 17.3 | Nos Mapas, escolhemos o nível de detalhe e as propriedades de cada eixo. O nível só muda o que se vê, nunca o cálculo. Um material sem valor não some em silêncio. Ele aparece na lista dos que ficaram fora do mapa, com o motivo. |
| 2.12 | Parte 2 · A ferramenta passo a passo | 05:18 | 23.1 | Agora, a placa leve e rígida. O índice é a raiz cúbica do módulo de Young sobre a densidade. Em escala log-log, ele vira uma reta de inclinação três. A inclinação é calculada no servidor a partir da própria expressão. Os materiais acima da reta são melhores que os que estão sobre ela. |
| 2.4 | Parte 2 · A ferramenta passo a passo | 05:41 | 18.5 | Um índice também pode ser montado na calculadora. Os cartões de propriedade e o teclado formam a expressão. O servidor confere a validade e devolve a dimensão e a unidade do resultado. |
| 2.13 | Parte 2 · A ferramenta passo a passo | 06:00 | 17.8 | O Comparar coloca candidatos lado a lado. A tabela mantém a origem de cada valor. Barras, radar, coordenadas paralelas e mapa de calor usam valores normalizados no servidor. |
| 2.14 | Parte 2 · A ferramenta passo a passo | 06:17 | 21.7 | O Catálogo lista os materiais e a qualidade de cada dado. Na ficha, cada propriedade mostra o valor na unidade de leitura e a unidade original, como foi feita a conversão, de que fonte veio e com que qualidade. Neste catálogo, a qualidade é estimada. Não há valores medidos. |
| 2.15 | Parte 2 · A ferramenta passo a passo | 06:39 | 21.5 | O Dimensionar transforma o índice em massa. Para um tirante de meio metro e rigidez de dois vezes dez à sétima newtons por metro, cada material recebe a massa e a área necessárias. Aqui o catálogo entra inteiro, sem os limites da seleção. Por isso aparecem materiais que a seleção já teria afastado. |
| 2.16 | Parte 2 · A ferramenta passo a passo | 07:00 | 19.6 | Na placa, a espessura é a variável livre. Com o expoente um terço, materiais muito leves, como espumas e madeira de balsa, sobem na lista, porque compensam a baixa rigidez com espessura. |
| 2.17 | Parte 2 · A ferramenta passo a passo | 07:20 | 27.0 | O Importar recebe planilhas em CSV ou XLSX. Este arquivo tem três materiais fictícios. A ferramenta sugere o mapeamento das colunas e pede a unidade de cada uma. A validação mostra o resultado de cada linha antes de importar. No material B, a célula vazia não vira zero: na ficha, o valor aparece como ausente. |
| 2.18 | Parte 2 · A ferramenta passo a passo | 07:47 | 13.3 | Os Processos são o segundo universo do método. Cada processo tem atributos de capacidade, com fonte e qualidade, e o conjunto de materiais que ele atende, que também entra como etapa da seleção. |
| 2.19 | Parte 2 · A ferramenta passo a passo | 08:00 | 8.7 | O Painel mostra quanto do catálogo está preenchido, com que qualidade, e como cada propriedade se distribui entre as classes. |
| cap-parte3 | Parte 3 · Demais recursos | 08:09 | 2.0 | (cartela: Demais recursos) |
| 3.1 | Parte 3 · Demais recursos | 08:11 | 35.9 | Há outros recursos. Os Cadernos guardam fontes próprias e respondem citando o trecho de onde veio a resposta. O Custo estima o custo por peça. O Eco faz uma auditoria de energia e carbono. O Baterias dimensiona um conjunto de células. O Sintetizar estima compósitos, espumas e painéis sanduíche, e diz qual lei produziu cada valor. O Glossário explica cada propriedade e como ela se mede. Em Meus registros ficam os materiais próprios de cada pessoa. E em Classes e Propriedades se administra o vocabulário do catálogo. |
| cap-encerramento | Encerramento | 08:47 | 2.0 | (cartela: Encerramento) |
| 4.1 | Encerramento | 08:49 | 17.2 | A ferramenta tem limites claros. Ela não substitui ensaio. O catálogo atual é demonstrativo, sem valores medidos. E ela não especifica material para um projeto real. Serve para ensinar o método e para uma triagem inicial. |
| 4.2 | Encerramento | 09:06 | 13.3 | O próximo passo é o teste de usabilidade com estudantes. Se você é estudante de Engenharia de Materiais e quer participar, fale com o autor. Obrigado. |
