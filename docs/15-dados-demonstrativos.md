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
`admin-banco.yml` (ação `semear`) de fato executa.** Um arquivo Python com
materiais, químicas, modos de transporte ou qualquer outro dado de exercício
que ninguém importa é exatamente o defeito do D-71 — só que a próxima vez.

## Se você (agente ou pessoa) for criar dado de demonstração novo

1. **Marque `is_demo=True`** no registro (ou o campo equivalente do modelo —
   `Material.is_demo`, `Source.is_demo`, `Process.is_demo`, `TransportMode`
   não tem porque é dado real de literatura, D-66). É o único jeito de o
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
   confira que a ação `semear` (`.github/workflows/admin-banco.yml`) chama o
   comando novo — `python -m app.db.<seu_modulo>` — na sequência certa (depois
   de `app.db.seed`, se depender de classe/propriedade/fonte que ele cria).
   Sem este passo, o módulo existe e nunca roda — é exatamente isto que o
   D-71 registrou. Repita a mesma checagem em `scripts/seed.ps1`, para quem
   semeia localmente.
4. **Rode `admin-banco.yml` → `semear` depois de mesclar**, e leia o log: a
   contagem por categoria (`materials_created`, ou o nome que seu módulo
   imprimir) tem de subir. Job verde não prova nada sozinho — ver
   `docs/13-deploy.md` §5-ter.
5. **Escreva um teste** que rode a função de seed contra `db_session` e
   confirme a contagem criada, o mesmo padrão de
   `apps/api/app/tests/test_clear_demo.py` e de
   `apps/api/app/tests/test_admin_grant_subscription.py` — lógica testável
   separada do `main()` que só faz I/O de linha de comando.

## Quando for a hora de trocar o catálogo de demonstração pelo oficial

Um comando só, sem preparar nada antes: na aba **Actions** do repositório,
`Administração do banco` → **Run workflow** → em "O que executar" escolher
**`excluir_demo`** → **Run workflow**. Sem terminal, o mesmo passo a passo do
§5-bis de `docs/13-deploy.md`.

Isso executa `python -m app.db.clear_demo`
(`apps/api/app/db/clear_demo.py`), que:

- **Apaga todo `Material` com `is_demo=True`** — os 5 de `app.db.seed`, os 70
  de `app.db.seed_extended`, e qualquer outro que um seed futuro venha a
  marcar assim, não importa em qual arquivo foi definido. A pergunta "isto é
  fictício?" tem uma resposta só, a coluna, e a exclusão em massa lê
  exatamente essa coluna.
- **Não deixa órfão.** `MaterialPropertyValue`, `MaterialKeyword`,
  `MaterialProcess`, `Favorite`, `RecentRecord` e a receita de
  `MaterialSynthesis` de cada material fictício somem junto — explicitamente,
  em Python, não só por `ondelete` do schema (o SQLite dos testes não aplica
  `ondelete` sem uma `PRAGMA` que este projeto não liga; depender só do
  schema teria deixado a exclusão correta em produção e inverificável em
  teste — ver o docstring do próprio `clear_demo.py`).
- **Não apaga taxonomia nem dado real.** `MaterialClass`, `Process`,
  `ProcessClass`, `PropertyDefinition`, `PerformanceIndex`,
  `BatteryChemistry` e `TransportMode` continuam de pé — os dois últimos são
  dado real de literatura pública (`is_demo=False`, D-66/D-69), não
  fictício, e a taxonomia é reutilizável pelos materiais oficiais que forem
  chegar sob a mesma família.
- **É irreversível e idempotente**: uma segunda execução, sem material
  fictício sobrando, não faz nada e diz isso no log
  (`Nada a fazer — nenhum material com is_demo=True.`). Não é "rode duas
  vezes por garantia" no mesmo sentido de `semear` — é seguro rodar de novo
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
- [D-72](DECISIONS.md#d-72) — a decisão de consolidar a exclusão por
  `is_demo`, com `clear_demo.py` como único caminho.
- [`docs/13-deploy.md` §5-ter](13-deploy.md) — quando disparar cada workflow
  depois de um merge.
- `apps/api/app/db/seed.py`, `apps/api/app/db/seed_extended.py`,
  `apps/api/app/db/clear_demo.py` — o código que esta regra descreve.
