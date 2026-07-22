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

## Fase 4 — Seleção determinística
- Filtros e restrições (>, ≥, <, ≤, faixa, existe/não existe, classe, texto)
  com AND/OR e contagem de candidatos restantes.
- Índices de desempenho: catálogo pronto + **parser seguro de expressões**
  (sem `eval`) com validação dimensional.
- Wizard Função → Restrições → Objetivo → Variáveis livres.
- Ranking multicritério (soma ponderada normalizada; arquitetura para
  TOPSIS/AHP/PROMETHEE) com análise de sensibilidade.
- Projetos salvos (SelectionStudy, SelectionConstraint, RankingCriterion).

## Fase 5 — Visualização
- Mapas de propriedades avançados: envelopes por classe, barras de erro,
  retângulos de intervalo, linhas de índice.
- Comparador: tabela, barras, radar, coordenadas paralelas, heatmap normalizado.
- Dashboards e exportação de gráficos (PNG/SVG).

## Fase 6 — IA (opcional)
- Interface `AIProvider` + implementação mock; interpretação estruturada do
  problema; sugestões; explicações; validação por schema; confirmação do usuário.
- Ver [`adr/0003-ia-desacoplada-do-calculo.md`](adr/0003-ia-desacoplada-do-calculo.md).

## Fase 7 — Relatórios e qualidade
- Exportação CSV/XLSX (com proteção contra CSV injection), PDF e HTML imprimível;
  arquitetura para PPTX.
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
