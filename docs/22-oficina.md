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
| 2 | **Projeto com peças**: backend + tela "Projeto" | a fazer |
| 3 | **Bandeja**: materiais, fixações e ferramentas guardados no estudo, na conta | a fazer |
| 4 | **Bancada**: arrastar da bandeja para mapa, calculadora e comparador | a fazer |
| 5 | **Ensaio** por peça e **"Solucionado"**; laudo do projeto | a fazer |
| 6 | Tabelas leves de verdade: até 5 colunas, resto no detalhe da linha (resultados da Seleção) | a fazer |

### Camada 2 — esboço do projeto com peças

- Já existe `Project` (`apps/api/app/models/project.py`), dono dos `SelectionStudy`
  (`project_id`). Hoje é só a pasta de um usuário.
- Um estudo passa a poder ser **peça**: `part_name` ("tampo"), `part_role` (estrutural, fixação,
  acabamento), `quantity` e `chosen_material_id` (nulo até escolher: ausência explícita).
- A **montagem** é serviço do backend que soma massa, custo e Eco por peça com as calculadoras
  que já existem, e devolve "falta dado" por peça em vez de zero. Nenhuma soma no cliente.
- Migração Alembic, rotas de peças e de montagem, `shared-types`, testes de soma, ausência e
  quantidade. Pede **Deploy da API**.
- Entram junto, porque já mexem no backend: o **ambiente guardado na conta**
  (`user_appearance` ganha a coluna) e as **propriedades-chave no envelope** (a busca passa a
  mandá-las, com qualidade e unidade).

## Onde está cada coisa (camada 1)

- `apps/web/lib/ambience.ts`: a escolha, no aparelho (`msai.ambience`), e o script da cabeça.
- `apps/web/app/globals.css`, bloco "D-256": tokens, texturas, arquivo, gaveta, envelope.
- `apps/web/components/workshop/FileCabinet.tsx`: `FileCabinet`, `Drawer`, `Envelope`.
- `apps/web/components/layout/workshopIcons.tsx`: os seis objetos e `NavIcon`.
- `apps/web/app/app/estilo/WorkshopSpecimens.tsx`: a vitrine, com a chave de ambiente.
- Testes: `lib/design/ambience.test.ts`, `components/workshop/FileCabinet.test.tsx`,
  `components/layout/workshopIcons.test.tsx`, `e2e/oficina.spec.ts`.
