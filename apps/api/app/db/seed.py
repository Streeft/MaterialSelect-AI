"""Seed the database with synthetic demonstration data.

⚠️  Dados exclusivamente demonstrativos. Não utilizar em projetos reais.

The five materials below are FICTITIOUS. Their property values are invented to
exercise the system's features — unit conversion, intervals, missing data and
uncertainty — not to describe any real material. Running this module is
idempotent: it will not duplicate rows on repeated runs.

Run with::

    python -m app.db.seed
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.base import Base, SessionLocal, engine
from app.domain.data_quality import (
    build_interval_value,
    build_scalar_value,
    missing_value,
)
from app.models.enums import (
    BetterDirection,
    DataQuality,
    ProcessAttributeKind,
    PropertyCategory,
)
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.performance_index import PerformanceIndex
from app.models.process import MaterialProcess, Process, ProcessClass
from app.models.process_attribute import ProcessAttributeDefinition, ProcessAttributeValue
from app.models.project import Project
from app.models.property_definition import PropertyDefinition
from app.models.source import Source
from app.models.user import User, UserSession
from app.repositories.material_repository import MaterialRepository
from app.repositories.subscription_repository import SubscriptionRepository

DEMO_WARNING = "Dados exclusivamente demonstrativos. Não utilizar em projetos reais."

# Stable, fictitious Google `sub` for the E2E fixture user — never a real
# Google identity, since this row is never reached through the OAuth flow.
E2E_USER_GOOGLE_SUB = "e2e-fixture-user"

# Fictitious Stripe ids for the same fixture user. No Stripe account ever sees
# them: the subscription gate reads only the local `status` column, so an
# invented customer id is enough to make the E2E browser a paying user.
E2E_STRIPE_CUSTOMER_ID = "cus_e2e_seed"
E2E_STRIPE_SUBSCRIPTION_ID = "sub_e2e_seed"

# --- Taxonomy -------------------------------------------------------------
CLASSES = [
    {"name": "Metais", "slug": "metais"},
    {"name": "Polímeros", "slug": "polimeros"},
    {"name": "Cerâmicas", "slug": "ceramicas"},
    {"name": "Compósitos", "slug": "compositos"},
    {"name": "Elastômeros", "slug": "elastomeros"},
]

# --- Property catalogue ---------------------------------------------------
# canonical_unit uses Pint-parsable unit strings.
PROPERTIES = [
    {
        "slug": "densidade",
        "name": "Densidade",
        "symbol": "ρ",
        "category": PropertyCategory.FISICA,
        "physical_dimension": "[mass] / [length] ** 3",
        "canonical_unit": "kg/m**3",
        "accepted_units": ["kg/m**3", "g/cm**3"],
        "is_interval": False,
        "better_direction": BetterDirection.LOWER,
    },
    {
        "slug": "modulo_young",
        "name": "Módulo de Young",
        "symbol": "E",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "[mass] / [length] / [time] ** 2",
        "canonical_unit": "Pa",
        "accepted_units": ["Pa", "MPa", "GPa"],
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "limite_escoamento",
        "name": "Limite de escoamento",
        "symbol": "σy",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "[mass] / [length] / [time] ** 2",
        "canonical_unit": "Pa",
        "accepted_units": ["Pa", "MPa", "GPa"],
        "is_interval": True,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "resistencia_tracao",
        "name": "Resistência à tração",
        "symbol": "σu",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "[mass] / [length] / [time] ** 2",
        "canonical_unit": "Pa",
        "accepted_units": ["Pa", "MPa", "GPa"],
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "dureza",
        "name": "Dureza (Vickers)",
        "symbol": "HV",
        "category": PropertyCategory.MECANICA,
        "physical_dimension": "",  # HV is treated as dimensionless here
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "temp_max_servico",
        "name": "Temperatura máxima de serviço",
        "symbol": "Tmax",
        "category": PropertyCategory.TERMICA,
        "physical_dimension": "[temperature]",
        "canonical_unit": "kelvin",
        "accepted_units": ["kelvin", "degC"],
        "is_interval": False,
        "better_direction": BetterDirection.HIGHER,
    },
    {
        "slug": "condutividade_termica",
        "name": "Condutividade térmica",
        "symbol": "k",
        "category": PropertyCategory.TERMICA,
        "physical_dimension": "[mass] * [length] / [time] ** 3 / [temperature]",
        "canonical_unit": "W/(m*K)",
        "accepted_units": ["W/(m*K)"],
        "is_interval": False,
        "better_direction": BetterDirection.NEUTRAL,
    },
    {
        "slug": "custo_massa",
        "name": "Custo por massa",
        "symbol": "Cm",
        "category": PropertyCategory.ECONOMICA,
        "physical_dimension": "",  # currency per mass; treated as dimensionless proxy
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "is_interval": False,
        "better_direction": BetterDirection.LOWER,
    },
]

# --- Sources --------------------------------------------------------------
SOURCES = [
    {
        "label": "Dataset Demo MaterialSelect",
        "reference": DEMO_WARNING,
        "is_demo": True,
        "license_label": "Dado fictício de demonstração — não é conteúdo de terceiro",
    },
]

# --- Performance indices (classic Ashby merit indices) --------------------
# Expressions reference property slugs; the safe parser validates them.
PERFORMANCE_INDICES = [
    {
        "name": "Rigidez específica",
        "slug": "rigidez-especifica",
        "expression": "modulo_young / densidade",
        "goal": "maximize",
        "description": "Módulo de Young por unidade de massa (E/ρ).",
        "assumptions": {
            "funcao": "Componente sob rigidez",
            "geometria": "Livre",
            "objetivo": "Minimizar massa",
            "restricao": "Rigidez especificada",
            "referencia": "Ashby, Material Selection in Mechanical Design",
        },
    },
    {
        "name": "Resistência específica",
        "slug": "resistencia-especifica",
        "expression": "resistencia_tracao / densidade",
        "goal": "maximize",
        "description": "Resistência à tração por unidade de massa (σ/ρ).",
        "assumptions": {
            "funcao": "Tirante sob tração",
            "geometria": "Área livre",
            "objetivo": "Minimizar massa",
            "restricao": "Resistência especificada",
            "referencia": "Ashby, Material Selection in Mechanical Design",
        },
    },
    {
        "name": "Viga leve limitada por rigidez",
        "slug": "viga-leve-rigidez",
        "expression": "sqrt(modulo_young) / densidade",
        "goal": "maximize",
        "description": "Índice E^(1/2)/ρ para vigas leves e rígidas.",
        "assumptions": {
            "funcao": "Viga em flexão",
            "geometria": "Seção livre, comprimento fixo",
            "objetivo": "Minimizar massa",
            "restricao": "Rigidez à flexão especificada",
            "referencia": "Ashby, Material Selection in Mechanical Design",
        },
    },
    {
        "name": "Placa leve limitada por rigidez",
        "slug": "placa-leve-rigidez",
        "expression": "cbrt(modulo_young) / densidade",
        "goal": "maximize",
        "description": "Índice E^(1/3)/ρ para placas leves e rígidas.",
        "assumptions": {
            "funcao": "Placa em flexão",
            "geometria": "Espessura livre, área fixa",
            "objetivo": "Minimizar massa",
            "restricao": "Rigidez à flexão especificada",
            "referencia": "Ashby, Material Selection in Mechanical Design",
        },
    },
    {
        "name": "Componente leve limitado por escoamento",
        "slug": "componente-leve-escoamento",
        "expression": "limite_escoamento / densidade",
        "goal": "maximize",
        "description": "Limite de escoamento por unidade de massa (σy/ρ).",
        "assumptions": {
            "funcao": "Componente sob carga axial",
            "geometria": "Área livre",
            "objetivo": "Minimizar massa",
            "restricao": "Escoamento especificado",
            "referencia": "Ashby, Material Selection in Mechanical Design",
        },
    },
]


def _property_condition(measurement_condition: str | None = None) -> str | None:
    return measurement_condition


# Each material lists property values. Value builders convert to canonical units
# and record the conversion trail. A deliberately varied set exercises:
#   * unit conversion from a non-SI unit (g/cm**3, GPa, degC);
#   * an interval value (limite_escoamento on the polymer);
#   * an explicitly missing value (condutividade_termica on the ceramic);
#   * a value carrying uncertainty (custo_massa on the composite).
DEMO_MATERIALS = [
    {
        "name": "Liga Alumínio Demo A",
        "class_slug": "metais",
        "subclass": "Liga leve fictícia",
        "description": "Liga de alumínio sintética para demonstração.",
        "keywords": ["leve", "aeroespacial", "demo"],
        "values": [
            # densidade given in g/cm**3 -> converts to kg/m**3
            {
                "slug": "densidade",
                "kind": "scalar",
                "value": 2.70,
                "unit": "g/cm**3",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "modulo_young",
                "kind": "scalar",
                "value": 69.0,
                "unit": "GPa",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "limite_escoamento",
                "kind": "interval",
                "min": 240.0,
                "max": 300.0,
                "unit": "MPa",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "temp_max_servico",
                "kind": "scalar",
                "value": 150.0,
                "unit": "degC",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "custo_massa",
                "kind": "scalar",
                "value": 3.5,
                "unit": "dimensionless",
                "quality": DataQuality.ESTIMADO,
            },
        ],
    },
    {
        "name": "Aço Demo B",
        "class_slug": "metais",
        "subclass": "Aço estrutural fictício",
        "description": "Aço sintético de alta rigidez para demonstração.",
        "keywords": ["estrutural", "rígido", "demo"],
        "values": [
            {
                "slug": "densidade",
                "kind": "scalar",
                "value": 7850.0,
                "unit": "kg/m**3",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "modulo_young",
                "kind": "scalar",
                "value": 210.0,
                "unit": "GPa",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "resistencia_tracao",
                "kind": "scalar",
                "value": 500.0,
                "unit": "MPa",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "dureza",
                "kind": "scalar",
                "value": 200.0,
                "unit": "dimensionless",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "temp_max_servico",
                "kind": "scalar",
                "value": 450.0,
                "unit": "degC",
                "quality": DataQuality.ESTIMADO,
            },
        ],
    },
    {
        "name": "Polímero Demo C",
        "class_slug": "polimeros",
        "subclass": "Termoplástico fictício",
        "description": "Polímero sintético com faixa de escoamento para demonstração.",
        "keywords": ["leve", "isolante", "demo"],
        "values": [
            {
                "slug": "densidade",
                "kind": "scalar",
                "value": 1.05,
                "unit": "g/cm**3",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "modulo_young",
                "kind": "scalar",
                "value": 2.5,
                "unit": "GPa",
                "quality": DataQuality.ESTIMADO,
            },
            # interval value with explicit typical inside the range
            {
                "slug": "limite_escoamento",
                "kind": "interval",
                "min": 40.0,
                "max": 60.0,
                "typical": 48.0,
                "unit": "MPa",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "temp_max_servico",
                "kind": "scalar",
                "value": 90.0,
                "unit": "degC",
                "quality": DataQuality.ESTIMADO,
            },
        ],
    },
    {
        "name": "Cerâmica Demo D",
        "class_slug": "ceramicas",
        "subclass": "Óxido técnico fictício",
        "description": "Cerâmica sintética; condutividade térmica não disponível (demo de dado ausente).",
        "keywords": ["rígido", "refratário", "demo"],
        "values": [
            {
                "slug": "densidade",
                "kind": "scalar",
                "value": 3.9,
                "unit": "g/cm**3",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "modulo_young",
                "kind": "scalar",
                "value": 380.0,
                "unit": "GPa",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "dureza",
                "kind": "scalar",
                "value": 1500.0,
                "unit": "dimensionless",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "temp_max_servico",
                "kind": "scalar",
                "value": 1600.0,
                "unit": "degC",
                "quality": DataQuality.ESTIMADO,
            },
            # explicitly missing — must render as "ausente", never 0
            {
                "slug": "condutividade_termica",
                "kind": "missing",
                "notes": "Não disponível no dataset demo.",
            },
        ],
    },
    {
        "name": "Compósito Demo E",
        "class_slug": "compositos",
        "subclass": "Laminado fictício",
        "description": "Compósito sintético com custo incerto para demonstração.",
        "keywords": ["leve", "anisotrópico", "alto desempenho", "demo"],
        "values": [
            {
                "slug": "densidade",
                "kind": "scalar",
                "value": 1.6,
                "unit": "g/cm**3",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "modulo_young",
                "kind": "scalar",
                "value": 120.0,
                "unit": "GPa",
                "quality": DataQuality.ESTIMADO,
            },
            {
                "slug": "resistencia_tracao",
                "kind": "scalar",
                "value": 1500.0,
                "unit": "MPa",
                "quality": DataQuality.ESTIMADO,
            },
            # value carrying uncertainty
            {
                "slug": "custo_massa",
                "kind": "scalar",
                "value": 40.0,
                "unit": "dimensionless",
                "uncertainty": 8.0,
                "quality": DataQuality.ESTIMADO,
            },
        ],
    },
]


# --- Process universe (P0-2) ----------------------------------------------
#
# ⚠️  Também demonstrativo. Os nomes dos processos são vocabulário corrente de
# engenharia de manufatura (domínio público da metodologia de Ashby); o que é
# fictício é a **compatibilidade** afirmada abaixo, escolhida para exercitar a
# junção material↔processo e nada mais. Nenhum processo real deve ser escolhido
# a partir desta tabela.
#
# As três famílias são as raízes da taxonomia, e não uma coluna enum: é dado
# semeado, então um operador acrescenta família sem migração, e a pasta com
# descendentes do estágio de processo funciona sem uma linha de código nova.
PROCESS_CLASSES = [
    {"name": "Conformação", "slug": "conformacao", "parent": None},
    {
        "name": "Conformação em estado líquido",
        "slug": "conformacao-liquido",
        "parent": "conformacao",
    },
    {
        "name": "Conformação em estado sólido",
        "slug": "conformacao-solido",
        "parent": "conformacao",
    },
    {
        "name": "Conformação de particulados",
        "slug": "conformacao-particulados",
        "parent": "conformacao",
    },
    {"name": "Remoção de material", "slug": "remocao-material", "parent": "conformacao"},
    {"name": "União", "slug": "uniao", "parent": None},
    {"name": "Tratamento de superfície", "slug": "tratamento-superficie", "parent": None},
]

PROCESSES = [
    {
        "name": "Fundição em areia",
        "slug": "fundicao-areia",
        "class_slug": "conformacao-liquido",
        "description": "Metal líquido vazado em molde de areia aglomerada.",
    },
    {
        "name": "Moldagem por injeção",
        "slug": "moldagem-injecao",
        "class_slug": "conformacao-liquido",
        "description": "Polímero fundido injetado sob pressão em molde fechado.",
    },
    {
        "name": "Forjamento",
        "slug": "forjamento",
        "class_slug": "conformacao-solido",
        "description": "Deformação plástica por compressão entre matrizes.",
    },
    {
        "name": "Extrusão",
        "slug": "extrusao",
        "class_slug": "conformacao-solido",
        "description": "Material forçado através de uma matriz de seção constante.",
    },
    {
        "name": "Moldagem por compressão",
        "slug": "moldagem-compressao",
        "class_slug": "conformacao-solido",
        "description": "Carga prensada em molde aquecido até a cura.",
    },
    {
        "name": "Prensagem e sinterização",
        "slug": "prensagem-sinterizacao",
        "class_slug": "conformacao-particulados",
        "description": "Pó compactado e depois consolidado por tratamento térmico.",
    },
    {
        "name": "Usinagem convencional",
        "slug": "usinagem-convencional",
        "class_slug": "remocao-material",
        "description": "Remoção de cavaco por ferramenta de geometria definida.",
    },
    {
        "name": "Retificação",
        "slug": "retificacao",
        "class_slug": "remocao-material",
        "description": "Acabamento por abrasão com ferramenta de geometria não definida.",
    },
    {
        "name": "Solda MIG",
        "slug": "solda-mig",
        "class_slug": "uniao",
        "description": "União por fusão com eletrodo consumível e gás de proteção.",
    },
    {
        "name": "Adesivagem",
        "slug": "adesivagem",
        "class_slug": "uniao",
        "description": "União por adesivo estrutural, sem aporte térmico.",
    },
    {
        "name": "Parafusamento",
        "slug": "parafusamento",
        "class_slug": "uniao",
        "description": "União mecânica desmontável por elemento roscado.",
    },
    {
        "name": "Pintura",
        "slug": "pintura",
        "class_slug": "tratamento-superficie",
        "description": "Camada orgânica aplicada para proteção e acabamento.",
    },
    {
        "name": "Anodização",
        "slug": "anodizacao",
        "class_slug": "tratamento-superficie",
        "description": "Crescimento eletrolítico de óxido na superfície do metal.",
    },
]

# --- Process attributes (P0-4) --------------------------------------------
#
# The five attributes of the manual's exercise 11, step 2, in an open
# implementation: what a process can shape, how heavy, how thin, what it does to
# the material, and from what batch size it pays off.
#
# ⚠️  Every number and every label below is FICTITIOUS, exactly like the demo
# materials' property values, and lands with `DataQuality.ESTIMADO` under the
# demo source. They exist to exercise the two shapes of value the engine gained
# — a capability envelope and a discrete vocabulary — never to describe what a
# real foundry or press can do. No third party's dataset is reproduced here: the
# *questions* are the public methodology's, the answers are made up.
PROCESS_ATTRIBUTES = [
    {
        "slug": "faixa-massa",
        "name": "Faixa de massa",
        "symbol": "m",
        "kind": ProcessAttributeKind.ENVELOPE,
        "physical_dimension": "[mass]",
        "canonical_unit": "kg",
        "accepted_units": ["kg", "g", "t"],
        "better_direction": BetterDirection.NEUTRAL,
        "description": "Massa de peça que o processo consegue produzir.",
    },
    {
        "slug": "espessura-secao",
        "name": "Faixa de espessura de seção",
        "symbol": "t",
        "kind": ProcessAttributeKind.ENVELOPE,
        "physical_dimension": "[length]",
        "canonical_unit": "m",
        "accepted_units": ["m", "mm", "cm"],
        "better_direction": BetterDirection.NEUTRAL,
        "description": "Espessura de parede ou de seção que o processo alcança.",
    },
    {
        "slug": "lote-economico",
        "name": "Lote econômico mínimo",
        "symbol": "n",
        "kind": ProcessAttributeKind.ESCALAR,
        # A count has no dimension, and pretending otherwise would put it in a
        # unit system it does not belong to — same treatment `custo_massa` gets.
        "physical_dimension": "",
        "canonical_unit": "dimensionless",
        "accepted_units": ["dimensionless"],
        "better_direction": BetterDirection.LOWER,
        "description": "Número de peças a partir do qual o processo se paga.",
    },
    {
        "slug": "forma",
        "name": "Forma",
        "kind": ProcessAttributeKind.DISCRETO,
        "allowed_labels": [
            "Maciço 3D",
            "Oco 3D",
            "Chapa plana",
            "Chapa conformada",
            "Perfil de seção constante",
        ],
        "description": "Geometrias que o processo produz.",
    },
    {
        "slug": "caracteristica-processo",
        "name": "Característica do processo",
        "kind": ProcessAttributeKind.DISCRETO,
        "allowed_labels": [
            "Conformação primária",
            "Conformação secundária",
            "Remoção de material",
            "União",
            "Tratamento de superfície",
        ],
        "description": "O que o processo faz ao material.",
    },
]

#: Process slug → its attribute values. Fictitious, as the note above says.
#:
#: ``parafusamento`` and ``adesivagem`` deliberately carry **no** mass or
#: thickness envelope, and ``pintura`` carries an explicitly missing one: absence
#: is a state here as everywhere, and a limit stage over mass must reject all
#: three rather than wave them through — including the one whose row exists and
#: says nobody wrote the value down.
PROCESS_ATTRIBUTE_VALUES = {
    "fundicao-areia": [
        {"slug": "faixa-massa", "kind": "envelope", "min": 0.2, "max": 400.0, "unit": "kg"},
        {"slug": "espessura-secao", "kind": "envelope", "min": 3.0, "max": 120.0, "unit": "mm"},
        {"slug": "lote-economico", "kind": "scalar", "value": 20.0, "unit": "dimensionless"},
        {"slug": "forma", "kind": "labels", "labels": ["Maciço 3D", "Oco 3D"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["Conformação primária"]},
    ],
    "moldagem-injecao": [
        {"slug": "faixa-massa", "kind": "envelope", "min": 0.005, "max": 12.0, "unit": "kg"},
        {"slug": "espessura-secao", "kind": "envelope", "min": 0.6, "max": 9.0, "unit": "mm"},
        {"slug": "lote-economico", "kind": "scalar", "value": 8000.0, "unit": "dimensionless"},
        {"slug": "forma", "kind": "labels", "labels": ["Maciço 3D", "Oco 3D"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["Conformação primária"]},
    ],
    "forjamento": [
        {"slug": "faixa-massa", "kind": "envelope", "min": 0.1, "max": 90.0, "unit": "kg"},
        {"slug": "espessura-secao", "kind": "envelope", "min": 5.0, "max": 200.0, "unit": "mm"},
        {"slug": "lote-economico", "kind": "scalar", "value": 500.0, "unit": "dimensionless"},
        {"slug": "forma", "kind": "labels", "labels": ["Maciço 3D", "Chapa conformada"]},
        {
            "slug": "caracteristica-processo",
            "kind": "labels",
            "labels": ["Conformação secundária"],
        },
    ],
    "extrusao": [
        {"slug": "faixa-massa", "kind": "envelope", "min": 0.02, "max": 60.0, "unit": "kg"},
        {"slug": "espessura-secao", "kind": "envelope", "min": 1.0, "max": 40.0, "unit": "mm"},
        {"slug": "lote-economico", "kind": "scalar", "value": 1200.0, "unit": "dimensionless"},
        {"slug": "forma", "kind": "labels", "labels": ["Perfil de seção constante"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["Conformação primária"]},
    ],
    "moldagem-compressao": [
        {"slug": "faixa-massa", "kind": "envelope", "min": 0.05, "max": 25.0, "unit": "kg"},
        {"slug": "espessura-secao", "kind": "envelope", "min": 1.5, "max": 30.0, "unit": "mm"},
        {"slug": "lote-economico", "kind": "scalar", "value": 900.0, "unit": "dimensionless"},
        {"slug": "forma", "kind": "labels", "labels": ["Chapa conformada", "Maciço 3D"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["Conformação primária"]},
    ],
    "prensagem-sinterizacao": [
        {"slug": "faixa-massa", "kind": "envelope", "min": 0.001, "max": 4.0, "unit": "kg"},
        {"slug": "espessura-secao", "kind": "envelope", "min": 1.0, "max": 25.0, "unit": "mm"},
        {"slug": "lote-economico", "kind": "scalar", "value": 3000.0, "unit": "dimensionless"},
        {"slug": "forma", "kind": "labels", "labels": ["Maciço 3D"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["Conformação primária"]},
    ],
    "usinagem-convencional": [
        {"slug": "faixa-massa", "kind": "envelope", "min": 0.002, "max": 300.0, "unit": "kg"},
        {"slug": "espessura-secao", "kind": "envelope", "min": 0.5, "max": 500.0, "unit": "mm"},
        {"slug": "lote-economico", "kind": "scalar", "value": 1.0, "unit": "dimensionless"},
        {"slug": "forma", "kind": "labels", "labels": ["Maciço 3D", "Oco 3D", "Chapa plana"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["Remoção de material"]},
    ],
    "retificacao": [
        {"slug": "faixa-massa", "kind": "envelope", "min": 0.002, "max": 80.0, "unit": "kg"},
        {"slug": "espessura-secao", "kind": "envelope", "min": 0.5, "max": 300.0, "unit": "mm"},
        {"slug": "lote-economico", "kind": "scalar", "value": 1.0, "unit": "dimensionless"},
        {"slug": "forma", "kind": "labels", "labels": ["Maciço 3D", "Chapa plana"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["Remoção de material"]},
    ],
    "solda-mig": [
        {"slug": "espessura-secao", "kind": "envelope", "min": 1.0, "max": 40.0, "unit": "mm"},
        {"slug": "forma", "kind": "labels", "labels": ["Chapa plana", "Perfil de seção constante"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["União"]},
    ],
    "adesivagem": [
        {"slug": "espessura-secao", "kind": "envelope", "min": 0.2, "max": 20.0, "unit": "mm"},
        {"slug": "forma", "kind": "labels", "labels": ["Chapa plana", "Chapa conformada"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["União"]},
    ],
    "parafusamento": [
        {"slug": "forma", "kind": "labels", "labels": ["Chapa plana", "Maciço 3D"]},
        {"slug": "caracteristica-processo", "kind": "labels", "labels": ["União"]},
    ],
    "pintura": [
        # The row exists and says the value was never established — a different
        # state from having no row, and both must read as "not selectable on".
        {"slug": "faixa-massa", "kind": "missing"},
        {
            "slug": "caracteristica-processo",
            "kind": "labels",
            "labels": ["Tratamento de superfície"],
        },
    ],
    "anodizacao": [
        {
            "slug": "caracteristica-processo",
            "kind": "labels",
            "labels": ["Tratamento de superfície"],
        },
    ],
}

#: Material name → the processes it is declared compatible with. Fictitious, as
#: the note above says. "Cerâmica Demo D" has no joining process on purpose:
#: absence is a state here too, and a process stage must reject a material
#: rather than wave it through for lack of data.
MATERIAL_PROCESS_LINKS = {
    "Liga Alumínio Demo A": [
        "fundicao-areia",
        "extrusao",
        "forjamento",
        "usinagem-convencional",
        "solda-mig",
        "anodizacao",
    ],
    "Aço Demo B": [
        "fundicao-areia",
        "forjamento",
        "usinagem-convencional",
        "solda-mig",
        "parafusamento",
        "pintura",
    ],
    "Polímero Demo C": ["moldagem-injecao", "extrusao", "adesivagem", "pintura"],
    "Cerâmica Demo D": ["prensagem-sinterizacao", "retificacao"],
    "Compósito Demo E": ["moldagem-compressao", "usinagem-convencional", "adesivagem", "pintura"],
}


def _get_or_create_class(db: Session, name: str, slug: str) -> MaterialClass:
    existing = (
        db.execute(select(MaterialClass).where(MaterialClass.slug == slug)).scalars().one_or_none()
    )
    if existing:
        return existing
    obj = MaterialClass(name=name, slug=slug)
    db.add(obj)
    db.flush()
    return obj


def _get_or_create_process_class(db: Session, spec: dict, parent_id: int | None) -> ProcessClass:
    existing = (
        db.execute(select(ProcessClass).where(ProcessClass.slug == spec["slug"]))
        .scalars()
        .one_or_none()
    )
    if existing:
        return existing
    obj = ProcessClass(name=spec["name"], slug=spec["slug"], parent_id=parent_id)
    db.add(obj)
    db.flush()
    return obj


def _get_or_create_process(db: Session, spec: dict, class_id: int) -> Process:
    existing = (
        db.execute(select(Process).where(Process.slug == spec["slug"])).scalars().one_or_none()
    )
    if existing:
        return existing
    obj = Process(
        name=spec["name"],
        slug=spec["slug"],
        class_id=class_id,
        description=spec.get("description"),
        is_demo=True,
    )
    db.add(obj)
    db.flush()
    return obj


def _seed_process_universe(db: Session) -> dict[str, int]:
    """The demo process universe and its links to the demo materials.

    Idempotent like the rest of the seed, link rows included: the composite
    primary key means a repeated run would raise instead of duplicating, so each
    pair is checked before it is inserted.
    """
    class_by_slug: dict[str, ProcessClass] = {}
    # Parents first — the list is ordered so a parent is always already present.
    for spec in PROCESS_CLASSES:
        parent = class_by_slug.get(spec["parent"]) if spec["parent"] else None
        class_by_slug[spec["slug"]] = _get_or_create_process_class(
            db, spec, parent.id if parent else None
        )

    process_by_slug: dict[str, Process] = {}
    for spec in PROCESSES:
        process_by_slug[spec["slug"]] = _get_or_create_process(
            db, spec, class_by_slug[spec["class_slug"]].id
        )
    db.flush()

    links_created = 0
    for material_name, process_slugs in MATERIAL_PROCESS_LINKS.items():
        material = (
            db.execute(select(Material).where(Material.name == material_name))
            .scalars()
            .one_or_none()
        )
        if material is None:  # pragma: no cover - only if a demo material is renamed
            continue
        for slug in process_slugs:
            process = process_by_slug[slug]
            already = db.execute(
                select(MaterialProcess).where(
                    MaterialProcess.material_id == material.id,
                    MaterialProcess.process_id == process.id,
                )
            ).one_or_none()
            if already:
                continue
            db.add(MaterialProcess(material_id=material.id, process_id=process.id))
            links_created += 1
    db.flush()

    attributes_created = _seed_process_attributes(db, process_by_slug)
    return {
        "process_classes": len(PROCESS_CLASSES),
        "processes": len(PROCESSES),
        "material_process_links": links_created,
        "process_attributes": len(PROCESS_ATTRIBUTES),
        "process_attribute_values": attributes_created,
    }


def _seed_process_attributes(db: Session, process_by_slug: dict[str, Process]) -> int:
    """The attribute catalogue and its demonstration values (P0-4).

    Idempotent for the reason the pair is unique in the database: a repeated run
    would raise on the second insert rather than duplicate, so each (process,
    attribute) pair is checked before it is written.
    """
    source = _get_or_create_source(db, SOURCES[0])
    attribute_by_slug = {
        spec["slug"]: _get_or_create_process_attribute(db, spec) for spec in PROCESS_ATTRIBUTES
    }
    db.flush()

    created = 0
    for process_slug, value_specs in PROCESS_ATTRIBUTE_VALUES.items():
        process = process_by_slug[process_slug]
        for spec in value_specs:
            attribute = attribute_by_slug[spec["slug"]]
            already = db.execute(
                select(ProcessAttributeValue).where(
                    ProcessAttributeValue.process_id == process.id,
                    ProcessAttributeValue.attribute_id == attribute.id,
                )
            ).one_or_none()
            if already:
                continue
            row = _build_attribute_value_row(spec, attribute, source)
            row.process_id = process.id
            db.add(row)
            created += 1
    db.flush()
    return created


def _get_or_create_process_attribute(db: Session, spec: dict) -> ProcessAttributeDefinition:
    existing = (
        db.execute(
            select(ProcessAttributeDefinition).where(
                ProcessAttributeDefinition.slug == spec["slug"]
            )
        )
        .scalars()
        .one_or_none()
    )
    if existing:
        return existing
    obj = ProcessAttributeDefinition(
        slug=spec["slug"],
        name=spec["name"],
        symbol=spec.get("symbol"),
        description=spec.get("description"),
        kind=spec["kind"],
        physical_dimension=spec.get("physical_dimension", ""),
        # NULL exactly for a discrete attribute — the table's own check
        # constraint enforces it, so a typo here fails loudly at seed time
        # instead of producing a definition the engine cannot read.
        canonical_unit=spec.get("canonical_unit"),
        accepted_units=spec.get("accepted_units", []),
        allowed_labels=spec.get("allowed_labels", []),
        better_direction=spec.get("better_direction", BetterDirection.NEUTRAL),
    )
    db.add(obj)
    db.flush()
    return obj


def _build_attribute_value_row(
    spec: dict,
    attribute: ProcessAttributeDefinition,
    source: Source,
) -> ProcessAttributeValue:
    """One ProcessAttributeValue from a seed spec, through the domain builders.

    The numeric shapes go through `app.domain.data_quality` exactly as a material
    property value does — same conversion, same trail — which is the whole reason
    those builders were reused instead of copied. The envelope is the only one
    that also stores the converted **bounds**: in a capability range they are the
    criterion, and the typical is merely representative.
    """
    kind = spec["kind"]
    labels: list[str] = []
    if kind == "missing":
        nv = missing_value()
    elif kind == "labels":
        nv = missing_value()
        labels = list(spec["labels"])
    elif kind == "scalar":
        nv = build_scalar_value(spec["value"], spec["unit"], attribute.canonical_unit)
    elif kind == "envelope":
        nv = build_interval_value(
            spec["min"],
            spec["max"],
            spec["unit"],
            attribute.canonical_unit,
            value_typical=spec.get("typical"),
        )
    else:  # pragma: no cover - guarded by seed authoring
        raise ValueError(f"Tipo de valor desconhecido no seed: {kind!r}")

    return ProcessAttributeValue(
        attribute_id=attribute.id,
        value_scalar=nv.value_scalar,
        value_min=nv.value_min,
        value_max=nv.value_max,
        value_typical=nv.value_typical,
        labels=labels,
        original_unit=nv.original_unit,
        normalized_value=nv.normalized_value,
        normalized_min=nv.normalized_min,
        normalized_max=nv.normalized_max,
        canonical_unit=nv.canonical_unit,
        conversion_method=nv.conversion_method,
        notes=spec.get("notes"),
        source_id=source.id,
        data_quality=spec.get("quality", DataQuality.ESTIMADO),
        # A discrete value is *present* — it holds labels — so it is not missing,
        # even though it has no number. `missing_value()` above is only how the
        # numeric fields get their NULLs without inventing a zero.
        is_missing=nv.is_missing and kind != "labels",
    )


def _get_or_create_property(db: Session, spec: dict) -> PropertyDefinition:
    existing = (
        db.execute(select(PropertyDefinition).where(PropertyDefinition.slug == spec["slug"]))
        .scalars()
        .one_or_none()
    )
    if existing:
        return existing
    obj = PropertyDefinition(
        slug=spec["slug"],
        name=spec["name"],
        symbol=spec.get("symbol"),
        category=spec["category"],
        physical_dimension=spec.get("physical_dimension", ""),
        canonical_unit=spec["canonical_unit"],
        accepted_units=spec.get("accepted_units", []),
        is_interval=spec.get("is_interval", False),
        better_direction=spec.get("better_direction", BetterDirection.NEUTRAL),
        allows_log_scale=spec.get("allows_log_scale", True),
    )
    db.add(obj)
    db.flush()
    return obj


def _get_or_create_source(db: Session, spec: dict) -> Source:
    existing = (
        db.execute(select(Source).where(Source.label == spec["label"])).scalars().one_or_none()
    )
    if existing:
        return existing
    obj = Source(
        label=spec["label"],
        reference=spec.get("reference"),
        is_demo=spec.get("is_demo", False),
        license_label=spec.get("license_label"),
    )
    db.add(obj)
    db.flush()
    return obj


def _build_value_row(
    spec: dict,
    prop: PropertyDefinition,
    source: Source,
) -> MaterialPropertyValue:
    """Construct a MaterialPropertyValue from a seed spec via domain builders."""
    kind = spec["kind"]
    if kind == "missing":
        nv = missing_value()
    elif kind == "scalar":
        nv = build_scalar_value(spec["value"], spec["unit"], prop.canonical_unit)
    elif kind == "interval":
        nv = build_interval_value(
            spec["min"],
            spec["max"],
            spec["unit"],
            prop.canonical_unit,
            value_typical=spec.get("typical"),
        )
    else:  # pragma: no cover - guarded by seed authoring
        raise ValueError(f"Tipo de valor desconhecido no seed: {kind!r}")

    return MaterialPropertyValue(
        property_id=prop.id,
        value_scalar=nv.value_scalar,
        value_min=nv.value_min,
        value_max=nv.value_max,
        value_typical=nv.value_typical,
        original_unit=nv.original_unit,
        normalized_value=nv.normalized_value,
        canonical_unit=nv.canonical_unit,
        conversion_method=nv.conversion_method,
        uncertainty=spec.get("uncertainty"),
        measurement_condition=spec.get("measurement_condition"),
        notes=spec.get("notes"),
        source_id=source.id,
        data_quality=spec.get("quality", DataQuality.ESTIMADO),
        is_missing=nv.is_missing,
    )


def _get_or_create_index(db: Session, spec: dict) -> PerformanceIndex:
    existing = (
        db.execute(select(PerformanceIndex).where(PerformanceIndex.slug == spec["slug"]))
        .scalars()
        .one_or_none()
    )
    if existing:
        return existing
    obj = PerformanceIndex(
        name=spec["name"],
        slug=spec["slug"],
        expression=spec["expression"],
        goal=spec.get("goal", "maximize"),
        description=spec.get("description"),
        assumptions=spec.get("assumptions"),
        is_demo=True,
    )
    db.add(obj)
    db.flush()
    return obj


def seed(db: Session) -> dict[str, int]:
    """Populate taxonomy, properties, sources, indices and demo materials.

    Idempotent. Returns a small summary dict for logging/tests.
    """
    for spec in CLASSES:
        _get_or_create_class(db, spec["name"], spec["slug"])
    for spec in PROPERTIES:
        _get_or_create_property(db, spec)
    demo_source = None
    for spec in SOURCES:
        demo_source = _get_or_create_source(db, spec)
    for spec in PERFORMANCE_INDICES:
        _get_or_create_index(db, spec)
    db.flush()

    prop_by_slug = {p.slug: p for p in db.execute(select(PropertyDefinition)).scalars().all()}

    created_materials = 0
    material_repo = MaterialRepository(db)
    for mat_spec in DEMO_MATERIALS:
        existing = (
            db.execute(select(Material).where(Material.name == mat_spec["name"]))
            .scalars()
            .one_or_none()
        )
        if existing:
            continue
        material_class = _get_or_create_class(
            db, mat_spec["class_slug"].title(), mat_spec["class_slug"]
        )
        material = Material(
            name=mat_spec["name"],
            class_id=material_class.id,
            subclass=mat_spec.get("subclass"),
            description=mat_spec.get("description"),
            keywords=mat_spec.get("keywords", []),
            is_demo=True,
        )
        db.add(material)
        db.flush()
        for value_spec in mat_spec["values"]:
            prop = prop_by_slug[value_spec["slug"]]
            row = _build_value_row(value_spec, prop, demo_source)
            row.material_id = material.id
            db.add(row)
        material_repo.sync_keywords(material.id, mat_spec.get("keywords", []))
        created_materials += 1

    # After the materials: the links need them to exist (P0-2).
    process_summary = _seed_process_universe(db)

    db.commit()
    return {
        "classes": len(CLASSES),
        "properties": len(PROPERTIES),
        "indices": len(PERFORMANCE_INDICES),
        "materials_created": created_materials,
        **process_summary,
    }


def seed_e2e_session(db: Session) -> None:
    """Write a fixed logged-in, subscribed session for the Playwright suite.

    Only runs when ``ENVIRONMENT=development`` *and* ``E2E_SESSION_TOKEN`` is
    set — never in production, and a no-op for a developer running
    ``python -m app.db.seed`` locally without that variable. Login is
    Google-only (A5) and CI has no OAuth client to run a real flow with;
    ``playwright.config.ts`` passes this token to the API process, and
    ``e2e/session.ts`` injects it straight into the browser as the
    ``msai_session`` cookie, skipping Google entirely without exposing any
    bypass route from the API itself.

    The active ``Subscription`` written alongside the session exists for the
    same reason and under the same guard: since every router but ``/health``,
    ``/auth`` and ``/billing`` now requires one, a logged-in-but-unsubscribed
    fixture user would land on ``/assinatura`` and 403 on every API call the
    specs make. Stripe is never contacted here — the gate reads the local
    ``status`` column, so fictitious ids are enough.
    """
    token = os.environ.get("E2E_SESSION_TOKEN")
    if not token or settings.environment != "development":
        return

    user = (
        db.execute(select(User).where(User.google_sub == E2E_USER_GOOGLE_SUB))
        .scalars()
        .one_or_none()
    )
    if user is None:
        user = User(
            google_sub=E2E_USER_GOOGLE_SUB,
            email="e2e@example.com",
            name="Usuária E2E",
        )
        db.add(user)
        db.flush()
        db.add(Project(name="Meu projeto", owner_id=user.id))

    if db.get(UserSession, token) is None:
        db.add(
            UserSession(
                id=token,
                user_id=user.id,
                expires_at=datetime.now(UTC) + timedelta(hours=settings.session_ttl_hours),
            )
        )

    subscriptions = SubscriptionRepository(db)
    if subscriptions.get_by_user_id(user.id) is None:
        subscriptions.create(
            user_id=user.id,
            stripe_customer_id=E2E_STRIPE_CUSTOMER_ID,
            stripe_subscription_id=E2E_STRIPE_SUBSCRIPTION_ID,
            status="active",
        )
    db.commit()


def main() -> None:
    """CLI entry point: create tables if missing, then seed."""
    # create_all is a convenience for the SQLite dev flow; migrations remain the
    # source of truth (see alembic/).
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        summary = seed(db)
        seed_e2e_session(db)
    print(f"[seed] {DEMO_WARNING}")
    print(f"[seed] Concluído: {summary}")


if __name__ == "__main__":
    main()
