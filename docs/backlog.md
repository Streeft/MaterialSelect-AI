# Backlog priorizado (fases futuras)

A fatia atual entrega a **Fase 1 (Fundação)** + a **fatia vertical do catálogo**.
As fases abaixo seguem a ordem recomendada de implementação.

## Fase 2 — Catálogo e propriedades (ampliação)
- CRUD completo de materiais, classes e propriedades (criar/editar/desativar).
- Edição da taxonomia hierárquica pela interface.
- Associação de processos de fabricação, aplicações e referências.
- Pesquisa avançada (múltiplos filtros de texto/classe).

## Fase 3 — Importação ✅ (concluída; ver docs/06-importacao.md)
- Entregue: assistente CSV/XLSX (upload, abas, cabeçalhos, amostra, mapeamento
  com sugestões, validação linha a linha, duplicidades, commit só de linhas
  válidas, histórico, rollback lógico, templates, segurança de upload/fórmulas).
- Restante para fases futuras: importação JSON e de bancos SQLite; detecção
  automática de encoding além de UTF-8/Latin-1; perfis estatísticos de coluna.

## Fase 4 — Seleção determinística ✅ (concluída; ver docs/07-selecao-deterministica.md)
- Entregue: filtros/restrições (>, ≥, <, ≤, faixa, existe/não existe, classe,
  texto) com AND/OR e funil de contagem; parser seguro de índices (AST, sem
  `eval`) com validação dimensional e catálogo de índices clássicos; wizard
  Função → Restrições → Objetivo → Resultados; ranking por soma ponderada
  normalizada (min-máx/vetorial) com contribuições, exclusão explícita de dados
  ausentes e análise de sensibilidade; estudos salvos reexecutáveis.
- Restante para fases futuras: métodos TOPSIS/AHP/PROMETHEE; combinação de
  grupos de restrições aninhados (parênteses lógicos); filtros compartilháveis
  por URL.

## Fase 5 — Visualização ✅ (concluída; ver docs/08-visualizacao.md)
- Entregue: mapa de Ashby (`/mapas`) com escala linear/log, filtro por classe,
  envelopes por classe (fecho convexo calculado no espaço exibido), barras de
  erro por intervalo e por incerteza (convertidas para a unidade canônica),
  rótulos, destaque de candidatos e exclusões sempre justificadas; **linhas de
  índice com inclinação derivada da expressão** (`app/calculations/powerlaw.py`)
  e nível passando por um material escolhido, com o lado favorável reportado;
  comparador (`/comparar`) com tabela, barras, radar, coordenadas paralelas e
  heatmap sobre escores normalizados pelo backend; exportação PNG/SVG de todos
  os gráficos; integração a partir dos resultados da seleção.
- Restante para fases futuras: envelopes elípticos ajustados; dashboards
  configuráveis; propriedades dependentes de condição como curvas; salvar um
  gráfico como objeto reutilizável (`SavedChart`).

## Fase 6 — IA (opcional)
- Interface `AIProvider` + implementação mock; interpretação estruturada do
  problema; sugestões; explicações; validação por schema; confirmação do usuário.
- Ver [`adr/0003-ia-desacoplada-do-calculo.md`](adr/0003-ia-desacoplada-do-calculo.md).

## Fase 7 — Relatórios e qualidade
- Exportação CSV/XLSX (com proteção contra CSV injection), PDF e HTML imprimível;
  arquitetura para PPTX. A exportação de **imagens** (PNG/SVG) já saiu na Fase 5.
- Testes end-to-end dos fluxos; autenticação/autorização por projeto; auditoria;
  acessibilidade e desempenho; documentação final do TCC.

## Débitos técnicos conhecidos
- Unificar `apps/web/lib/types.ts` com `packages/shared-types` via npm workspaces
  + `transpilePackages` (hoje espelhado manualmente).
- Busca por palavra-chave via LIKE sobre JSON → migrar para tabela de associação
  ou índice textual quando a base crescer.
- Adicionar `UniqueConstraint(material_id, property_id)` em
  `material_property_value` (hoje a unicidade é garantida por validação de
  payload no service; a constraint de banco exige nova migration).
- Troca de unidade canônica de propriedade em uso é bloqueada (409); uma
  ferramenta futura de re-normalização em massa poderia permitir a troca
  recalculando todos os `normalized_value` na mesma transação.
- Entidades ainda não modeladas: User, Project, ImportJob/Template/Error,
  SelectionStudy, PerformanceIndex, RankingCriterion, SavedChart,
  GeneratedReport, AuditEvent.
- `black --check` falha em arquivos anteriores à Fase 5 (o repositório nunca foi
  formatado por inteiro). Rodar `black app` de uma vez, em commit próprio, para
  que a verificação passe a valer como portão de CI.
- O mapa refaz a requisição ao alternar linear ↔ log, porque os envelopes são
  calculados no espaço exibido (ver ADR 0004). Se virar incômodo, dá para
  devolver os dois fechos numa resposta só.
