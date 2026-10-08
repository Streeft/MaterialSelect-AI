# Dados de demonstração: como criar, como apagar, e por que os dois viraram um só passo

Regra fixa deste repositório, para **qualquer agente ou pessoa** que crie dado
fictício aqui — Claude Code, outro assistente de IA (Antigravity ou qualquer
outro), ou um contribuidor humano. Não é preferência de estilo: é o que evita
repetir o defeito registrado em [D-71](DECISIONS.md#d-71) — 70 materiais
fictícios que ficaram meses fora do ar porque viviam num módulo que nada
chamava.

## A regra em uma frase

**Todo dado fictício se declara pela coluna `is_demo=True` do seu próprio
modelo, e todo módulo que o cria tem de estar ligado a algo que
`admin-banco.yml` (ação `semear_demo`) de fato executa.** Um arquivo Python com
materiais, químicas, modos de transporte ou qualquer outro dado de exercício
que ninguém importa é exatamente o defeito do D-71 — só que a próxima vez.

## O que o catálogo demo tem hoje (D-107)

Os **75 materiais demo** (5 em `app.db.seed` + 70 em `app.db.seed_extended`) têm
todos ao menos uma designação e uma linha de composição, e curva de
tensão–deformação onde ela existe fisicamente — tudo fictício, `is_demo=True`,
fonte `Dataset Demo MaterialSelect`:

| | Seed principal | `seed_extended` | Total |
|---|---|---|---|
| Designações (`designations_created`) | 8 | 148 | 156 |
| Linhas de composição (`composition_entries_created`) | 19 | 361 | 380 |
| Curvas (`curves_created`) | 3 | 114 | 117 |

A única ausência decidida é a **Cerâmica Demo D**, sem curva: não tem resistência
nem escoamento cadastrados para ancorar uma curva de ruptura, e inventá-los seria
falsear o material (a razão está em `DEMO_KNOWN_GAPS`). As curvas são
**derivadas das propriedades do próprio material** (módulo, escoamento,
resistência, temperatura máxima), não digitadas; as premissas tomadas onde as
propriedades fictícias se contradizem ou faltam estão na descrição de cada curva.

O que os 70 recebem vive em `apps/api/app/db/demo_identity_data.py` (designações
`DEMO-…` e composição numa gramática de uma linha por material) e
`apps/api/app/db/seed_extended_identity.py` (curvas), chamados por
`python -m app.db.seed_extended` — o mesmo comando de `semear_demo`. O seed
principal não ganhou linha de dado, de propósito: o `conftest` o reexecuta e a
suíte tem contagens fixas.

**Conferir a cobertura** (de qualquer material, demo ou não):

```bash
cd apps/api
python -m app.db.demo_coverage            # todos os materiais ativos
python -m app.db.demo_coverage --demo     # só os is_demo
python -m app.db.demo_coverage --gaps     # só quem tem alguma ausência, com a razão
```

Depois do cutover oficial o mesmo comando lista quais materiais reais ainda estão
"sem composição cadastrada", "sem designação cadastrada" ou "sem curva
cadastrada" — a lista de cobrança à fonte.

## Se você (agente ou pessoa) for criar dado de demonstração novo

1. **Marque `is_demo=True`** no registro (ou o campo equivalente do modelo —
   `Material.is_demo`, `Source.is_demo`, `Process.is_demo`,
   `TransportMode.is_demo`, `BatteryChemistry.is_demo`,
   `PerformanceIndex.is_demo`, `MaterialDesignation.is_demo` e
   `MaterialCompositionEntry.is_demo` — as duas últimas desde o D-105, marcadas
   na própria linha para que uma designação fictícia num material real também
   seja encontrada — e `CatalogDataset.is_demo`, desde o D-108: uma **release**
   fictícia do catálogo se declara na própria linha). É o único jeito de o
   sistema saber depois que a linha é fictícia — nenhuma outra convenção
   (nome do arquivo, comentário, prefixo no nome do registro) é lida por
   código nenhum.
2. **Não crie um módulo novo e paralelo** para o dado sem primeiro checar se
   ele deveria entrar em `app.db.seed` (o baseline que
   `apps/api/app/tests/conftest.py` reexecuta em todo teste) ou em
   `app.db.seed_extended` (dado de exercício maior, fora do baseline de
   teste de propósito — ver o docstring do próprio arquivo e
   [D-71](DECISIONS.md#d-71)). Se o dado novo tem volume parecido com os 70
   materiais (dezenas de registros, não um punhado), `seed_extended.py` é o
   lugar — acrescente à lista existente ou, se for um domínio diferente
   (não material), replique o padrão: uma função `seed_algo_extended(db,
   source) -> int` que o próprio arquivo expõe, chamada pelo `main()` dele.
3. **Ligue o módulo a `admin-banco.yml`.** Depois de escrever o código,
   confira que a ação `semear_demo` (`.github/workflows/admin-banco.yml`) chama o
   comando novo — `python -m app.db.<seu_modulo>` — na sequência certa (depois
   de `app.db.seed`, se depender de classe/propriedade/fonte que ele cria).
   Sem este passo, o módulo existe e nunca roda — é exatamente isto que o
   D-71 registrou. Repita a mesma checagem em `scripts/seed.ps1`, para quem
   semeia localmente.
4. **Rode `admin-banco.yml` → `semear_demo` apenas quando quiser dados fictícios**, e leia o log: a
   contagem por categoria (`materials_created`, ou o nome que seu módulo
   imprimir) tem de subir. Job verde não prova nada sozinho — ver
   `docs/13-deploy.md` §5-ter.
5. **Escreva um teste** que rode a função de seed contra `db_session` e
   confirme a contagem criada, o mesmo padrão de
   `apps/api/app/tests/test_clear_demo.py` e de
   `apps/api/app/tests/test_admin_grant_subscription.py` — lógica testável
   separada do `main()` que só faz I/O de linha de comando.

### Releases fictícias do catálogo (D-108)

`app/db/seed_demo_releases.py` escreve **duas releases fictícias comparáveis**
(`catalogo-demo-r1` e `catalogo-demo-r2`, mesma linha `catalogo-demo`) para a
tela "Mudanças entre releases". O importador oficial **recusa** dado de
demonstração, então o seed escreve direto, como o importador escreveria uma
release real: **um `Material` por registro por release** (nunca o mesmo nas
duas, ou todo registro sairia "inalterado"), uma `CatalogRecordRef` por
material, uma fonte demo por release e os valores pelos construtores de
`app.domain.data_quality`. O roteiro cobre um registro inalterado, um que sai,
um novo noutra classe, um número que muda junto com a unidade (7850 kg/m³ →
7,9 g/cm³), um só reescrito (200 GPa → 200000 MPa), um dado declarado ausente
que passa a ter valor, uma propriedade não cadastrada que passa a existir e um
renomeado. É chamado por `seed_extended.main()` (o módulo que `semear_demo` e
`scripts/seed.ps1` executam), é idempotente por slug da release e por (release,
tabela, id externo), e o log imprime `catalog_releases_created`,
`catalog_records_created` e `catalog_release_values_created` — na primeira
execução, 2, 10 e 18; na segunda, 0, 0 e 0. `clear_demo` apaga as duas releases
com seus materiais, refs e fontes. Os 10 materiais entram na contagem de
materiais demo.

## Quando for a hora de trocar o catálogo de demonstração pelo oficial

Um comando só, sem preparar nada antes: na aba **Actions** do repositório,
`Administração do banco` → **Run workflow** → em "O que executar" escolher
**`excluir_demo`** → **Run workflow**. Sem terminal, o mesmo passo a passo do
§5-bis de `docs/13-deploy.md`.

Isso executa `python -m app.db.clear_demo`
(`apps/api/app/db/clear_demo.py`), que:

- **Apaga todo registro marcado `is_demo=True`** em `Material`, `Process`,
  `TransportMode`, `BatteryChemistry`, `PerformanceIndex` e `Source`.
  Isso inclui os materiais de `app.db.seed`/`seed_extended`, processos,
  atributos/links e modais fictícios. Os índices clássicos de Ashby passam a
  ser semeados por `semear_referencia` como referência real
  (`is_demo=False`), porque são fórmulas de engenharia e não medições
  inventadas.
- **Não deixa órfão.** `MaterialPropertyValue`, `MaterialKeyword`,
  `MaterialProcess`, `Favorite`, `RecentRecord`, `MaterialDesignation`,
  `MaterialCompositionEntry` e a receita de
  `MaterialSynthesis` de cada material fictício somem junto — explicitamente,
  em Python, não só por `ondelete` do schema (o SQLite dos testes não aplica
  `ondelete` sem uma `PRAGMA` que este projeto não liga; depender só do
  schema teria deixado a exclusão correta em produção e inverificável em
  teste — ver o docstring do próprio `clear_demo.py`).
- **Não apaga taxonomia nem dado real.** `MaterialClass`, `ProcessClass`,
  `PropertyDefinition`, definições de atributos e qualquer registro com
  `is_demo=False` continuam de pé. Químicas, índices, processos, modais e
  fontes reais são preservados. Uma `Source.is_demo=True` só é apagada depois
  de provar que nenhuma linha real ainda a cita; caso contrário o comando
  aborta, preservando a proveniência — inclusive quando quem a cita é uma
  designação ou linha de composição real (D-105). Designações e linhas de
  composição marcadas `is_demo=True` saem mesmo num material real.
- **É irreversível e idempotente**: uma segunda execução, sem material
  fictício sobrando, não faz nada e diz isso no log
  (`Nada a fazer — nenhum registro com is_demo=True.`). Não é "rode duas
  vezes por garantia" no mesmo sentido de `semear_demo` — é seguro rodar de novo
  se houver dúvida, mas a primeira execução já é definitiva para o que ela
  apagou.

**Isto não é a mesma coisa que apagar um material real.** O catálogo trata
material real como algo que se **desativa** (`DELETE /api/materiais/{id}` faz
`is_active=False`, nunca remove a linha) — um material real carrega história
(receita de síntese, estudo salvo, evento de auditoria) que apagar
destruiria. `clear_demo` é uma exceção estreita e deliberada a essa regra,
válida só porque `is_demo=True` já é a declaração de que a linha nunca foi
real: não há história para proteger. Nenhum caminho de `clear_demo` toca
`is_demo=False`, e nenhum outro lugar do sistema ganhou permissão para apagar
de verdade um material que não seja fictício.

## Para quem estiver usando outra ferramenta de IA neste repositório

Se você é um agente diferente do Claude Code — Antigravity, ou qualquer
outro — e foi pedido para adicionar dado de demonstração, exercício ou teste
ao catálogo: **leia este documento antes de escrever o seed**, e siga o
checklist da seção acima. Não crie um arquivo novo, autocontido, com o seu
próprio `if __name__ == "__main__":` desconectado de `admin-banco.yml` — foi
exatamente esse padrão, em `apps/api/app/db/seed_extended.py` (PR #59), que
ficou invisível por dias. `CLAUDE.md` na raiz deste repositório não é
específico do Claude Code apesar do nome — o próprio arquivo se descreve como
"Instruções para agentes/contribuidores trabalhando neste repositório", e
esta regra é uma extensão dele.

## Ver também

- [D-71](DECISIONS.md#d-71) — o defeito que motivou este documento.
- [D-107](DECISIONS.md#d-107) — o demo completo: designação, composição e curva
  para os 75 materiais.
- [D-72](DECISIONS.md#d-72) — a decisão de consolidar a exclusão por
  `is_demo`, com `clear_demo.py` como único caminho.
- [`docs/13-deploy.md` §5-ter](13-deploy.md) — quando disparar cada workflow
  depois de um merge.
- `apps/api/app/db/seed.py`, `apps/api/app/db/seed_extended.py`,
  `apps/api/app/db/seed_extended_identity.py`, `apps/api/app/db/demo_identity_data.py`,
  `apps/api/app/db/demo_coverage.py`,
  `apps/api/app/db/seed_reference.py`, `apps/api/app/db/clear_demo.py` — o código
  que esta regra descreve. Depois do cutover oficial, produção usa
  `semear_referencia`; `semear_demo` fica reservado a desenvolvimento/demo.
- [`18-catalogo-oficial-granta.md`](18-catalogo-oficial-granta.md) — pipeline e
  ordem do cutover oficial.
