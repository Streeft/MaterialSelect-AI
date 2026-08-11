# Teste de usabilidade com estudantes (§3.5)

A proposta aprovada compromete um teste de usabilidade com estudantes para
avaliar três coisas nomeadas: a **clareza da apresentação dos critérios**, a
**facilidade de operação** e a **utilidade percebida**. O §4.1 cobra o
formulário, a análise e as melhorias implementadas como **entrega**, não como
apêndice.

Este documento é o instrumento desse teste: roteiro, formulário e a tabela onde
as melhorias vão ser registradas. Ele existe para ser preenchido — enquanto a
tabela da seção 7 estiver vazia, o compromisso do §3.5 não foi cumprido.

> **Estado em 10/08/2026:** nenhuma sessão realizada. As seções 1 a 6 estão
> prontas para aplicar; a seção 7 está vazia de propósito e não deve receber
> linha nenhuma que não venha de uma sessão de fato observada.

---

## 1. O que está sendo medido

Os três eixos são os da proposta, e cada um tem uma pergunta que o observador
precisa conseguir responder ao fim da sessão:

| Eixo | Pergunta que a sessão responde | Onde ela se decide |
|---|---|---|
| **Clareza da apresentação dos critérios** | O participante consegue dizer, com as próprias palavras, *por que* um material ficou à frente do outro — e qual restrição eliminou os demais? | Cartão de índice, funil de exclusões, tabela de contribuições, proveniência de cada valor |
| **Facilidade de operação** | O participante vai do enunciado ao relatório sem ajuda, sem voltar atrás por engano e sem se perder sobre em que etapa está? | Stepper de `/selecao`, contador de candidatos, barra de ação, navegação entre telas |
| **Utilidade percebida** | O participante usaria a ferramenta numa disciplina, num trabalho ou numa triagem inicial? Em quê ela ajudou, e em quê ela não substitui o que ele já faz? | Entrevista final; comparação com o método que ele usa hoje |

Os três eixos não são independentes: uma interface fácil de operar que esconde o
critério pontua bem no segundo eixo e reprova no primeiro, e é exatamente esse o
risco de uma ferramenta de seleção. Registre os eixos separadamente.

---

## 2. Participantes e condições

- **Perfil:** estudante de graduação em Engenharia de Materiais que já teve
  contato com seleção de materiais em disciplina, **sem** familiaridade prévia
  com esta ferramenta. Um participante que já a viu serve para outra coisa
  (teste de regressão), não para este.
- **Quantidade:** de 5 a 8 sessões. Abaixo de 5 os problemas achados não se
  repetem o bastante para separar defeito de acaso; acima de 8, numa interface
  deste tamanho, as sessões passam a confirmar o que as anteriores já disseram.
- **Duração:** 40 a 50 minutos por sessão — 5 de contexto, 25 a 30 de tarefas,
  10 de entrevista.
- **Ambiente:** o navegador do próprio participante, na largura que ele usa.
  Registre a largura: um problema que só aparece em 1280 px e um que só aparece
  em 375 px são problemas diferentes.
- **Consentimento:** explique antes de começar que a sessão avalia a ferramenta
  e não o participante, que ele pode parar a qualquer momento, e o que será
  registrado (anotações e, se ele autorizar, a tela). Sem autorização, só
  anotações.
- **Aviso obrigatório:** diga, antes da primeira tarefa, que os dados do
  catálogo são **demonstrativos e fictícios**. O aviso está na tela, mas se o
  participante não o notar, isso é um achado do teste — anote — e ainda assim
  ele não pode sair da sessão achando que os valores são reais.

### O que o observador faz e não faz

Não ajude. A pergunta que o teste responde é se o estudante chega ao relatório
**sem ajuda**, e uma dica bem-intencionada apaga o único dado que interessa.
Diante de uma pergunta, devolva: "o que você faria se eu não estivesse aqui?".

Só intervenha para desbloquear de vez: se o participante estiver travado por
mais de 3 minutos numa tarefa, registre a tarefa como **não concluída**, mostre
o caminho e siga para a próxima. A tarefa seguinte ainda produz dado.

Peça pensamento em voz alta. As frases que interessam mais são as de dúvida
("acho que isso aqui é…"), não as de sucesso.

---

## 3. Roteiro de tarefas

O participante recebe **o enunciado**, não a sequência de cliques. O caminho é
o que está sendo medido.

### Enunciado entregue ao participante

> Você precisa escolher um material para a **longarina de uma bicicleta de
> competição**: uma viga que trabalha em flexão, precisa ser a mais leve
> possível e não pode falhar em serviço.
>
> Restrições do projeto:
> - módulo de Young de pelo menos **70 GPa**;
> - limite de escoamento de pelo menos **200 MPa**;
> - temperatura máxima de serviço acima de **80 °C**.
>
> Entre os materiais que atendem a tudo isso, você quer o que der a **viga mais
> leve para a mesma rigidez**.
>
> Ao final, produza um **relatório** com a recomendação e com o que a sustenta.

Ajuste os números aos dados que o catálogo demonstrativo realmente tem antes da
sessão. Um enunciado que não deixa nenhum candidato de pé mede a mensagem de
lista vazia, e não o método — o que é um teste válido, mas outro.

### Tarefas

| # | Tarefa | Concluída quando… | O que observar |
|---|---|---|---|
| T1 | Encontre a ferramenta e comece um estudo a partir do enunciado | O participante chega a `/selecao` e registra a função | Ele entendeu a home como método ou como menu? |
| T2 | Registre as três restrições | As três aparecem na lista, com unidade | Ele digitou "70" esperando GPa? Percebeu a unidade? O contador de candidatos foi notado? |
| T3 | Escolha o objetivo | Um índice de desempenho está selecionado | Ele leu as hipóteses do índice antes de escolher? Sabe dizer o que o índice supõe? |
| T4 | Execute e leia o resultado | Ele nomeia o primeiro colocado **e diz por quê** | Ele achou o funil? Entendeu quem foi excluído e por quê? Reparou nos materiais excluídos por **dado ausente**? |
| T5 | Verifique de onde veio um número | Ele abre a proveniência de um valor e diz a unidade original e a fonte | Ele descobriu que o valor é clicável? |
| T6 | Exporte o relatório | O arquivo é baixado ou aberto | Ele escolheu o formato conscientemente? Notou o aviso de limitação? |
| T7 | *(opcional, se sobrar tempo)* Compare os dois primeiros colocados | Ele abre `/comparar` com os dois e diz onde um ganha do outro | Ele encontrou o comparador? A escala normalizada foi entendida? |

Registre por tarefa: **concluída sem ajuda / concluída com dificuldade / não
concluída**, o tempo, e a frase mais reveladora que o participante disse.

---

## 4. Formulário de coleta

### 4.1 Antes (perfil, 5 perguntas)

1. Semestre e disciplinas já cursadas com seleção de materiais.
2. Já usou CES EduPack, Granta ou similar? Quanto?
3. Como você escolhe um material hoje, quando precisa? (tabela, livro,
   orientador, busca…)
4. Já ouviu falar em índice de desempenho / mapa de Ashby?
5. Largura da janela e dispositivo usados na sessão.

### 4.2 Durante (uma folha por tarefa)

| Campo | Valores |
|---|---|
| Tarefa | T1 … T7 |
| Resultado | sem ajuda / com dificuldade / não concluída |
| Tempo | mm:ss |
| Erros de caminho | quantos, e quais |
| Hesitações | onde parou, o que reler |
| Citações | o que disse em voz alta |
| Eixo afetado | clareza / operação / utilidade |

### 4.3 Depois (escala e entrevista)

Escala de 1 (discordo totalmente) a 5 (concordo totalmente). As afirmações
estão agrupadas pelos três eixos da proposta, e a numeração indica o eixo.

**Clareza da apresentação dos critérios**

- C1. Entendi por que o primeiro colocado ficou em primeiro.
- C2. Entendi por que os materiais descartados foram descartados.
- C3. Consegui ver de onde veio cada número que a ferramenta mostrou.
- C4. Ficou claro o que o índice de desempenho supõe — e quando ele não vale.
- C5. Ficou claro quais dados eram medidos, importados, estimados ou ausentes.

**Facilidade de operação**

- O1. Soube o que fazer em cada etapa, sem precisar de ajuda.
- O2. Sempre soube em que ponto do processo eu estava.
- O3. Consegui corrigir o que errei sem começar de novo.
- O4. As mensagens de erro me disseram o que fazer.
- O5. A ferramenta funcionou bem no tamanho de tela que eu usei.

**Utilidade percebida**

- U1. Usaria esta ferramenta numa disciplina ou num trabalho.
- U2. O relatório exportado seria útil para entregar ou anexar.
- U3. Confiaria nesta ferramenta para uma triagem inicial (não para a decisão
  final).
- U4. A ferramenta me ensinou algo sobre o método de seleção.

**Perguntas abertas** (as que produzem as melhorias)

1. Qual foi o momento mais confuso da sessão?
2. O que você esperava que acontecesse e não aconteceu?
3. Se pudesse mudar uma coisa, qual seria?
4. O que a ferramenta **não** deveria tentar fazer por você?
5. Alguma coisa aqui pareceu dizer mais do que sabe? *(a pergunta que caça
   excesso de confiança da interface — o risco central deste trabalho)*

Uma média alta com uma pergunta aberta ruim vale menos que o contrário. A escala
ordena o problema; a frase explica.

---

## 5. Como transformar observação em melhoria

Classifique cada achado por severidade:

| Severidade | Critério | Consequência |
|---|---|---|
| **Alta** | Impede concluir a tarefa, ou faz o participante acreditar em algo falso sobre os dados | Corrigir antes da próxima sessão |
| **Média** | Custa tempo ou uma tentativa errada, mas ele chega lá | Corrigir antes da entrega |
| **Baixa** | Incomoda, não atrapalha | Backlog (`docs/TODO.md`) |

Um achado que apareceu em **duas ou mais** sessões é defeito da interface. Um
que apareceu em uma pode ser do participante, do enunciado ou do dia — anote,
mas não redesenhe em cima dele.

Achados de severidade alta que envolvam **dado ausente lido como zero**, **valor
sem proveniência** ou **índice aplicado fora da validade** têm precedência sobre
qualquer outro: são os compromissos §3.1, §3.2 e §3.3 da proposta falhando em
campo, e é para eles que este teste existe.

---

## 6. Verificação manual de acessibilidade

O que os testes automatizados cobrem está em `app/routes.a11y.test.tsx` e nos
testes de cada primitiva, dentro do `npm run test`. Regras automáticas pegam
cerca de um terço das barreiras reais — nome faltando, relação quebrada, papel
errado — e **não** sabem dizer se a ordem de foco faz sentido. O resto é esta
lista, refeita a cada mudança de tela:

- [ ] Percorrer cada rota só com Tab/Shift+Tab: a ordem segue a leitura, o anel
      de foco é visível nos dois temas, e nada recebe foco fora da tela.
- [ ] O link "pular para o conteúdo" é o primeiro parada de Tab e funciona.
- [ ] Nos gráficos: a tabela de dados da figura é alcançável pelo teclado e traz
      os mesmos números que a figura desenha.
- [ ] Nenhuma informação depende só de cor — conferir com o tema escuro e com a
      página impressa em tons de cinza.
- [ ] Contraste AA (4,5:1 texto normal, 3:1 texto grande) medido **contra a
      superfície mais escura em que o token aparece**, não só contra o fundo da
      página (ver D-29 em `docs/DECISIONS.md`).
- [ ] Nenhuma rota rola horizontalmente a 375 px.

---

## 7. Melhorias decorrentes do teste

Esta é a entrega que o §4.1 cobra. Uma linha por melhoria **implementada**, com
o achado que a originou. Sem linha para o que foi só observado — isso fica no
formulário.

| # | Achado (sessões) | Eixo | Severidade | Melhoria implementada | Commit |
|---|---|---|---|---|---|
| — | *(vazio: nenhuma sessão realizada até 10/08/2026)* | — | — | — | — |
