# Backlog priorizado (fases futuras)

A fatia atual entrega a **Fase 1 (Fundação)** + a **fatia vertical do catálogo**.
As fases abaixo seguem a ordem recomendada de implementação.

## Fase 2 — Catálogo e propriedades (ampliação)
- CRUD completo de materiais, classes e propriedades (criar/editar/desativar).
- Edição da taxonomia hierárquica pela interface.
- Associação de processos de fabricação, aplicações e referências.
- Pesquisa avançada (múltiplos filtros de texto/classe).

## Fase 3 — Importação
- Assistente CSV/XLSX/JSON: upload, seleção de aba, detecção de cabeçalhos,
  amostra, **mapeamento de colunas → propriedades**, identificação de unidades,
  validação de tipos, detecção de duplicidades, relatório de erros.
- Importar apenas registros válidos ou cancelar tudo; histórico e rollback
  lógico; templates de mapeamento reutilizáveis.
- Formatos de propriedade: valor único, min/max, típico, valor+unidade na
  célula, vírgula decimal, notação científica, "N/A".
- Segurança: validação de upload, limite de tamanho, sanitização de nomes,
  proteção contra fórmulas perigosas em planilhas.

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
- Entidades ainda não modeladas: User, Project, ImportJob/Template/Error,
  SelectionStudy, PerformanceIndex, RankingCriterion, SavedChart,
  GeneratedReport, AuditEvent.
