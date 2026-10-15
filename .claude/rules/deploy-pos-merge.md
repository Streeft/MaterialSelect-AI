---
paths:
  - "apps/api/**"
  - ".github/workflows/**"
  - "Cérebro/**"
---

# Deploy depois de um merge

(Movido do `CLAUDE.md` da raiz sem alteração de texto; carrega só ao tocar nesta área.)

Mesclar um PR **não implanta nada sozinho** na API nem no banco — só o
frontend (Vercel) publica automaticamente a cada push em `main`. Depois de
mesclar qualquer PR que toque `apps/api/**`, dispare os dois workflows
manuais na aba Actions: **Deploy da API** (`deploy-api.yml`) sempre, e
**Administração do banco** (`admin-banco.yml`): `semear_referencia` mantém só
referência real reutilizável; `semear_demo` recria propositalmente os seeds
fictícios e só deve ser usado em desenvolvimento/demo. Depois do cutover
oficial, nunca use `semear_demo` no banco de produção. A carga oficial segue
`docs/18-catalogo-oficial-granta.md`. Se o PR
mudou `Cérebro/removidos.txt`, a mesma aba tem `conhecimento_simular_remocao`
e, conferido o log, `conhecimento_remover` (D-100). Se tocou `Cérebro/` ou
`Cérebro/manifesto.json`, dispare **Base de conhecimento (Cérebro)**
(`conhecimento.yml`), ação `ingerir`, fora do horário de aula — os vetores dos
trechos novos chegam na execução noturna (D-101). Passo a
passo completo e por quê em [`docs/13-deploy.md` §5-ter](docs/13-deploy.md).
Pular este passo é a causa mais provável de "o PR está em `main` mas não
aparece no ar". A outra causa, menos visível: um dado de seed que vive num
módulo que `semear` não executa — job verde não prova que o dado certo foi
escrito, só que o script executado não lançou exceção; a contagem por
categoria no log de `semear` (`materials_created`, `battery_chemistries`,
…) é o que prova ([D-71](docs/DECISIONS.md)).

