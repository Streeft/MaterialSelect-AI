# Relatórios e exportação (Fase 7)

A exportação é onde o trabalho sai da ferramenta e passa a circular sozinho.
Um arquivo entregue a um orientador, anexado à monografia ou aberto meses
depois precisa carregar consigo tudo o que sustenta seus números — e precisa
dizer o que **não** é.

## O que todo arquivo exportado carrega

Três avisos, sempre, sem opção de desligar
(`app/exporters/report.py`):

1. **Limitação de uso** — compromisso do item 5 da proposta: a ferramenta apoia
   ensino e triagem preliminar, e não substitui validação experimental, análise
   estrutural detalhada nem julgamento de engenharia. Um relatório que viaja sem
   essa frase pode ser lido como conclusão de engenharia, que ele não é.
2. **Reprodutibilidade** — os números vieram de cálculo determinístico no
   backend sobre valores cadastrados; reexecutar reproduz o mesmo resultado.
3. **Dados demonstrativos** — quando algum material exportado é fictício, este
   aviso vem **primeiro**: quem parar na primeira linha deve parar naquela que
   diz que os valores são inventados.

## Injeção de fórmula

Um CSV não é inerte. Excel e LibreOffice executam qualquer célula que comece com
`=`, `+`, `-`, `@`, TAB ou CR. Um material chamado `=HYPERLINK("http://…")` —
perfeitamente armazenável neste sistema, e alcançável pelo assistente de
importação — rodaria ao abrir o arquivo, numa máquina que o exportador nunca vê.

O importador já retira esses prefixos na entrada
(`app/importers/parsing.sanitize_text_cell`). `app/exporters/cells.py` fecha a
outra ponta, porque as duas protegem coisas diferentes: o importador protege os
dados *deste* sistema; o exportador protege a *planilha de quem recebe* — e um
dado pode chegar ao banco por caminhos que o importador nunca viu (o formulário
manual, um cliente futuro da API, um backup restaurado).

O escape é **visível, não destrutivo**: o valor mantém seus caracteres e ganha
um apóstrofo à frente, a convenção de planilha para "trate como texto". Nada
exportado é silenciosamente alterado.

Números negativos são exceção deliberada: saem como célula **numérica**, que
nenhuma planilha interpreta como fórmula. Escapá-los inviabilizaria aritmética
na planilha exportada sem ganho de segurança.

## O relatório de seleção

`GET /api/exports/estudos/{id}.{csv|xlsx}` reexecuta o estudo pelo pipeline
determinístico e organiza o resultado em abas:

| Aba | O que responde |
|---|---|
| Aviso | os três avisos obrigatórios |
| Problema | função, objetivo, variáveis livres, contagens |
| Restrições e funil | qual restrição eliminou o quê |
| Candidatos | ordenação, índice e pontuação |
| Índice de desempenho | expressão, objetivo e **dimensão derivada** |
| Contribuições | por critério: valor bruto, normalizado, peso, contribuição |
| Excluídos por dado ausente | quem não foi ranqueado, e por falta de qual dado |
| Sensibilidade | se o 1º colocado muda ao variar os pesos |
| Proveniência | origem de cada número usado na decisão |

A aba de proveniência é o ponto do exercício. Uma tabela de ranking sozinha é
uma afirmação; a mesma tabela ao lado de "este 69 GPa foi informado como 69 GPa
e convertido por `pint:GPa->Pa`, estimado, do dataset demonstrativo" é um
argumento que outra pessoa pode conferir.

O serviço **nunca calcula**: ele reexecuta o pipeline e arruma o que volta. Uma
exportação tem de mostrar os mesmos números que a aplicação mostra, e a única
forma de garantir isso é haver um único lugar que os produz.

## Catálogo

`GET /api/exports/catalogo.{csv|xlsx}` exporta todos os materiais ativos em
unidade canônica, com uma aba de proveniência completa. Dado não cadastrado sai
como `ausente` — nunca célula vazia, que um leitor poderia confundir com zero.

## Detalhes que costumam passar batido

- **BOM UTF-8 no CSV.** Sem ele o Excel no Windows abre o arquivo como Latin-1 e
  transforma "Módulo" em "MÃ³dulo". O relatório é em português, então não é
  opcional.
- **Nome de arquivo.** O cabeçalho `Content-Disposition` leva a forma ASCII
  saneada *e* a forma RFC 5987 (`filename*`), para que acentos sobrevivam onde
  houver suporte e degradem limpo onde não houver.
- **`X-Content-Type-Options: nosniff`.** Impede o navegador de reinterpretar um
  CSV como HTML, o que transformaria nomes de material em marcação.
- **Nomes de aba do Excel.** Máximo de 31 caracteres, sem `: \ / ? * [ ]`, e
  únicos. Saneados na escrita.

## Endpoints

| Método | Rota | Função |
|---|---|---|
| GET | `/api/exports/catalogo.{csv,xlsx}` | catálogo ativo com proveniência |
| GET | `/api/exports/estudos/{id}.{csv,xlsx}` | relatório completo de um estudo |

## Ainda fora desta fatia

PDF e HTML imprimível, exportação de PPTX, testes end-to-end de interface,
autenticação por projeto e auditoria seguem na Fase 7 e estão no
[`backlog.md`](backlog.md).
