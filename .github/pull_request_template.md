## O quê

<!-- O que muda, em duas ou três frases. Não liste arquivos: o diff já lista. -->

## Por quê

<!-- O problema ou pedido que motiva a mudança. Se um desenho foi escolhido
entre alternativas, diga qual decisão registra isso (D-NN). -->

## Como testei

<!-- Comandos rodados e o que foi conferido ao vivo, no navegador ou na API.
Um bug corrigido traz o teste que falhava antes da correção. -->

## Checklist

- [ ] Li `AGENTS.md`/`CLAUDE.md` e as decisões da área em `docs/DECISIONS.md`.
- [ ] Atualizei o `README.md` e os docs afetados **no mesmo PR** — decisão nova
      em `DECISIONS.md` se escolhi um desenho, `TODO.md`,
      `CHANGELOG_SESSION.md`, `PROJECT_CONTEXT.md`, o documento da área,
      `CLAUDE.md` (Estado atual e contagem de testes) e `.env.example` se a
      configuração mudou (`docs/CLAUDE.md` §1.12).
- [ ] CI verde (backend, migrações em PostgreSQL, frontend, E2E, Lighthouse).
- [ ] Nenhum princípio inegociável afrouxado: nenhum valor inventado, nenhum
      cálculo fora do backend, nenhuma ausência virando zero, nenhum segredo
      versionado.
- [ ] Depois do merge: **Deploy da API** se tocou `apps/api/**`, e
      **Administração do banco → `semear`** se tocou `seed.py` ou
      `seed_extended.py` (`docs/13-deploy.md` §5-ter).
