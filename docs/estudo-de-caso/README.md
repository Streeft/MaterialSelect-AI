# Estudo de caso — haste leve e rígida (A2)

> Dados reais de literatura, **não** o `sample-data/` fictício do resto do
> repositório. Cada valor é uma cifra **representativa da classe**, não a
> medição de uma liga/lote específico — ver as ressalvas em
> [`docs/12-estudo-de-caso.md`](../12-estudo-de-caso.md#5-fontes-e-limitação-das-cifras).

- `materiais-haste-leve-rigida.csv` — nove materiais, cinco classes (as mesmas
  do catálogo semeado: Metais, Polímeros, Cerâmicas, Compósitos, Elastômeros),
  com `densidade` e `modulo_young` apenas — as duas propriedades que o índice
  `rigidez-especifica` (E/ρ) do próprio catálogo semeado usa. As demais colunas
  ficam em branco de propósito: ausência não vira palpite.

## Fontes das cifras

Valores típicos de classe, cross-checados entre duas referências
independentes por busca (nenhum fetch de página completa foi possível neste
ambiente — a rede bloqueia os domínios de origem — então as cifras vêm dos
resumos retornados pela busca, não de uma tabela lida por inteiro):

- Ashby, M. F. — *Materials Selection in Mechanical Design* — é a referência
  metodológica do próprio índice `rigidez-especifica` já semeado no catálogo
  (`app/db/seed.py`), e a ordem de grandeza de cada classe neste caso é a
  mesma que o livro relata.
- MIT OpenCourseWare, curso 3.11 *Mechanics of Materials* — tabela de
  propriedades de materiais de engenharia (aço, liga de alumínio 7075-T6,
  CFRP e GFRP laminados, alumina) no formato Tipo/Densidade/Módulo de
  Young/Custo, o mesmo formato das tabelas de Ashby.
- ScienceDirect, tópico "Material Property Chart" — confirma a mesma faixa
  para as classes acima e a correlação diagonal E–ρ que organiza os mapas de
  Ashby.
- Titânio Ti-6Al-4V, poliamida, polipropileno e borracha natural: valores
  típicos amplamente publicados (massa específica e módulo de Young "de
  manual"), consistentes entre si e com a ordem de grandeza das referências
  acima — não presos a uma norma ou fabricante específico.

## Como foi usado

Importado pelo assistente de importação da própria aplicação (`POST
/api/imports/upload` → `/validate` → `/commit`), não inserido direto no banco
— é a mesma trilha que qualquer usuário percorreria. Ver
[`docs/12-estudo-de-caso.md`](../12-estudo-de-caso.md) para o enunciado, a
execução e o resultado comparado à literatura.
