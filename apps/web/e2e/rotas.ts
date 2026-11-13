/**
 * The routes that open without an id of their own, shared by the specs that walk
 * every screen: `larguras.spec.ts` (no sideways scroll, nothing cut) and
 * `a11y.spec.ts` (axe, D-226). One list, so a route added to the product is
 * measured by both or by neither.
 */
// Routes that open without an id. The ones that need a record are reached from
// these by their own specs; here the point is the shell and each tool's screen.
export const ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["inicio", "/app"],
  ["aparencia", "/app/aparencia"],
  // D-236: Conta, inside the app.
  ["conta", "/app/conta"],
  ["catalogo", "/app/catalogo"],
  ["selecao", "/app/selecao"],
  ["mapas", "/app/mapas"],
  ["comparar", "/app/comparar"],
  ["painel", "/app/painel"],
  ["processos", "/app/processos"],
  ["cadernos", "/app/cadernos"],
  ["eco", "/app/eco"],
  ["custo", "/app/custo"],
  ["dimensionar", "/app/dimensionar"],
  ["sintetizar", "/app/sintetizar"],
  ["baterias", "/app/baterias"],
  ["glossario", "/app/glossario"],
  ["glossario-familias", "/app/glossario/familias"],
  ["importar", "/app/importar"],
  ["meus-registros", "/app/meus-registros"],
  ["admin-classes", "/app/admin/classes"],
  ["admin-propriedades", "/app/admin/propriedades"],
  ["estilo", "/app/estilo"],
  // D-190: screens that only exist with state in the address.
  ["selecao-resultados", "/app/selecao?etapa=resultados"],
  ["mapas-nivel-2", "/app/mapas?nivel=2"],
  // D-193: each tab of the panel is its own screen, with its own figures.
  ["painel-propriedades", "/app/painel?aba=propriedades"],
  ["painel-processos", "/app/painel?aba=processos"],
  ["painel-qualidade", "/app/painel?aba=qualidade"],
  ["painel-atividade", "/app/painel?aba=atividade"],
  ["painel-filtrado", "/app/painel?classe=metais&nivel=1"],
  // D-215: the document pages that open without an id of their own.
  ["catalogo-familia", "/app/catalogo/metais"],
  ["material-novo", "/app/materiais/novo"],
];
