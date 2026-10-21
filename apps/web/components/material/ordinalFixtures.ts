import type { MaterialOrdinalValues } from "@/lib/types";

/**
 * The three states of an ordinal property on a sheet, as the backend sends them
 * (D-126): a level held, a source that says there is none, and nobody having
 * filled it. Fictitious, like the demo they mirror.
 */
const SCALE = ["Muito pobre", "Pobre", "Aceitável", "Bom", "Excelente"];

export const ordinalValues: MaterialOrdinalValues = {
  material_id: 2,
  material_name: "Aço Demo B",
  values: [
    {
      slug: "durabilidade_agua_doce",
      name: "Durabilidade em água doce",
      status: "nivel",
      status_text: "Nível cadastrado",
      level: "Bom",
      rank: 3,
      scale: SCALE,
      source_label: "Dataset Demo MaterialSelect",
      data_quality: "ESTIMADO",
      measurement_condition: "Água doce, 20 °C.",
      notes: null,
      is_demo: true,
    },
    {
      slug: "durabilidade_acido_forte",
      name: "Durabilidade em ácido forte",
      status: "ausente",
      status_text: "Ausente na fonte (sem nível)",
      level: null,
      rank: null,
      scale: SCALE,
      source_label: "Dataset Demo MaterialSelect",
      data_quality: "ESTIMADO",
      measurement_condition: null,
      notes: null,
      is_demo: true,
    },
    {
      slug: "durabilidade_solvente",
      name: "Durabilidade em solvente orgânico",
      status: "sem_dado",
      status_text: "Sem dado cadastrado",
      level: null,
      rank: null,
      scale: SCALE,
      source_label: null,
      data_quality: null,
      measurement_condition: null,
      notes: null,
      is_demo: false,
    },
  ],
};

export const emptyOrdinalValues: MaterialOrdinalValues = {
  ...ordinalValues,
  values: [],
};
