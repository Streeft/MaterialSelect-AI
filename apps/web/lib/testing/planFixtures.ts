import type {
  PlanComponent,
  PlanConstraint,
  PlanMaterial,
  ProjectPlan,
} from "@/lib/types";

/** A plan limit as the API sends it; the overrides say which origin it is. */
export function makeConstraint(overrides: Partial<PlanConstraint> = {}): PlanConstraint {
  return {
    property: "temperatura_servico_min",
    property_name: "Temperatura mínima de serviço",
    operator: "lte",
    value: -40,
    value_min: null,
    value_max: null,
    unit: "°C",
    level: null,
    origin: "usuario",
    source: "Seu texto",
    note: "",
    label: "Temperatura mínima de serviço ≤ −40 °C",
    applied: true,
    needs_confirmation: false,
    constraint: { operator: "lte", property_slug: "temperatura_servico_min", value: -40, unit: "°C" },
    ...overrides,
  };
}

export function makeMaterial(overrides: Partial<PlanMaterial> = {}): PlanMaterial {
  return {
    record_id: 11,
    name: "Náilon 6,6",
    class_name: "Polímeros",
    rank: 1,
    index_value: null,
    score: 0.9,
    reason: "Melhor no índice de leveza dentro dos limites aplicados.",
    ...overrides,
  };
}

/** The three origins of the proposal, in one part. */
export function makeComponent(overrides: Partial<PlanComponent> = {}): PlanComponent {
  const user = makeConstraint();
  const scenario = makeConstraint({
    property: "temperatura_servico_max",
    property_name: "Temperatura máxima de serviço",
    operator: "gte",
    value: 60,
    origin: "cenario:calor-moderado",
    source: "Referência didática do projeto (faixa típica de uso)",
    label: "Temperatura máxima de serviço ≥ 60 °C",
    constraint: { operator: "gte", property_slug: "temperatura_servico_max", value: 60, unit: "°C" },
  });
  const suggestion = makeConstraint({
    property: "densidade",
    property_name: "Densidade",
    operator: "lte",
    value: 1500,
    unit: "kg/m³",
    origin: "sugestao_ia",
    source: "Sugestão da IA, revise",
    label: "Densidade ≤ 1.500 kg/m³",
    applied: false,
    needs_confirmation: true,
    constraint: { operator: "lte", property_slug: "densidade", value: 1500, unit: "kg/m³" },
  });
  const base: PlanComponent = {
    key: "c1",
    name: "Camada externa",
    role: "Protege do vento e da neve",
    function_text: "Camada externa de roupa de esqui",
    objective_text: "Mínima massa com resistência ao frio",
    index: {
      slug: "viga-leve-rigidez",
      name: "Leveza com rigidez",
      expression: "sqrt(modulo_young) / densidade",
      goal: "maximize",
    },
    criteria: [],
    constraints: [user, scenario, suggestion],
    scenarios: ["calor-moderado"],
    rejected: [],
    result: {
      initial_count: 668,
      final_count: 42,
      funnel: [{ label: "Limites", remaining: 42 }],
      materials: [
        makeMaterial(),
        makeMaterial({ record_id: 12, name: "Poliéster", rank: 2, reason: "Segundo no índice." }),
        makeMaterial({ record_id: 13, name: "Elastano", rank: 3, reason: "Terceiro no índice." }),
      ],
      message: null,
      error: null,
    },
    study: {
      name: "Camada externa",
      description: "Proposta do assistente de projeto.",
      function_text: "Camada externa de roupa de esqui",
      objective_text: "Mínima massa com resistência ao frio",
      free_variables: [],
      stages: [
        {
          kind: "limit",
          enabled: true,
          root_group: {
            operator: "AND",
            constraints: [user.constraint, scenario.constraint],
            groups: [],
          },
        },
      ],
      index: {
        name: "Leveza com rigidez",
        expression: "sqrt(modulo_young) / densidade",
        goal: "maximize",
      },
      normalization: "minmax",
      method: "weighted_sum",
      criteria: [{ key: "__index__", weight: 1 }],
      notes: null,
    },
  };
  const merged = { ...base, ...overrides };
  // The study carries the part's name, as the server's does.
  return overrides.study ? merged : { ...merged, study: { ...merged.study, name: merged.name } };
}

export function makePlan(overrides: Partial<ProjectPlan> = {}): ProjectPlan {
  return {
    text: "quero fazer uma roupa de esqui",
    mode: "project",
    summary: "Roupa de esqui em três camadas, para frio intenso.",
    assumptions: ["Uso em temperaturas negativas."],
    open_questions: ["Qual é a temperatura mais baixa esperada?"],
    scenarios_used: [
      {
        id: "calor-moderado",
        name: "Calor moderado",
        source: "Referência didática do projeto (faixa típica de uso)",
      },
    ],
    components: [
      makeComponent(),
      makeComponent({ key: "c2", name: "Camada isolante", role: "Retém o calor" }),
      makeComponent({ key: "c3", name: "Forro", role: "Em contato com a pele" }),
    ],
    rejected: [],
    degraded: false,
    cached: false,
    notice: null,
    provider: "mock",
    simulated: true,
    disclaimer: "Texto gerado por IA; confira antes de decidir.",
    ...overrides,
  };
}
