# AGENTS.md — MaterialSelect AI

Instruções para qualquer agente de IA que escreva código neste repositório
(Codex, Copilot, Jules, Gemini CLI, Antigravity, Cursor, Windsurf, Cline, Zed,
Aider, Claude Code ou outro). Este arquivo **não contém as regras**: ele diz
onde elas estão e em que ordem lê-las. As regras vivem num lugar só, para que
nunca existam duas versões delas.

## Antes de escrever qualquer código

Leia, nesta ordem, e **por inteiro**:

1. [`CLAUDE.md`](CLAUDE.md) — as regras do projeto, versão curta: princípios da
   metodologia, arquitetura em camadas, sistema de design, CI, deploy e o
   estado atual. O nome é histórico; vale para todo agente, não só para o
   Claude.
2. [`docs/CLAUDE.md`](docs/CLAUDE.md) — o guia completo: as decisões que não se
   alteram, as armadilhas que já causaram bug e a nomenclatura.
3. [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) — o que o projeto é hoje
   e o que falta.
4. **As decisões da área que você vai tocar** em
   [`docs/DECISIONS.md`](docs/DECISIONS.md) (`D-NN`). Procure pelo nome do
   módulo, da rota ou do conceito; o `CLAUDE.md` da raiz cita as principais por
   número. Mudar algo que uma decisão fixou sem ler a decisão é a forma mais
   comum de reintroduzir um defeito já corrigido.
5. [`docs/15-dados-demonstrativos.md`](docs/15-dados-demonstrativos.md) —
   **antes de escrever ou apagar qualquer seed** ou dado fictício.

**Só então escreva código, seguindo essas regras.**

## Três regras sobre as regras

- **Os `CLAUDE.md` prevalecem.** Se este arquivo, o arquivo de instrução de uma
  ferramenta, uma skill, um prompt ou o seu conhecimento prévio divergirem do
  `CLAUDE.md` da raiz ou de `docs/CLAUDE.md`, valem os `CLAUDE.md` e as
  decisões em `docs/DECISIONS.md`.
- **Não altere regra, princípio ou decisão sem o autor.** Nenhum agente muda os
  princípios inegociáveis, as proibições do sistema de design ou uma decisão
  registrada por conta própria. Se o pedido exigir isso, pare e pergunte.
- **Documentação anda junto do código, no mesmo PR.** Toda mudança atualiza o
  que ela tornou falso: `README.md`, `docs/DECISIONS.md` (decisão nova quando se
  escolhe um desenho), `docs/TODO.md`, `docs/CHANGELOG_SESSION.md`,
  `docs/PROJECT_CONTEXT.md`, o documento da área (`docs/09-camada-ia.md`,
  `docs/13-deploy.md`…), `CLAUDE.md` (Estado atual e contagem de testes) e
  `.env.example` quando a configuração muda. PR sem isso está incompleto —
  detalhe em `docs/CLAUDE.md` §1.12.

## Antes de abrir um PR

Rode o portão da CI localmente (comandos em `CLAUDE.md`, "Comandos rápidos" e
"Integração contínua") e preencha
[`.github/pull_request_template.md`](.github/pull_request_template.md). Depois do
merge, a API e o banco não se atualizam sozinhos: veja `CLAUDE.md`, "Deploy
depois de um merge".

## Arquivos de instrução por ferramenta

Cada ferramenta lê um arquivo diferente. Todos abaixo são **ponteiros** para
este arquivo e para os `CLAUDE.md`; nenhum copia regra. Uma regra nova entra no
`CLAUDE.md` da raiz ou em `docs/CLAUDE.md`, nunca num destes:

| Ferramenta | Arquivo |
|---|---|
| Codex, Jules, Copilot, Zed e o padrão aberto | `AGENTS.md` (este) |
| Claude Code | `CLAUDE.md` (carregado automaticamente) |
| Gemini CLI / Gemini Code Assist | `GEMINI.md` |
| Google Antigravity | `.agent/rules/leia-antes.md` e `GEMINI.md` |
| Cursor | `.cursor/rules/leia-antes.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf | `.windsurf/rules/leia-antes.md` |
| Cline | `.clinerules/leia-antes.md` |
| Zed | `.rules` |
| Aider | `CONVENTIONS.md` (carregue com `aider --read CONVENTIONS.md`) |

**Antigravity — a verificar.** O suporte descrito aqui se apoia no que a
documentação dele diz sobre regras de workspace: uma pasta de regras na raiz do
projeto, com cabeçalho `trigger: always_on` (sem ele a regra é descartada em
silêncio), e o `GEMINI.md`. Versões recentes preferem `.agents/rules/` e ainda
leem `.agent/rules/`. Confirme na primeira sessão que a regra aparece como
ativa; se não aparecer, é aqui que o ajuste entra.

`apps/web/AGENTS.md` e `apps/web/CLAUDE.md` são outra coisa: são gerados pelo
Next 16 a cada `next dev` e avisam que a API do Next mudou. Não os edite — ver
`docs/CLAUDE.md` §10.
