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
from app.models.enums import BetterDirection, DataQuality, PropertyCategory
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.performance_index import PerformanceIndex
from app.models.project import Project
from app.models.property_definition import PropertyDefinition
from app.models.source import Source
from app.models.user import User, UserSession
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
    {"label": "Dataset Demo MaterialSelect", "reference": DEMO_WARNING, "is_demo": True},
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
        label=spec["label"], reference=spec.get("reference"), is_demo=spec.get("is_demo", False)
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
        created_materials += 1

    db.commit()
    return {
        "classes": len(CLASSES),
        "properties": len(PROPERTIES),
        "indices": len(PERFORMANCE_INDICES),
        "materials_created": created_materials,
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
