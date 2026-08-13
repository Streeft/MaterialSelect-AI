# Backlog priorizado

Documento canônico do que falta. Substitui `backlog.md`, que agora aponta para
cá.

**Dificuldade:** ▁ baixa (horas) · ▃ média (1–2 dias) · ▆ alta (uma semana ou mais).

Identificadores (`A1`, `M7`…) são **estáveis**: um item concluído sai da lista e
vai para "Débitos já quitados", deixando lacuna na numeração em vez de renumerar
os vizinhos — outros documentos citam esses códigos.

---

## Alta prioridade

### A2 — Estudo de caso didático completo
- **Descrição:** um caso com solução consolidada na literatura, do enunciado ao
  relatório exportado, verificando se os candidatos e a ordenação correspondem
  ao esperado. Publicar como roteiro em `docs/`.
- **Impacto:** alto. É **entregável explícito da proposta** (itens 2.6 e 6) e a
  validação metodológica do trabalho. Sem ele, a ferramenta funciona mas não
  está demonstrada.
- **Dificuldade:** ▃
- **Dependências:** nenhuma técnica; depende de escolher o caso na literatura.

### A5 — Autenticação e autorização por projeto
- **Descrição:** usuários, sessões, e escopo de dados por projeto.
- **Impacto:** alto **se** o sistema for exposto em rede. Hoje a API é
  totalmente aberta, incluindo escrita e exclusão (ver [DECISIONS.md](DECISIONS.md) D-18).
- **Dificuldade:** ▆
- **Dependências:** exige modelar `User` e `Project` e revisar toda consulta para
  filtrar por escopo. Não comece sem decidir se o trabalho será hospedado.

---

## Média prioridade

### M1 — Triagem de licenciamento das bases incorporadas
- **Descrição:** registrar procedência e licença de cada base/documentação
  importada, com sinalização de conteúdo possivelmente protegido e decisão
  humana obrigatória antes da incorporação.
- **Impacto:** médio-alto. É **compromisso do item 4.2 da proposta** e uma
  mitigação de risco declarada, ainda não implementada.
- **Dificuldade:** ▃
- **Dependências:** modelo de `Source` já existe e pode ser estendido.

### M2 — Auditoria de alterações
- **Descrição:** `AuditEvent` registrando quem mudou o quê e quando.
- **Impacto:** médio. Sustenta a alegação de rastreabilidade no nível do
  *processo*, não só do dado.
- **Dificuldade:** ▃
- **Dependências:** faz mais sentido depois de A5 (sem usuários, "quem" fica vazio).

### M8 — Desempenho medido (Lighthouse)
- **Descrição:** a metade de desempenho do antigo M3, que ficou de fora quando a
  acessibilidade foi entregue. **A parte de peso de bundle já foi feita** na
  varredura da Fase 9: o Plotly era mesmo o suspeito — 4,5 MB, 79% de todo o JS —
  e passou a ser montado à la carte, derrubando o maior *chunk* para 981 KB
  (`PROJECT_CONTEXT.md §12`). O que resta é o que nunca foi medido: **tempo até
  interativo** em todas as rotas, com Lighthouse ou equivalente.
- **Impacto:** médio. Um estudante em aula, num notebook modesto, é o público
  descrito na proposta.
- **Dificuldade:** ▁ (o que sobrou), antes ▃
- **Dependências:** nenhuma. Se virar job de CI, vale o aviso do A4 sobre
  `scripts/protect-main.ps1`.

### M4 — Unificar o contrato de tipos
- **Descrição:** npm workspaces + `transpilePackages` para eliminar o espelho
  manual entre `packages/shared-types` e `apps/web/lib/types.ts`.
- **Impacto:** médio. Hoje toda mudança de contrato exige editar dois arquivos, e
  esquecer um só aparece em runtime.
- **Dificuldade:** ▃
- **Dependências:** mexe na configuração de build do Next — faça em PR isolado.

### M5 — Métodos multicritério adicionais (TOPSIS, AHP, PROMETHEE)
- **Descrição:** implementar sobre a estrutura já genérica de `domain/ranking.py`.
- **Impacto:** médio. Previsto na arquitetura e **explicitamente fora do escopo
  desta versão** (item 5 da proposta) — só faça se o orientador pedir.
- **Dificuldade:** ▃
- **Dependências:** nenhuma; a matriz de escores já está no formato certo.

### M6 — Restrições com parênteses lógicos
- **Descrição:** grupos aninhados em vez de só AND/OR global.
- **Impacto:** médio para problemas reais de projeto.
- **Dificuldade:** ▃
- **Dependências:** muda o schema de `SelectionConstraint` (precisa de migration).

---

## Baixa prioridade

### B1 — Filtros compartilháveis por URL
- **Impacto:** baixo, mas útil para uso didático (o professor manda o link).
- **Dificuldade:** ▁ · **Dependências:** nenhuma.

### B2 — Exportação PPTX
- **Impacto:** baixo. Previsto como *arquitetura para*, não como entrega.
- **Dificuldade:** ▃ · **Dependências:** A3 primeiro (mesmo modelo `Report`).

### B3 — Importação de JSON e SQLite
- **Impacto:** baixo enquanto a base vier em planilha.
- **Dificuldade:** ▃ · **Dependências:** camada de leitores já é extensível.

### B4 — Detecção automática de encoding além de UTF-8/Latin-1
- **Impacto:** baixo. **Dificuldade:** ▁ · **Dependências:** nenhuma.

### B5 — Busca textual em tabela de associação
- **Descrição:** hoje palavras-chave usam LIKE sobre JSON.
- **Impacto:** baixo até a base crescer; então vira desempenho.
- **Dificuldade:** ▃ · **Dependências:** migration.

### B6 — Envelopes elípticos ajustados
- **Descrição:** hoje o envelope é fecho convexo — literal e honesto com poucos
  materiais por classe.
- **Impacto:** baixo, estético. **Dificuldade:** ▃ · **Dependências:** nenhuma.

### B7 — Salvar gráfico como objeto reutilizável (`SavedChart`)
- **Impacto:** baixo. **Dificuldade:** ▃ · **Dependências:** migration.

### B8 — Evitar a segunda requisição ao alternar linear ↔ log
- **Descrição:** devolver os dois fechos convexos numa resposta só.
- **Impacto:** baixo, só latência. **Dificuldade:** ▁ · **Dependências:** nenhuma.

### B9 — Renormalização em massa ao trocar unidade canônica
- **Descrição:** hoje trocar a unidade canônica de propriedade em uso é
  bloqueado com 409.
- **Impacto:** baixo. **Dificuldade:** ▃ · **Dependências:** transação única.

### B10 — Migrar o aviso do `httpx`/Starlette
- **Descrição:** `StarletteDeprecationWarning` sugere `httpx2` no TestClient.
- **Impacto:** baixo, cosmético. **Dificuldade:** ▁ · **Dependências:** upstream.

---

## Entidades ainda não modeladas

`User`, `Project`, `AuditEvent`, `SavedChart`, `GeneratedReport`. Cada uma
depende de um item acima (A5, M2, B7) — não crie tabela sem o caso de uso.

---

## Débitos já quitados

Registrados para não voltarem por engano:

- ~~**A4** — testes end-to-end dos fluxos~~ — Playwright cobre importar →
  selecionar → visualizar → exportar como uma sessão contínua no navegador,
  contra API e banco (SQLite, descartável) próprios, em portas isoladas das de
  desenvolvimento (`apps/web/e2e/`, `apps/web/playwright.config.ts`,
  `apps/api/scripts/e2e_server.py`; `npm run test:e2e`). Achou um bug real de
  produção antes de ir ao ar: a sugestão automática de coluna na importação
  (`_suggest`, `app/importers/service.py`) comparava um slug hifenizado
  (`slugify()` sempre usa `-`) contra o slug armazenado, que usa `_` — então
  **toda propriedade de nome composto** ("Módulo de Young", "Limite de
  escoamento" etc.) nunca era sugerida automaticamente, e só "Densidade"
  (palavra única) por coincidência funcionava. Corrigido comparando os dois
  lados já normalizados; regressão coberta em `test_imports_api.py`.
- ~~**B11** — Playwright (A4) como check obrigatório de CI~~ — job
  `E2E (Playwright)` em `ci.yml`: Python + Node no mesmo runner, Chromium via
  `--with-deps`, `npm run test:e2e`, relatório HTML publicado como artefato
  quando falha. `playwright.config.ts` resolvia o Python fixo em
  `.venv/Scripts/python.exe` (layout Windows) — não existe no runner Ubuntu;
  agora `E2E_API_PYTHON` sobrepõe o caminho, e o workflow passa
  `E2E_API_PYTHON=python`, o que o `setup-python` já deixa no PATH.
  `scripts/protect-main.ps1` ganhou o nome do check e foi rodado contra o
  repositório.
- ~~`black --check` falhava em arquivos anteriores à Fase 5~~ — backend formatado
  por inteiro em commit próprio; `black --check` virou portão de CI.
- ~~Isolamento de testes quebrado com pysqlite~~ — corrigido no `conftest.py`,
  guardado por `test_isolation.py` (ver [DECISIONS.md](DECISIONS.md) D-17).
- ~~Sem CI~~ — `.github/workflows/ci.yml` roda em todo PR e push.
- ~~**A3** — relatório em HTML imprimível~~ — `app/exporters/html.py` renderiza o
  mesmo `Report` que já alimentava CSV e XLSX, com folha de impressão; o PDF sai
  do navegador e nenhuma dependência de geração de PDF entrou no projeto.
  Escape de marcação próprio + CSP `default-src 'none'` como camada
  independente.
- ~~**M7** — unicidade em `material_property_value`~~ —
  `uq_material_property_value_pair` na migration `bfeee728d230`. A migration
  **falha e não apaga nada** se encontrar duplicatas: dizer quais são e deixar a
  escolha com o usuário é preferível a descartar proveniência em silêncio.
- ~~**M3** — acessibilidade~~ — teclado, foco visível nos dois temas, link de
  pular para o conteúdo, rótulos programáticos, contraste AA medido contra a
  superfície mais escura em que cada token aparece ([D-29](DECISIONS.md)) e
  **tabela de dados por figura** ([D-31](DECISIONS.md)), que é o que torna um
  mapa de Ashby legível por leitor de tela. O axe roda sobre as primitivas e
  sobre as telas principais dentro do `npm run test`
  (`apps/web/app/routes.a11y.test.tsx`); a lista do que só se verifica à mão
  está em [11-usabilidade.md](11-usabilidade.md) §6. A metade de **desempenho**
  do item não foi feita e virou **M8**.
- ~~README afirmava que a CI bloqueia o merge~~ — passou a ser verdade com A1;
  antes disso o texto foi corrigido para não prometer garantia que não havia.
- ~~**A1** — checks de CI obrigatórios~~ — ruleset `CI obrigatoria em main`
  exigindo `Backend (Python 3.11)`, `Backend (Python 3.12)` e `Frontend`, **sem
  ator de exceção** (vale para o dono do repositório também) e com a branch
  obrigada a estar atualizada com `main` antes do merge. Só foi possível porque
  o repositório passou a ser **público**: no GitHub Free a proteção de branch
  não existe em repositório privado, e tanto `PUT /branches/main/protection`
  quanto `POST /rulesets` respondiam
  `403 — "Upgrade to GitHub Pro or make this repository public"`
  (ver [DECISIONS.md](DECISIONS.md) D-22). Reaplicável e auditável por
  `scripts/protect-main.ps1`, que é idempotente.
