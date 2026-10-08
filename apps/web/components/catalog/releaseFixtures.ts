// Fictitious API payloads for the "Mudanças entre releases" tests (D-108).
//
// The shape is what `GET /api/catalogo/releases[/…/diff/…]` returns; the story is
// the demo seed's own (`app/db/seed_demo_releases.py`): one record of each kind.
// Every number is invented.

import type {
  CatalogRelease,
  ReleaseDiff,
  ReleaseDiffItem,
  ReleaseFieldChange,
  ReleaseNumbers,
  ReleaseRecordSide,
  ReleaseValueSide,
} from "@/lib/types";

const none: ReleaseNumbers = {
  value: null,
  min: null,
  max: null,
  typical: null,
  uncertainty: null,
  unit: null,
};

function release(slug: string, label: string, previous: string | null): CatalogRelease {
  return {
    slug,
    name: "Catálogo Demo MaterialSelect",
    release: label,
    lineage: "catalogo-demo",
    license_label: "Dado fictício de demonstração",
    provenance: "Dados exclusivamente demonstrativos.",
    source_sha256: "a".repeat(64),
    is_active: true,
    is_demo: true,
    created_at: "2026-10-08T12:00:00Z",
    imported_at: null,
    bundle_sha256: null,
    manifest_sha256: null,
    material_count: 5,
    previous_slug: previous,
  };
}

export const demoR1 = release("catalogo-demo-r1", "Demo R1", null);
export const demoR2 = release("catalogo-demo-r2", "Demo R2", "catalogo-demo-r1");
export const releaseList: CatalogRelease[] = [demoR1, demoR2];

/** A release that never declared its catalogue: comparable with nothing. */
export const undeclaredRelease: CatalogRelease = {
  ...release("sem-linha", "Sem linha", null),
  lineage: null,
  is_demo: false,
};

function numbers(value: number, unit: string): ReleaseNumbers {
  return { ...none, value, unit };
}

function scalar(
  originalValue: number,
  originalUnit: string,
  reading: { value: number; unit: string; label: string },
  canonical: { value: number; unit: string },
): ReleaseValueSide {
  return {
    state: "escalar",
    state_label: "valor único",
    original: numbers(originalValue, originalUnit),
    canonical: numbers(canonical.value, canonical.unit),
    reading: { ...numbers(reading.value, reading.unit), unit_label: reading.label },
    conversion_method: null,
    measurement_condition: null,
  };
}

const noNumber = (state: "ausente" | "nao_cadastrado", label: string): ReleaseValueSide => ({
  state,
  state_label: label,
  original: null,
  canonical: null,
  reading: null,
  conversion_method: null,
  measurement_condition: null,
});

const declaredAbsent = noNumber("ausente", "declarado ausente pela fonte");
const notRegistered = noNumber("nao_cadastrado", "não cadastrado nesta release");

function property(
  slug: string,
  label: string,
  kind: ReleaseFieldChange["kind"],
  kindLabel: string,
  unit: { reading: string; label: string; canonical: string },
  before: ReleaseValueSide,
  after: ReleaseValueSide,
): ReleaseFieldChange {
  return {
    field: `propriedade:${slug}`,
    label,
    kind,
    kind_label: kindLabel,
    before_text: null,
    after_text: null,
    property_slug: slug,
    before,
    after,
    reading_unit: unit.reading,
    reading_unit_label: unit.label,
    canonical_unit: unit.canonical,
  };
}

function side(
  id: number,
  name: string,
  classSlug: string,
  className: string,
  subclass: string | null = null,
): ReleaseRecordSide {
  return {
    material_id: id,
    name,
    class_slug: classSlug,
    class_name: className,
    subclass,
    external_gruid: null,
    raw_record_sha256: "b".repeat(64),
    is_active: true,
  };
}

const table = "MaterialUniverse";

export const densityChange = property(
  "densidade",
  "Densidade",
  "valor",
  "Valor",
  { reading: "g/cm**3", label: "g/cm³", canonical: "kg/m**3" },
  scalar(7850, "kg/m**3", { value: 7.85, unit: "g/cm**3", label: "g/cm³" }, { value: 7850, unit: "kg/m**3" }),
  scalar(7.9, "g/cm**3", { value: 7.9, unit: "g/cm**3", label: "g/cm³" }, { value: 7900, unit: "kg/m**3" }),
);

export const writingChange = property(
  "modulo_young",
  "Módulo de Young",
  "escrita_da_fonte",
  "Só a escrita da fonte (mesmo valor físico)",
  { reading: "GPa", label: "GPa", canonical: "Pa" },
  scalar(200, "GPa", { value: 200, unit: "GPa", label: "GPa" }, { value: 2e11, unit: "Pa" }),
  scalar(200000, "MPa", { value: 200, unit: "GPa", label: "GPa" }, { value: 2e11, unit: "Pa" }),
);

export const absentToValue = property(
  "condutividade_termica",
  "Condutividade térmica",
  "ausencia",
  "Presença do dado",
  { reading: "W/(m*K)", label: "W/(m·K)", canonical: "W/(m*K)" },
  declaredAbsent,
  scalar(0.25, "W/(m*K)", { value: 0.25, unit: "W/(m*K)", label: "W/(m·K)" }, { value: 0.25, unit: "W/(m*K)" }),
);

export const notRegisteredToValue = property(
  "temp_max_servico",
  "Temperatura máxima de serviço",
  "ausencia",
  "Presença do dado",
  { reading: "degC", label: "°C", canonical: "kelvin" },
  notRegistered,
  scalar(110, "degC", { value: 110, unit: "degC", label: "°C" }, { value: 383.15, unit: "kelvin" }),
);

export const valueToAbsent = property(
  "densidade",
  "Densidade",
  "ausencia",
  "Presença do dado",
  { reading: "g/cm**3", label: "g/cm³", canonical: "kg/m**3" },
  scalar(3900, "kg/m**3", { value: 3.9, unit: "g/cm**3", label: "g/cm³" }, { value: 3900, unit: "kg/m**3" }),
  declaredAbsent,
);

export const renameChange: ReleaseFieldChange = {
  field: "nome",
  label: "Nome",
  kind: "texto",
  kind_label: "Campo do registro",
  before_text: "Liga Demo de Cobre",
  after_text: "Liga Demo de Cobre (revisada)",
  property_slug: null,
  before: null,
  after: null,
  reading_unit: null,
  reading_unit_label: null,
  canonical_unit: null,
};

export const unchangedItem: ReleaseDiffItem = {
  external_table: table,
  external_record_id: "demo-001",
  status: "inalterado",
  status_label: "Inalterado",
  base: side(1, "Aço Demo Estrutural", "metais", "Metais", "Aços"),
  target: side(11, "Aço Demo Estrutural", "metais", "Metais", "Aços"),
  raw_record_changed: false,
  change_count: 0,
  changes: [],
};

export const steelItem: ReleaseDiffItem = {
  external_table: table,
  external_record_id: "demo-002",
  status: "alterado",
  status_label: "Alterado",
  base: side(2, "Aço Demo Inoxidável", "metais", "Metais", "Aços"),
  target: side(12, "Aço Demo Inoxidável", "metais", "Metais", "Aços"),
  raw_record_changed: false,
  change_count: 2,
  changes: [densityChange, writingChange],
};

export const polymerItem: ReleaseDiffItem = {
  external_table: table,
  external_record_id: "demo-003",
  status: "alterado",
  status_label: "Alterado",
  base: side(3, "Polímero Demo Técnico", "polimeros", "Polímeros"),
  target: side(13, "Polímero Demo Técnico", "polimeros", "Polímeros"),
  raw_record_changed: false,
  change_count: 2,
  changes: [absentToValue, notRegisteredToValue],
};

export const removedItem: ReleaseDiffItem = {
  external_table: table,
  external_record_id: "demo-004",
  status: "desativado",
  status_label: "Desativado (saiu da release)",
  base: side(4, "Cerâmica Demo Refratária", "ceramicas", "Cerâmicas"),
  target: null,
  raw_record_changed: null,
  change_count: 0,
  changes: [],
};

export const renamedItem: ReleaseDiffItem = {
  external_table: table,
  external_record_id: "demo-005",
  status: "alterado",
  status_label: "Alterado",
  base: side(5, "Liga Demo de Cobre", "metais", "Metais", "Ligas de Cobre"),
  target: side(15, "Liga Demo de Cobre (revisada)", "metais", "Metais", "Ligas de Cobre"),
  raw_record_changed: false,
  change_count: 1,
  changes: [renameChange],
};

export const newItem: ReleaseDiffItem = {
  external_table: table,
  external_record_id: "demo-006",
  status: "novo",
  status_label: "Novo nesta release",
  base: null,
  target: side(16, "Compósito Demo Laminado", "compositos", "Compósitos"),
  raw_record_changed: null,
  change_count: 0,
  changes: [],
};

export const allItems: ReleaseDiffItem[] = [
  steelItem,
  polymerItem,
  renamedItem,
  newItem,
  removedItem,
  unchangedItem,
];

export const releaseDiff: ReleaseDiff = {
  base: demoR1,
  target: demoR2,
  lineage: "catalogo-demo",
  is_demo: true,
  rule: "Registros casados pela identidade externa (tabela e id da fonte), nunca pelo nome.",
  counts: [
    { status: "alterado", label: "Alterado", count: 3 },
    { status: "novo", label: "Novo nesta release", count: 1 },
    { status: "desativado", label: "Desativado (saiu da release)", count: 1 },
    { status: "inalterado", label: "Inalterado", count: 1 },
  ],
  total: 6,
  classes: [
    { slug: "ceramicas", name: "Cerâmicas", count: 1 },
    { slug: "compositos", name: "Compósitos", count: 1 },
    { slug: "metais", name: "Metais", count: 3 },
    { slug: "polimeros", name: "Polímeros", count: 1 },
  ],
  filters: { tipo: null, classe: null },
  filtered_total: 6,
  page: 1,
  page_size: 25,
  page_count: 1,
  items: allItems,
};
