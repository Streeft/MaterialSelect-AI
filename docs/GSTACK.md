# gstack

O [gstack](https://github.com/garrytan/gstack) está instalado em
`~/.claude/skills/gstack` e expõe papéis de uma equipe de engenharia como
comandos de barra. Os úteis aqui, por papel:

- **Produto/estratégia:** `/office-hours`, `/plan-ceo-review`, `/autoplan`
- **Engenharia:** `/plan-eng-review`, `/investigate`, `/devex-review`
- **Design:** `/plan-design-review`, `/design-consultation`, `/design-shotgun`,
  `/design-html`, `/design-review`
- **Revisão e QA:** `/review`, `/codex`, `/qa`, `/qa-only`
- **Segurança:** `/cso` (OWASP Top 10 + STRIDE)
- **Release:** `/ship`, `/land-and-deploy`, `/canary`
- **Documentação:** `/document-release`, `/document-generate`
- **Retrospectiva:** `/retro`
- **Proteções:** `/careful`, `/freeze`, `/guard`, `/unfreeze`

Os comandos são sugestões de fluxo, não autoridade: **as regras deste arquivo e
as decisões em `docs/DECISIONS.md` prevalecem** sobre o que qualquer skill
externa recomendar. Em particular, nenhum deles autoriza violar os princípios
inegociáveis da metodologia nem as proibições do sistema de design.

