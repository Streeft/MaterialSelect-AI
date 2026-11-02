"""Ashby's whole process range and which demo material each process serves (D-192).

Three halves:

* **The catalogue** (``process_catalog_ashby``): slugs, classes, closed
  vocabularies, envelopes and scalars that make sense, and the shaping /
  joining / surface split of the economic attributes.
* **The table** (``demo_process_compat``), pure: every one of the 678 demo
  materials ends with at least two shaping processes and a joining one, a
  surface treatment where one applies, and never a combination on the black
  list. Computed from the seed specs, so it needs no database.
* **The sync** (``sync_demo_process_links``) over the database: adds what is
  missing, removes only demo-material × demo-process links the table rejects,
  never touches a real material nor a real process, and is idempotent.
"""

from __future__ import annotations

import re

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.demo_process_compat import (
    CLASS_FALLBACK,
    RESTRICTIONS,
    SUBCLASS_PROCESSES,
    compatible_process_slugs,
)
from app.db.link_demo_processes import link_demo_processes, sync_demo_process_links
from app.db.process_catalog_ashby import (
    ASHBY_PROCESS_ATTRIBUTE_VALUES,
    ASHBY_PROCESS_CLASSES,
    ASHBY_PROCESSES,
    CO2_PER_MJ,
    JOINING_SLUGS,
    SHAPING_SLUGS,
    SURFACE_SLUGS,
)
from app.db.seed import (
    DEMO_MATERIALS,
    MATERIAL_PROCESS_LINKS,
    PROCESS_ATTRIBUTES,
    PROCESS_CLASSES,
    PROCESSES,
)
from app.db.seed_demo_releases import DEMO_RELEASES
from app.db.seed_extended import EXTENDED_DEMO_MATERIALS, TCC_DEMO_MATERIALS
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.process import MaterialProcess, Process, ProcessClass

ECONOMICS = {
    "custo-ferramental",
    "taxa-producao",
    "custo-capital",
    "custo-hora-operacao",
    "fracao-refugo",
}
ENVIRONMENT = {"energia-processo", "co2-processo"}
EXERCISE_ELEVEN = {
    "faixa-massa",
    "espessura-secao",
    "lote-economico",
    "forma",
    "caracteristica-processo",
}

_CLASS_PARENT = {spec["slug"]: spec["parent"] for spec in PROCESS_CLASSES}
_PROCESS_CLASS = {spec["slug"]: spec["class_slug"] for spec in PROCESSES}


def _root(class_slug: str) -> str:
    while _CLASS_PARENT[class_slug] is not None:
        class_slug = _CLASS_PARENT[class_slug]
    return class_slug


def _role(process_slug: str) -> str:
    return _root(_PROCESS_CLASS[process_slug])


#: Every demo material the catalogue seeds: 5 + 70 + 593 + 10 (the releases).
ALL_DEMO: list[tuple[str, str | None, str]] = [
    *((m["class_slug"], m.get("subclass"), m["name"]) for m in DEMO_MATERIALS),
    *((m["class_slug"], m.get("subclass"), m["name"]) for m in EXTENDED_DEMO_MATERIALS),
    *((m["class_slug"], m.get("subclass"), m["name"]) for m in TCC_DEMO_MATERIALS),
    *((r.class_slug, r.subclass, r.name) for rel in DEMO_RELEASES for r in rel.records),
]


def _links(class_slug: str, subclass: str | None, name: str) -> list[str]:
    if name in MATERIAL_PROCESS_LINKS:
        return list(MATERIAL_PROCESS_LINKS[name])
    return compatible_process_slugs(class_slug, subclass, name)


# --- the catalogue ----------------------------------------------------------


class TestCatalogue:
    def test_the_whole_range_is_there(self) -> None:
        assert len(ASHBY_PROCESSES) >= 120
        assert len(PROCESSES) == 13 + len(ASHBY_PROCESSES)
        families = {_PROCESS_CLASS[p["slug"]] for p in ASHBY_PROCESSES}
        for family in (
            "conformacao-liquido",
            "conformacao-solido",
            "conformacao-particulados",
            "moldagem-polimeros",
            "conformacao-compositos",
            "conformacao-vidro",
            "manufatura-aditiva",
            "remocao-material",
            "construcao-naturais",
            "uniao-soldagem",
            "superficie-revestimento",
            "superficie-termica",
        ):
            assert family in families, family

    def test_slugs_are_unique_and_classes_known(self) -> None:
        slugs = [p["slug"] for p in PROCESSES]
        assert len(slugs) == len(set(slugs))
        class_slugs = [c["slug"] for c in PROCESS_CLASSES]
        assert len(class_slugs) == len(set(class_slugs))
        known = set(class_slugs)
        for spec in ASHBY_PROCESS_CLASSES:
            assert spec["parent"] in known
            # Parents come first, so the seed can create them in order.
            assert class_slugs.index(spec["parent"]) < class_slugs.index(spec["slug"])
        for spec in ASHBY_PROCESSES:
            assert spec["class_slug"] in known, spec["slug"]
            assert spec["description"]

    def test_roles_follow_the_family(self) -> None:
        assert {_role(s) for s in SHAPING_SLUGS} == {"conformacao"}
        assert {_role(s) for s in JOINING_SLUGS} == {"uniao"}
        assert {_role(s) for s in SURFACE_SLUGS} == {"tratamento-superficie"}

    def test_every_label_comes_from_its_vocabulary(self) -> None:
        vocab = {a["slug"]: set(a.get("allowed_labels", [])) for a in PROCESS_ATTRIBUTES}
        for process, values in ASHBY_PROCESS_ATTRIBUTE_VALUES.items():
            for value in values:
                if value["kind"] == "labels":
                    assert value["labels"], process
                    assert set(value["labels"]) <= vocab[value["slug"]], process

    def test_numbers_are_positive_envelopes_ordered_scrap_a_fraction(self) -> None:
        for process, values in ASHBY_PROCESS_ATTRIBUTE_VALUES.items():
            by_slug = {v["slug"]: v for v in values}
            for value in values:
                if value["kind"] == "envelope":
                    assert 0 < value["min"] < value["max"], (process, value["slug"])
                elif value["kind"] == "scalar":
                    assert value["value"] > 0, (process, value["slug"])
            if "fracao-refugo" in by_slug:
                assert 0 < by_slug["fracao-refugo"]["value"] < 1, process
            if "energia-processo" in by_slug:
                energy = by_slug["energia-processo"]["value"]
                assert by_slug["co2-processo"]["value"] == pytest.approx(
                    energy * CO2_PER_MJ, abs=1e-3
                )

    def test_shaping_carries_all_twelve_joining_and_surface_only_the_exercise(self) -> None:
        """The rule ``test_only_shaping_processes_carry_economics`` set for the 13."""
        twelve = EXERCISE_ELEVEN | ECONOMICS | ENVIRONMENT
        assert {a["slug"] for a in PROCESS_ATTRIBUTES} == twelve
        for slug in SHAPING_SLUGS:
            assert {v["slug"] for v in ASHBY_PROCESS_ATTRIBUTE_VALUES[slug]} == twelve, slug
        for slug in JOINING_SLUGS | SURFACE_SLUGS:
            assert {v["slug"] for v in ASHBY_PROCESS_ATTRIBUTE_VALUES[slug]} == EXERCISE_ELEVEN


# --- the table, pure ---------------------------------------------------------


#: (what the material is, by class/subclass or by name, case-blind) × processes it
#: must never get. The combinations a class-only table produced, and their kin.
BLACK_LIST: list[tuple[str, str, set[str]]] = [
    (
        "subclass",
        "Vidros",
        {
            "prensagem-sinterizacao",
            "moldagem-compressao",
            "moldagem-injecao",
            "forjamento",
            "laminacao",
            "fundicao-areia",
            "solda-mig",
            "solda-tig",
        },
    ),
    (
        "subclass",
        "Concretos e Argamassas",
        {
            "moldagem-compressao",
            "moldagem-injecao",
            "prensagem-sinterizacao",
            "forjamento",
            "extrusao",
            "solda-mig",
            "anodizacao",
        },
    ),
    (
        "subclass",
        "Pedras Naturais",
        {
            "prensagem-sinterizacao",
            "fundicao-areia",
            "moldagem-compressao",
            "forjamento",
            "extrusao",
            "solda-mig",
        },
    ),
    (
        "subclass",
        "Madeiras Maciças",
        {
            "fundicao-areia",
            "moldagem-injecao",
            "moldagem-compressao",
            "forjamento",
            "solda-mig",
            "anodizacao",
            "extrusao",
        },
    ),
    (
        "subclass",
        "Espumas Metálicas",
        {
            "forjamento",
            "forjamento-matriz-aberta",
            "forjamento-matriz-fechada",
            "laminacao",
            "trefilacao",
            "estampagem",
            "embutimento-profundo",
        },
    ),
    (
        "subclass",
        "Ferros Fundidos",
        {"forjamento", "forjamento-matriz-fechada", "laminacao", "trefilacao", "estampagem"},
    ),
    (
        "subclass",
        "Termofixos",
        {
            "solda-ultrassom",
            "solda-placa-quente",
            "solda-gas-quente",
            "termoformagem",
            "moldagem-sopro",
            "rotomoldagem",
            "extrusao",
            "fdm",
        },
    ),
    (
        "subclass",
        "Metais Refratários",
        {"fundicao-areia", "fundicao-sob-pressao", "fundicao-coquilha", "moldagem-injecao"},
    ),
    (
        "subclass",
        "Borrachas Sintéticas",
        {"solda-ultrassom", "solda-placa-quente", "termoformagem", "moldagem-sopro"},
    ),
    (
        "class",
        "polimeros",
        {
            "fundicao-areia",
            "forjamento",
            "anodizacao",
            "galvanizacao",
            "solda-mig",
            "solda-tig",
            "oxicorte",
            "eletroerosao-fio",
            "corte-plasma",
            "tempera-revenido",
        },
    ),
    (
        "class",
        "ceramicas",
        {
            "solda-mig",
            "solda-tig",
            "anodizacao",
            "galvanizacao",
            "forjamento",
            "estampagem",
            "laminacao",
            "moldagem-injecao",
            "termoformagem",
            "oxicorte",
        },
    ),
    ("name", r"inoxid", {"oxicorte", "galvanizacao"}),
    ("name", r"ptfe|politetrafluor|peuapm", {"moldagem-injecao", "moldagem-sopro"}),
    ("name", r"\b(2024|7075)\b", {"solda-mig", "solda-tig"}),
    ("name", r"inoxidável austenítico", {"tempera-revenido"}),
]


def _matches(kind: str, key: str, item: tuple[str, str | None, str]) -> bool:
    class_slug, subclass, name = item
    if kind == "subclass":
        return subclass == key
    if kind == "class":
        return class_slug == key
    return re.search(key, name, re.IGNORECASE) is not None


class TestTable:
    def test_the_demo_catalogue_is_678_materials(self) -> None:
        assert len(ALL_DEMO) == 678

    def test_every_slug_in_the_table_is_a_seeded_process(self) -> None:
        known = set(_PROCESS_CLASS)
        for slugs in [*SUBCLASS_PROCESSES.values(), *CLASS_FALLBACK.values()]:
            assert set(slugs) <= known
        assert {key[2] for key in RESTRICTIONS} <= known
        for item in ALL_DEMO:
            assert set(compatible_process_slugs(*item)) <= known, item[2]

    def test_every_demo_subclass_is_mapped(self) -> None:
        for class_slug, subclass, name in ALL_DEMO:
            assert (class_slug, subclass) in SUBCLASS_PROCESSES, (class_slug, subclass, name)

    @pytest.mark.parametrize(("kind", "key", "banned"), BLACK_LIST)
    def test_black_list(self, kind: str, key: str, banned: set[str]) -> None:
        hits = [item for item in ALL_DEMO if _matches(kind, key, item)]
        assert hits, f"a regra {key!r} não pega nenhum material"
        for item in hits:
            got = set(_links(*item)) & banned
            assert not got, (item[2], sorted(got))

    def test_anodizing_only_on_aluminium_titanium_and_magnesium(self) -> None:
        for item in ALL_DEMO:
            if "anodizacao" in _links(*item):
                assert re.search(r"alumínio|titânio|magnésio|liga leve|az31", item[2], re.I) or (
                    item[1] in {"Ligas Leves", "Liga leve"}
                ), item[2]

    def test_every_demo_material_gets_two_shaping_processes_and_a_joining_one(self) -> None:
        for item in ALL_DEMO:
            links = _links(*item)
            shaping = [s for s in links if _role(s) == "conformacao"]
            assert len(shaping) >= 2, (item[2], links)
            if item[2] == "Cerâmica Demo D":
                continue  # deliberate absence of a joining process (seed fixture)
            assert any(_role(s) == "uniao" for s in links), item[2]

    def test_a_surface_treatment_where_one_applies(self) -> None:
        """Rubber, foams, refractories, fluoropolymers and solders take none."""
        exempt_subclasses = {
            "Borrachas Naturais",
            "Borrachas Sintéticas",
            "Elastômeros Especiais",
            "Elastômeros Termoplásticos",
            "Espumas Metálicas",
            "Espumas Poliméricas",
            "Espumas Cerâmicas",
            "Cerâmicas Refratárias",
            "Ligas de Chumbo e Estanho",
        }
        exempt_names = re.compile(
            r"ptfe|politetrafluor|peuapm|poliimida sinterizada|fluor|etfe|\bfep\b|\bpfa\b|"
            r"pvdf|pctfe|ectfe|boro / alumínio|demo d$|demo c$|demo e$",
            re.IGNORECASE,
        )
        for item in ALL_DEMO:
            if item[1] in exempt_subclasses or exempt_names.search(item[2]):
                continue
            links = _links(*item)
            assert any(_role(s) == "tratamento-superficie" for s in links), item[2]

    def test_the_table_is_deterministic(self) -> None:
        for item in ALL_DEMO[:50]:
            assert compatible_process_slugs(*item) == compatible_process_slugs(*item)

    def test_an_unknown_subclass_falls_back_to_its_class(self) -> None:
        assert (
            compatible_process_slugs("metais", "Subclasse Nova", "Liga X")
            == CLASS_FALLBACK["metais"]
        )
        assert compatible_process_slugs("classe-nova", None, "X") == []


# --- the sync, over the database --------------------------------------------


def _class(db: Session, slug: str) -> MaterialClass:
    return db.execute(select(MaterialClass).where(MaterialClass.slug == slug)).scalar_one()


def _process(db: Session, slug: str) -> Process:
    return db.execute(select(Process).where(Process.slug == slug)).scalar_one()


def _linked(db: Session, material_id: int) -> set[str]:
    return set(
        db.execute(
            select(Process.slug)
            .join(MaterialProcess, MaterialProcess.process_id == Process.id)
            .where(MaterialProcess.material_id == material_id)
        ).scalars()
    )


def _count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(MaterialProcess)) or 0


def test_the_seed_installs_the_whole_range(db_session: Session) -> None:
    seeded = set(db_session.execute(select(Process.slug)).scalars())
    assert {p["slug"] for p in PROCESSES} <= seeded
    classes = set(db_session.execute(select(ProcessClass.slug)).scalars())
    assert {c["slug"] for c in PROCESS_CLASSES} <= classes
    assert all(
        db_session.execute(
            select(Process.is_demo).where(Process.slug.in_([p["slug"] for p in ASHBY_PROCESSES]))
        ).scalars()
    )


def test_sync_adds_by_subclass_removes_the_implausible_and_is_idempotent(
    db_session: Session,
) -> None:
    ceramics = _class(db_session, "ceramicas")
    glass = Material(
        name="Vidro Soda-Cal Float de Teste",
        class_id=ceramics.id,
        subclass="Vidros",
        is_demo=True,
    )
    real_glass = Material(
        name="Vidro Real de Teste", class_id=ceramics.id, subclass="Vidros", is_demo=False
    )
    db_session.add_all([glass, real_glass])
    db_session.flush()
    sintering = _process(db_session, "prensagem-sinterizacao")
    # What the class-only migration wrote, on both.
    db_session.add_all(
        [
            MaterialProcess(material_id=glass.id, process_id=sintering.id),
            MaterialProcess(material_id=real_glass.id, process_id=sintering.id),
        ]
    )
    db_session.flush()

    first = sync_demo_process_links(db_session)
    assert first["demo_process_links_removed"] >= 1
    linked = _linked(db_session, glass.id)
    assert "prensagem-sinterizacao" not in linked
    assert {"vidro-flutuacao", "tempera-vidro", "polimento"} <= linked
    # The real material keeps exactly what it had: nothing added, nothing removed.
    assert _linked(db_session, real_glass.id) == {"prensagem-sinterizacao"}

    before = _count(db_session)
    second = sync_demo_process_links(db_session)
    assert second["demo_process_links_created"] == 0
    assert second["demo_process_links_removed"] == 0
    assert _count(db_session) == before


def test_sync_never_removes_a_link_to_a_real_process(db_session: Session) -> None:
    polymers = _class(db_session, "polimeros")
    conformacao = db_session.execute(
        select(ProcessClass).where(ProcessClass.slug == "conformacao")
    ).scalar_one()
    real_process = Process(
        name="Processo Real de Teste", slug="processo-real-teste", class_id=conformacao.id
    )
    real_process.is_demo = False
    material = Material(
        name="Polímero Demo de Teste", class_id=polymers.id, subclass="Termofixos", is_demo=True
    )
    db_session.add_all([real_process, material])
    db_session.flush()
    db_session.add(MaterialProcess(material_id=material.id, process_id=real_process.id))
    db_session.flush()

    sync_demo_process_links(db_session, material_ids=[material.id])
    linked = _linked(db_session, material.id)
    assert "processo-real-teste" in linked
    assert "moldagem-compressao" not in linked  # restricted to moulding compounds
    assert "fundicao-polimeros" not in linked
    assert linked & {"usinagem-convencional", "adesivagem"}


def test_sync_keeps_the_curated_five_as_chosen(db_session: Session) -> None:
    sync_demo_process_links(db_session)
    for name, slugs in MATERIAL_PROCESS_LINKS.items():
        material = db_session.execute(
            select(Material).where(Material.name == name, Material.is_demo.is_(True))
        ).scalar_one()
        assert _linked(db_session, material.id) == set(slugs), name


def test_sync_removes_anodizing_from_the_demo_steel(db_session: Session) -> None:
    """The class-only migration anodized "Aço Demo B"; the sync takes it back."""
    steel = db_session.execute(select(Material).where(Material.name == "Aço Demo B")).scalar_one()
    db_session.add(
        MaterialProcess(material_id=steel.id, process_id=_process(db_session, "anodizacao").id)
    )
    db_session.flush()
    result = sync_demo_process_links(db_session, material_ids=[steel.id])
    assert result["demo_process_links_removed"] == 1
    assert _linked(db_session, steel.id) == set(MATERIAL_PROCESS_LINKS["Aço Demo B"])


def test_link_only_adds_and_reaches_a_user_material(db_session: Session) -> None:
    metals = _class(db_session, "metais")
    mine = Material(
        name="Liga de Titânio do Usuário",
        class_id=metals.id,
        subclass="Ligas de Titânio",
        is_demo=False,
    )
    db_session.add(mine)
    db_session.flush()
    stats = link_demo_processes(db_session, material_ids=[mine.id])
    assert stats["links_created"] > 0
    linked = _linked(db_session, mine.id)
    assert {"fundicao-cera-perdida", "solda-difusao", "anodizacao"} <= linked
    assert "fundicao-areia" not in linked
