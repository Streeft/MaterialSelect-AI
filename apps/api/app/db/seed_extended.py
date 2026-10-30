"""Materiais fictícios estendidos para teste abrangente da plataforma.

70 materiais adicionais distribuídos nas cinco famílias, exercitando
todas as 12 propriedades (15 com as três do cartão CAE, D-124), conversões de unidade, intervalos e incerteza.

Executar com::

    python -m app.db.seed_extended

Idempotente: não duplica registros em execuções repetidas.
Pode ser executado antes ou depois do seed principal (python -m app.db.seed).
O seed principal (5 materiais) permanece inalterado para não quebrar os testes.

Depois dos materiais, o mesmo comando dá a **todos** os 75 materiais demo
(os 5 do seed principal e estes 70) designações, composição química e curvas
fictícias, marcadas ``is_demo`` (``app.db.seed_extended_identity``, D-107). O
log conta ``designations_created``, ``composition_entries_created`` e
``curves_created``, e liga cinco grupos de equivalência declarada fictícios
(``app.db.seed_demo_equivalences``, D-115; log ``equivalence_groups_created``);
e escreve os três valores fictícios do cartão CAE — ν, α e cp — em cada
material demo (``app.db.seed_demo_cae``, D-124; log ``cae_values_created``).
``python -m app.db.demo_coverage`` lista o que cada material
tem e o que falta.

Catálogo demo ampliado do TCC (D-185): o mesmo comando escreve também os 593
materiais fictícios dos nove lotes JSON de ``app/db/demo_catalog/`` (lista
separada ``TCC_DEMO_MATERIALS``, função :func:`seed_demo_catalog_expansion`),
pelo mesmo escritor dos 70 — com designação, composição, curvas e processos —
sem mexer nas contagens fixas que a suíte tem dos 75. Log:
``tcc_materials_created`` e companhia. ``clear_demo`` apaga tudo por
``is_demo``, como o resto do demo.
"""

from __future__ import annotations

import random

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import Base, SessionLocal, engine
from app.db.demo_catalog import load_lots
from app.db.demo_identity_data import designation_table, parse_composition, parse_designation
from app.db.link_demo_processes import link_demo_processes
from app.db.seed import (
    DEMO_DESIGNATIONS,
    DEMO_MATERIALS,
    _seed_demo_curves,
    _seed_demo_identity,
)
from app.db.seed_demo_cae import seed_demo_cae_values
from app.db.seed_demo_equivalences import seed_demo_equivalences
from app.db.seed_demo_ordinal import seed_demo_ordinals
from app.db.seed_demo_releases import DEMO_RELEASES, seed_demo_releases
from app.db.seed_extended_identity import build_curve_specs, seed_extended_identity
from app.domain.data_quality import (
    build_interval_value,
    build_scalar_value,
    missing_value,
)
from app.models.enums import DataQuality
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source
from app.repositories.material_repository import MaterialRepository


def _generate_materials() -> list[dict]:
    """Gera 70 materiais fictícios distribuídos nas 5 famílias.

    A semente fixa (42) garante reprodutibilidade: dois runs produzem
    exatamente os mesmos números, sem aleatoriedade entre teste e CI.
    """
    metais_names = [
        ("Liga de Alumínio 6061-T6", "Ligas Leves"),
        ("Aço Carbono 1045", "Aços"),
        ("Aço Inoxidável 316L", "Aços"),
        ("Aço Ferramenta D2", "Aços"),
        ("Bronze Fosforoso", "Ligas de Cobre"),
        ("Latão Cartucho 70/30", "Ligas de Cobre"),
        ("Liga de Titânio Ti-6Al-4V", "Ligas de Titânio"),
        ("Superliga Inconel 718", "Superligas"),
        ("Liga de Magnésio AZ31B", "Ligas Leves"),
        ("Zamak 3", "Ligas de Zinco"),
        ("Tungstênio Puro", "Metais Refratários"),
        ("Ferro Fundido Cinzento FC250", "Ferros Fundidos"),
        ("Ferro Fundido Nodular FE500", "Ferros Fundidos"),
        ("Cobre Eletrolítico (ETP)", "Metais Puros"),
        ("Aço Inoxidável Martensítico 420", "Aços"),
        ("Aço Estrutural A36", "Aços"),
        ("Aço Maraging 250", "Aços"),
        ("Liga de Alumínio 7075-T6", "Ligas Leves"),
        ("Ouro 18K", "Metais Preciosos"),
        ("Prata de Lei", "Metais Preciosos"),
    ]
    polimeros_names = [
        ("Polietileno de Alta Densidade (PEAD)", "Termoplásticos"),
        ("Polipropileno (PP)", "Termoplásticos"),
        ("Policloreto de Vinila (PVC)", "Termoplásticos"),
        ("Poliestireno (PS)", "Termoplásticos"),
        ("Acrilonitrila Butadieno Estireno (ABS)", "Termoplásticos"),
        ("Policarbonato (PC)", "Termoplásticos"),
        ("Poli(metacrilato de metila) (PMMA)", "Termoplásticos"),
        ("Poliamida 6 (Nylon 6)", "Termoplásticos de Engenharia"),
        ("Poli(tereftalato de etileno) (PET)", "Termoplásticos"),
        ("Politetrafluoretileno (PTFE)", "Termoplásticos Especiais"),
        ("Poliacetal (POM)", "Termoplásticos de Engenharia"),
        ("Resina Epóxi Padrão", "Termofixos"),
        ("Resina Fenólica", "Termofixos"),
        ("Poliéster Insaturado", "Termofixos"),
        ("Poli-éter-éter-cetona (PEEK)", "Termoplásticos de Alta Performance"),
        ("Polieterimida (PEI)", "Termoplásticos de Alta Performance"),
        ("Polissulfona (PSU)", "Termoplásticos de Alta Performance"),
        ("Poliamida 66 (Nylon 66)", "Termoplásticos de Engenharia"),
    ]
    ceramicas_names = [
        ("Alumina (Al2O3) 99%", "Cerâmicas Técnicas"),
        ("Zircônia Estabilizada com Ítrio (YSZ)", "Cerâmicas Técnicas"),
        ("Carbeto de Silício (SiC)", "Cerâmicas Técnicas"),
        ("Nitreto de Silício (Si3N4)", "Cerâmicas Técnicas"),
        ("Carbeto de Tungstênio (WC)", "Cerâmicas Técnicas"),
        ("Vidro Borossilicato", "Vidros"),
        ("Vidro Soda-Cal", "Vidros"),
        ("Porcelana Elétrica", "Cerâmicas Tradicionais"),
        ("Mulita", "Cerâmicas Técnicas"),
        ("Cordierita", "Cerâmicas Técnicas"),
        ("Cerâmica Piezoelétrica (PZT)", "Cerâmicas Especiais"),
        ("Sialon", "Cerâmicas Técnicas"),
    ]
    compositos_names = [
        ("CFRP (Fibras de Carbono Contínuas)", "Compósitos Poliméricos"),
        ("GFRP (Fibras de Vidro-E)", "Compósitos Poliméricos"),
        ("Compósito Aramida (Kevlar) / Epóxi", "Compósitos Poliméricos"),
        ("Compósito de Boro / Alumínio", "Compósitos de Matriz Metálica"),
        ("Concreto Armado Padrão", "Compósitos Estruturais"),
        ("Madeira Compensada (Pinho)", "Compósitos Naturais"),
        ("Cermet (WC-Co)", "Compósitos Metal-Cerâmica"),
        ("Compósito Carbono-Carbono (C/C)", "Compósitos Especiais"),
        ("Compósito Basalto / Epóxi", "Compósitos Poliméricos"),
        ("Compósito de Vidro-S / Epóxi", "Compósitos Poliméricos"),
        ("Compósito Linho / Resina Bio", "Compósitos Verdes"),
        ("Compósito Matriz Cerâmica (SiC/SiC)", "Compósitos de Matriz Cerâmica"),
    ]
    elastomeros_names = [
        ("Borracha Natural (NR)", "Borrachas Naturais"),
        ("Silicone (VMQ)", "Elastômeros Especiais"),
        ("Neoprene (CR)", "Borrachas Sintéticas"),
        ("Borracha Nitrílica (NBR)", "Borrachas Sintéticas"),
        ("EPDM", "Borrachas Sintéticas"),
        ("Poliuretano Termoplástico (TPU)", "Elastômeros Termoplásticos"),
        ("Fluorelastômero (FKM)", "Elastômeros Especiais"),
        ("Borracha Estireno-Butadieno (SBR)", "Borrachas Sintéticas"),
    ]

    # Faixas de propriedades plausíveis por família
    _RANGES: dict[str, list[tuple[str, float, float, str]]] = {
        "metais": [
            ("densidade", 1800, 19000, "kg/m**3"),
            ("modulo_young", 40e9, 400e9, "Pa"),
            ("limite_escoamento", 30e6, 2000e6, "Pa"),
            ("resistencia_tracao", 100e6, 2500e6, "Pa"),
            ("dureza", 50, 800, "dimensionless"),
            ("temp_max_servico", 373, 1773, "kelvin"),
            ("condutividade_termica", 10, 400, "W/(m*K)"),
            ("custo_massa", 1, 100, "dimensionless"),
            ("energia_incorporada", 30, 300, "MJ/kg"),
            ("pegada_co2", 1, 20, "dimensionless"),
            ("energia_reciclagem", 5, 50, "MJ/kg"),
            ("co2_reciclagem", 0.1, 5, "dimensionless"),
        ],
        "polimeros": [
            ("densidade", 900, 1600, "kg/m**3"),
            ("modulo_young", 0.5e9, 8e9, "Pa"),
            ("limite_escoamento", 10e6, 120e6, "Pa"),
            ("resistencia_tracao", 20e6, 200e6, "Pa"),
            ("dureza", 5, 30, "dimensionless"),
            ("temp_max_servico", 323, 573, "kelvin"),
            ("condutividade_termica", 0.1, 0.5, "W/(m*K)"),
            ("custo_massa", 1, 50, "dimensionless"),
            ("energia_incorporada", 60, 200, "MJ/kg"),
            ("pegada_co2", 2, 10, "dimensionless"),
            ("energia_reciclagem", 10, 40, "MJ/kg"),
            ("co2_reciclagem", 0.5, 3, "dimensionless"),
        ],
        "ceramicas": [
            ("densidade", 2000, 6000, "kg/m**3"),
            ("modulo_young", 50e9, 500e9, "Pa"),
            ("limite_escoamento", 100e6, 5000e6, "Pa"),
            ("resistencia_tracao", 20e6, 500e6, "Pa"),
            ("dureza", 500, 3000, "dimensionless"),
            ("temp_max_servico", 773, 2773, "kelvin"),
            ("condutividade_termica", 1, 30, "W/(m*K)"),
            ("custo_massa", 5, 200, "dimensionless"),
            ("energia_incorporada", 10, 50, "MJ/kg"),
            ("pegada_co2", 0.5, 5, "dimensionless"),
            ("energia_reciclagem", 5, 20, "MJ/kg"),
            ("co2_reciclagem", 0.2, 1.5, "dimensionless"),
        ],
        "compositos": [
            ("densidade", 1200, 2200, "kg/m**3"),
            ("modulo_young", 10e9, 300e9, "Pa"),
            ("limite_escoamento", 100e6, 1500e6, "Pa"),
            ("resistencia_tracao", 200e6, 2500e6, "Pa"),
            ("dureza", 10, 100, "dimensionless"),
            ("temp_max_servico", 373, 673, "kelvin"),
            ("condutividade_termica", 0.5, 50, "W/(m*K)"),
            ("custo_massa", 20, 500, "dimensionless"),
            ("energia_incorporada", 100, 400, "MJ/kg"),
            ("pegada_co2", 5, 30, "dimensionless"),
            ("energia_reciclagem", 50, 150, "MJ/kg"),
            ("co2_reciclagem", 2, 10, "dimensionless"),
        ],
        "elastomeros": [
            ("densidade", 900, 2300, "kg/m**3"),
            ("modulo_young", 0.001e9, 0.1e9, "Pa"),
            ("limite_escoamento", 1e6, 30e6, "Pa"),
            ("resistencia_tracao", 5e6, 50e6, "Pa"),
            ("dureza", 1, 10, "dimensionless"),
            ("temp_max_servico", 233, 523, "kelvin"),
            ("condutividade_termica", 0.1, 0.4, "W/(m*K)"),
            ("custo_massa", 2, 30, "dimensionless"),
            ("energia_incorporada", 50, 150, "MJ/kg"),
            ("pegada_co2", 2, 8, "dimensionless"),
            ("energia_reciclagem", 10, 30, "MJ/kg"),
            ("co2_reciclagem", 0.5, 2, "dimensionless"),
        ],
    }

    classes = [
        ("metais", metais_names),
        ("polimeros", polimeros_names),
        ("ceramicas", ceramicas_names),
        ("compositos", compositos_names),
        ("elastomeros", elastomeros_names),
    ]

    rng = random.Random(42)
    materials: list[dict] = []

    non_canon_count = 0
    uncertain_count = 0
    meas_cond_count = 0

    for class_slug, items in classes:
        props = _RANGES[class_slug]
        for name, subclass in items:
            desc = f"Material simulado ({name}) da classe {class_slug} para testes."
            mat: dict = {
                "name": name,
                "class_slug": class_slug,
                "subclass": subclass,
                "description": desc,
                "keywords": [
                    class_slug,
                    subclass.lower().replace(" ", "_"),
                    "demo",
                    "simulado",
                ],
                "values": [],
            }

            for slug, vmin, vmax, unit in props:
                val_min = vmin + rng.random() * (vmax - vmin) * 0.8
                val_max = val_min + rng.random() * (vmax - val_min) * 0.2
                val_scalar = (val_min + val_max) / 2.0

                # ~30% de chance de usar unidade não canônica (máximo 20)
                use_non_canonical = False
                if non_canon_count < 20 and rng.random() < 0.3:
                    if unit == "kg/m**3":
                        val_min /= 1000
                        val_max /= 1000
                        val_scalar /= 1000
                        unit = "g/cm**3"
                        use_non_canonical = True
                    elif unit == "Pa" and val_scalar > 1e9:
                        val_min /= 1e9
                        val_max /= 1e9
                        val_scalar /= 1e9
                        unit = "GPa"
                        use_non_canonical = True
                    elif unit == "Pa" and val_scalar > 1e6:
                        val_min /= 1e6
                        val_max /= 1e6
                        val_scalar /= 1e6
                        unit = "MPa"
                        use_non_canonical = True
                    elif unit == "kelvin":
                        val_min -= 273.15
                        val_max -= 273.15
                        val_scalar -= 273.15
                        unit = "degC"
                        use_non_canonical = True
                    elif unit == "MJ/kg":
                        val_min *= 1000
                        val_max *= 1000
                        val_scalar *= 1000
                        unit = "kJ/kg"
                        use_non_canonical = True
                    if use_non_canonical:
                        non_canon_count += 1

                entry: dict = {
                    "slug": slug,
                    "quality": DataQuality.ESTIMADO,
                }

                if slug == "limite_escoamento":
                    entry["kind"] = "interval"
                    entry["min"] = round(val_min, 3)
                    entry["max"] = round(val_max, 3)
                    if rng.random() > 0.5:
                        entry["typical"] = round(val_scalar, 3)
                    entry["unit"] = unit
                else:
                    entry["kind"] = "scalar"
                    entry["value"] = round(val_scalar, 3)
                    entry["unit"] = unit

                # ~15% de chance de incerteza (máximo 15)
                if uncertain_count < 15 and rng.random() < 0.15 and slug != "limite_escoamento":
                    entry["uncertainty"] = round(val_scalar * 0.05, 3)
                    uncertain_count += 1

                # ~15% de chance de condição de medição (máximo 10)
                if (
                    meas_cond_count < 10
                    and rng.random() < 0.15
                    and slug in ("densidade", "modulo_young")
                ):
                    entry["measurement_condition"] = "Temperatura ambiente (25 °C)"
                    meas_cond_count += 1

                mat["values"].append(entry)

            materials.append(mat)

    return materials


EXTENDED_DEMO_MATERIALS: list[dict] = _generate_materials()

DEMO_SOURCE_LABEL = "Dataset Demo MaterialSelect"


def _reserved_demo_names() -> list[str]:
    """Names the enlarged catalogue may not reuse: the 5, the 70 and the releases."""
    releases = [record.name for release in DEMO_RELEASES for record in release.records]
    return [
        *(m["name"] for m in DEMO_MATERIALS),
        *(m["name"] for m in EXTENDED_DEMO_MATERIALS),
        *releases,
    ]


def _reserved_demo_codes() -> list[str]:
    """Designation codes the 75 already carry (one code, one demo material)."""
    tables = [*designation_table().values(), *DEMO_DESIGNATIONS.values()]
    return [spec["code"] for specs in tables for spec in specs]


#: The enlarged demo catalogue of the TCC (D-185): 593 fictitious materials in
#: nine JSON lots, validated on load — a lot that breaks a rule stops the import
#: with the list of violations instead of seeding part of it in silence. A list
#: of its own, not appended to ``EXTENDED_DEMO_MATERIALS``: the suite holds fixed
#: counts of the 75 (D-71, D-107) that this catalogue must not move.
TCC_DEMO_MATERIALS: list[dict] = load_lots(
    reserved_names=_reserved_demo_names(), reserved_codes=_reserved_demo_codes()
)


def _get_or_create_class(
    db: Session,
    name: str,
    slug: str,
) -> MaterialClass:
    """Reutiliza ou cria uma MaterialClass pelo slug."""
    existing = (
        db.execute(select(MaterialClass).where(MaterialClass.slug == slug)).scalars().one_or_none()
    )
    if existing:
        return existing
    obj = MaterialClass(name=name, slug=slug)
    db.add(obj)
    db.flush()
    return obj


def _build_value_row(
    spec: dict,
    prop: PropertyDefinition,
    source: Source,
) -> MaterialPropertyValue:
    """Constrói um MaterialPropertyValue a partir de um spec do seed."""
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
    else:
        msg = f"Tipo de valor desconhecido no seed: {kind!r}"
        raise ValueError(msg)

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


def _existing_demo_names(db: Session) -> set[str]:
    """Names already taken by a catalogue demo material (``is_demo``, no owner).

    The idempotence key of every demo writer. A real or user-owned material
    that happens to share a name is not a demo one: it neither blocks the demo
    row nor, by matching twice, makes the lookup raise ``MultipleResultsFound``
    (D-185 — the old ``Material.name == name … one_or_none()``).
    """
    return set(
        db.execute(
            select(Material.name).where(Material.is_demo.is_(True), Material.owner_id.is_(None))
        ).scalars()
    )


def seed_extended_materials(db: Session, source: Source, specs: list[dict] | None = None) -> int:
    """Semeia os materiais demo de ``specs`` (os 70 estendidos por padrão). Idempotente.

    Retorna o número de materiais criados nesta execução."""
    prop_by_slug = {p.slug: p for p in db.execute(select(PropertyDefinition)).scalars().all()}
    material_repo = MaterialRepository(db)
    existing_names = _existing_demo_names(db)
    classes: dict[str, MaterialClass] = {}

    created = 0
    for mat_spec in EXTENDED_DEMO_MATERIALS if specs is None else specs:
        if mat_spec["name"] in existing_names:
            continue

        class_slug = mat_spec["class_slug"]
        if class_slug not in classes:
            classes[class_slug] = _get_or_create_class(db, class_slug.title(), class_slug)
        material = Material(
            name=mat_spec["name"],
            class_id=classes[class_slug].id,
            subclass=mat_spec.get("subclass"),
            description=mat_spec.get("description"),
            keywords=mat_spec.get("keywords", []),
            is_demo=True,
        )
        db.add(material)
        db.flush()

        for value_spec in mat_spec["values"]:
            prop = prop_by_slug[value_spec["slug"]]
            row = _build_value_row(value_spec, prop, source)
            row.material_id = material.id
            db.add(row)

        material_repo.sync_keywords(material.id, mat_spec.get("keywords", []))
        existing_names.add(material.name)
        created += 1

    db.flush()
    return created


def tcc_demo_material_ids(db: Session, specs: list[dict] | None = None) -> list[int]:
    """Ids of the catalogue demo materials named by ``specs`` (the TCC lots by default)."""
    names = [m["name"] for m in (TCC_DEMO_MATERIALS if specs is None else specs)]
    ids: list[int] = []
    for start in range(0, len(names), 500):  # bounded IN list, any backend
        ids.extend(
            db.execute(
                select(Material.id).where(
                    Material.name.in_(names[start : start + 500]),
                    Material.is_demo.is_(True),
                    Material.owner_id.is_(None),
                )
            ).scalars()
        )
    return sorted(ids)


def seed_demo_catalog_expansion(
    db: Session, source: Source, specs: list[dict] | None = None
) -> dict[str, int]:
    """O catálogo demo ampliado do TCC (D-185): materiais, identidade, curvas e processos.

    Idempotente: uma segunda execução cria zero de tudo. ``specs`` existe para o
    teste semear um recorte; o ``main()`` passa os 593 (``TCC_DEMO_MATERIALS``).
    Retorna as contagens que o log de ``semear_demo`` imprime.

    * Materiais pelo mesmo escritor dos 70 (``seed_extended_materials``).
    * Designação e composição pelo escritor único ``_seed_demo_identity``.
    * Curvas derivadas das propriedades de cada um, com a forma do
      ``curve_hint`` do lote (``build_curve_specs`` com ``names``/``hints``).
    * Processos por classe **só** para os ids destes materiais: sem
      ``material_ids``, ``link_demo_processes`` tocaria material real também.
    * Os três valores do cartão CAE vêm escritos nos lotes, então
      ``seed_demo_cae_values`` (que só preenche par ausente) não entra aqui.
    """
    if not source.is_demo:  # pragma: no cover - guarded by main()
        raise ValueError("O catálogo demo ampliado só pode citar a fonte demo.")
    chosen = TCC_DEMO_MATERIALS if specs is None else specs
    created = seed_extended_materials(db, source, specs=chosen)
    identity = _seed_demo_identity(
        db,
        source,
        designations_by_material={
            m["name"]: [parse_designation(raw) for raw in m["designations"]] for m in chosen
        },
        compositions_by_material={m["name"]: parse_composition(m["composition"]) for m in chosen},
    )
    names = [m["name"] for m in chosen]
    hints = {m["name"]: m["curve_hint"] for m in chosen if m.get("curve_hint")}
    curves = _seed_demo_curves(db, source, build_curve_specs(db, names=names, hints=hints))
    links = link_demo_processes(db, material_ids=tcc_demo_material_ids(db, chosen))
    return {
        "tcc_materials_created": created,
        "tcc_designations_created": identity["designations_created"],
        "tcc_composition_entries_created": identity["composition_entries_created"],
        "tcc_curves_created": curves,
        "tcc_process_links_created": links["links_created"],
    }


def main() -> None:
    """CLI entry point: semeia os materiais estendidos.

    Pressupõe que o seed principal (python -m app.db.seed) já foi executado,
    pois depende das classes, propriedades e fonte demo existentes.
    """
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        # Busca a fonte demo criada pelo seed principal
        demo_source = (
            db.execute(select(Source).where(Source.label == DEMO_SOURCE_LABEL))
            .scalars()
            .one_or_none()
        )
        if demo_source is None:
            print(
                "[seed_extended] Erro: fonte demo não encontrada. "
                "Execute primeiro: python -m app.db.seed"
            )
            return

        created = seed_extended_materials(db, demo_source)
        expansion = seed_demo_catalog_expansion(db, demo_source)  # D-185: 593 do TCC
        releases = seed_demo_releases(db)  # D-108: duas releases fictícias comparáveis
        identity = seed_extended_identity(db, demo_source)
        equivalences = seed_demo_equivalences(db, demo_source)  # D-115 (TM1)
        cae_values = seed_demo_cae_values(db, demo_source, EXTENDED_DEMO_MATERIALS)  # D-124
        ordinals = seed_demo_ordinals(db, demo_source)  # D-126
        db.commit()

    print(f"[seed_extended] Concluído: {created} materiais criados.")
    print(f"[seed_extended] Catálogo demo ampliado (D-185): {expansion}")
    print(f"[seed_extended] Releases demo: {releases}")
    print(f"[seed_extended] Identidade e curvas demo: {identity}")
    print(f"[seed_extended] Equivalências demo: {equivalences}")
    print(f"[seed_extended] Valores CAE demo: {{'cae_values_created': {cae_values}}}")
    print(f"[seed_extended] Propriedades ordinais demo: {ordinals}")


if __name__ == "__main__":
    main()
