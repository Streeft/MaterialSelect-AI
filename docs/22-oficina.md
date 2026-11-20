# 22 — Ambiente "Oficina": o método de seleção como um lugar

Registro do rumo decidido em 19/11/2026 ([D-256](DECISIONS.md)). Leia antes de mexer em qualquer
peça do ambiente Oficina ou de planejar a próxima camada.

## A ideia

Pedido do autor: o app deixar de parecer "software comercial quadrado de engenharia" e contar o
método como um lugar de trabalho. A pessoa abre uma **gaveta** do arquivo (uma família de
materiais), pega os **envelopes** que quer, pega **ferramentas** e **fixações**, leva tudo para a
**bancada**, projeta (esboço, mapas, contas), monta, **ensaia** e dá o problema como
**solucionado**. Mais arrastar, menos tabela.

O método de Ashby já é essa narrativa (função → restrições → triagem → ranking → documentação). A
Oficina é a mesma narrativa com cenário; nenhum número muda de lugar de cálculo.

## Decisões do autor

- **Tema opcional**: "Oficina" é escolha em Aparência; "Engenharia" continua e é o padrão.
- **Ilustrado, não fotográfico**: textura desenhada pelo navegador, leve, legível nos dois temas.
- **Projeto com peças é central**: a mesa tem tampo, pernas e pregos; cada peça é uma seleção.

## O que cada cena é no app

| Cena | Peça do app |
|---|---|
| Arquivo de gavetas | Catálogo: raízes da taxonomia, contagem do servidor |
| Envelope | Um material: nome, subfamília, marcas de qualidade; leva à ficha |
| Caixa de ferramentas | Processos e as calculadoras (Dimensionar, Custo, Eco, Sintetizar) |
| Bancada | O estudo da Seleção, Mapas, Cadernos |
| Ensaio | Casos de carga do Dimensionar sobre o escolhido |
| "Solucionado" | Laudo emitido |

## Regras do ambiente (valem para toda camada)

1. **É fantasia de superfície.** Número, papel de cor, cor de qualidade, Okabe–Ito e nome
   acessível são os mesmos nos dois ambientes.
2. **Textura só se afasta do texto.** Bancada, papel e kraft são tokens chapados (`--oficina-*`)
   que mantêm todo token de texto de toda paleta a ≥ 4,5:1; o veio é mais claro sobre claro e mais
   escuro sobre escuro, então o token chapado é o pior caso, e é o medido
   (`lib/design/ambience.test.ts`).
3. **Painel nunca leva textura.** Papel é a folha onde se lê. Nada se escreve sobre a madeira: a
   gaveta tem etiqueta de papel.
4. **Sem imagem, sem biblioteca.** O veio é ruído SVG (`feTurbulence`) num `data:` URL; a gaveta
   abre com animação CSS nos tokens de mola, desligada sob movimento reduzido.
5. **Arrastar nunca é o único caminho** (vale a partir da bandeja): sempre há o mesmo gesto por
   teclado e por menu.
6. **Dado vem do servidor.** A gaveta pergunta ao mesmo `/api/materials/busca`; o envelope não
   mostra valor de propriedade enquanto a busca não o trouxer.

## Roteiro

| # | Camada | Estado |
|---|---|---|
| 1 | Ambiente em Aparência, texturas, ícones-objeto, arquivo de gavetas, tabela como caderno de registro | **feito (D-256)** |
| 2 | **Projeto com peças**: backend + telas de Projetos | **feito (D-257)** |
| 3 | **Bandeja**: materiais, fixações e ferramentas guardados na conta | **feito (D-258)** |
| 4 | **Bancada**: levar da bandeja para o mapa, o comparador, o Custo e o Eco | **feito (D-259)** |
| 5 | **Ensaio** por peça e **"Solucionado"**; laudo do projeto | **feito o ensaio (D-260, D-261)**: limites do estudo e caso de carga; laudo a fazer |
| 6 | Tabelas leves de verdade: até 5 colunas, resto no detalhe da linha (resultados da Seleção) | a fazer |

### Camada 2 — projeto com peças (feita, D-257)

- Na tela é **"Projeto"**; no código é `Assembly` (`apps/api/app/models/assembly.py`), porque `Project` é o contêiner do usuário.
- A **peça** guarda nome, papel (estrutural, fixação, acabamento, outro), quantidade, massa de cada uma (kg), o material escolhido e o estudo
  que o decide. Os três últimos são nulos até existirem.
- A **soma** é só da fase de material (massa, custo do material, energia incorporada, CO₂ da produção), calculada no backend a cada leitura
  (`app/calculations/assembly.py`). Ausência vem com o motivo; total com peça faltando é recusado, com a soma parcial nomeada.
- API em `/api/assemblies`; telas em `/app/projetos` e `/app/projetos/[id]` (`components/projects/ProjectWorkspace.tsx`).
- **Não entrou**, e vai em PR próprio: ambiente guardado na conta e propriedades-chave no envelope. Também ficam para depois: levar o projeto
  ao Eco Audit e ao Custo, reordenar arrastando, o esquema em blocos.

### Camada 3 — a bandeja (feita, D-258)

- É **da conta** e é **marcador**: `tray_item` guarda um alvo (material, processo ou calculadora) e o compartimento. Nenhum número.
- **Compartimentos:** Materiais, Fixações (um material com outro papel) e Ferramentas (processos e calculadoras; estas são atalhos de uma
  lista fechada no servidor).
- **Abre** pelo botão no topo (`TrayButton`), num painel lateral (`Tray`, um `SidePeek`).
- **Entra** arrastando o envelope, o cartão ou a linha de Processos até a zona que aparece no canto, ou pelo botão "Levar para a bandeja" que
  está sempre ao lado (e nas fichas e na barra dos marcados).
- **Serve** na página do projeto: a faixa "Da bandeja" solta o material numa peça; o menu da peça faz o mesmo sem arrastar.

### Camada 4 — a bancada (feita, D-259)

- **A faixa "Da bandeja"** (`TrayStrip`) aparece em Mapas, Comparar, Custo e Eco: cada material é uma ficha que se arrasta e que traz os
  comandos ao lado.
- **O que cada tela faz:** Mapas destaca; Comparar acrescenta; Custo estima ou compara; Eco põe como componente, ou como material da
  alternativa A, B, C ou D.
- **Soltar** é `useTrayDrop` (ou `TrayDropZone`): o lugar ganha contorno e recebe id e nome. A tela muda a pergunta; o servidor responde.
- **Do painel**, o menu do material leva às quatro telas (o painel é modal, nada sai dele arrastado).
- **Regra para destino novo:** use `TrayStrip` + `useTrayDrop`, com o motivo escrito quando o comando não cabe, e anuncie o que mudou.

### Camada 5 — o ensaio (feito, D-260 e D-261)

- **O requisito da peça é o estudo ligado a ela**: cada limite e cada estágio ligado, na ordem do estudo.
- **Quem julga é o motor da Seleção**, sobre o material da peça: Passa, Não passa ou Sem dado. Ausência nunca aprova.
- **Peça que não pôde ser ensaiada diz o que falta** (material, estudo, limites) e não conta como aprovada.
- **"Solucionado"** só com todas as peças passando em tudo. Nada é guardado: o ensaio responde com o catálogo como está.
- **Na tela**, a seção "Ensaio" da página do projeto: pede-se o ensaio, e depois ele acompanha o projeto.
- **Caso de carga (D-261):** a peça declara um caso do Dimensionar e as medidas; passa quando a massa informada chega à massa mínima que o
  solver calcula para o material. Premissa dita na tela: a peça tem a forma do caso e só a variável livre muda. Sem massa informada, ou sem a
  propriedade no material, é "Sem dado".
- **A fazer:** laudo do projeto.

## Onde está cada coisa (camada 1)

- `apps/web/lib/ambience.ts`: a escolha, no aparelho (`msai.ambience`), e o script da cabeça.
- `apps/web/app/globals.css`, bloco "D-256": tokens, texturas, arquivo, gaveta, envelope.
- `apps/web/components/workshop/FileCabinet.tsx`: `FileCabinet`, `Drawer`, `Envelope`.
- `apps/web/components/layout/workshopIcons.tsx`: os seis objetos e `NavIcon`.
- `apps/web/app/app/estilo/WorkshopSpecimens.tsx`: a vitrine, com a chave de ambiente.
- Testes: `lib/design/ambience.test.ts`, `components/workshop/FileCabinet.test.tsx`,
  `components/layout/workshopIcons.test.tsx`, `e2e/oficina.spec.ts`.
