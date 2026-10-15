"""Glossário de propriedades (D-130): verbetes conceituais, versionados e validados."""

from __future__ import annotations

import json
import socket

import pytest
from pydantic import ValidationError

from app.db.seed import PROPERTIES
from app.domain.glossary import (
    DEFINITION_MAX,
    ENTRIES_PATH,
    NUMBER_WITH_UNIT,
    SUMMARY_MAX,
    GlossaryEntry,
    GlossaryError,
    load_entries,
    parse_entries,
)

LICENSE = (
    "Texto autoral do projeto MaterialSelect AI, distribuído sob a licença MIT do repositório."
)


def _entry(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "slug": "densidade",
        "summary": "Massa por unidade de volume.",
        "definition": "Razão entre massa e volume.",
        "how_measured": None,
        "reference": None,
        "license": LICENSE,
        "review_status": "rascunho",
        "lang": "pt-BR",
    }
    base.update(overrides)
    return base


# --- validação --------------------------------------------------------------


def test_summary_above_limit_is_refused() -> None:
    with pytest.raises(ValidationError):
        GlossaryEntry.model_validate(_entry(summary="a" * (SUMMARY_MAX + 1)))


def test_definition_above_limit_is_refused() -> None:
    with pytest.raises(ValidationError):
        GlossaryEntry.model_validate(_entry(definition="a" * (DEFINITION_MAX + 1)))


def test_limits_are_inclusive() -> None:
    GlossaryEntry.model_validate(_entry(summary="a" * SUMMARY_MAX, definition="b" * DEFINITION_MAX))


def test_unknown_field_is_refused() -> None:
    # A typo ("refrence") must fail the build, not vanish silently.
    with pytest.raises(ValidationError):
        GlossaryEntry.model_validate(_entry(refrence="ISO"))


def test_missing_license_is_refused() -> None:
    raw = _entry()
    del raw["license"]
    with pytest.raises(ValidationError):
        GlossaryEntry.model_validate(raw)


@pytest.mark.parametrize("status", ["revisado", "rascunho"])
def test_review_status_accepts_the_two_states(status: str) -> None:
    assert GlossaryEntry.model_validate(_entry(review_status=status)).review_status == status


@pytest.mark.parametrize("status", ["aprovado", "", "Rascunho", None])
def test_review_status_refuses_anything_else(status: object) -> None:
    with pytest.raises(ValidationError):
        GlossaryEntry.model_validate(_entry(review_status=status))


def test_duplicate_slug_is_refused() -> None:
    with pytest.raises(GlossaryError, match="repetido"):
        parse_entries([_entry(), _entry()])


def test_non_list_file_is_refused() -> None:
    with pytest.raises(GlossaryError):
        parse_entries({"densidade": _entry()})


# --- canário: verbete conceitual, nunca numérico ------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "O aço tem cerca de 200 GPa.",
        "Típico: 7,8 g/cm³.",
        "Serve até 150 °C.",
        "Varia de 0,3 % a 2%.",
        "Custa 2 USD/kg.",
        "Dureza de 600 HV.",
    ],
)
def test_number_followed_by_unit_is_refused(text: str) -> None:
    with pytest.raises(ValidationError, match="conceitual"):
        GlossaryEntry.model_validate(_entry(definition=text))


def test_reference_may_carry_a_standard_number() -> None:
    # The number of a standard is not a material value.
    entry = GlossaryEntry.model_validate(_entry(reference="ISO 6892-1"))
    assert entry.reference == "ISO 6892-1"


def test_no_shipped_entry_carries_a_number_with_unit() -> None:
    for entry in load_entries().values():
        for text in (entry.summary, entry.definition, entry.how_measured or ""):
            assert not NUMBER_WITH_UNIT.search(text), entry.slug


# --- o arquivo versionado ----------------------------------------------------


def test_every_seed_property_has_an_entry() -> None:
    # Canário: o próximo slug criado em seed.PROPERTIES falha aqui até ganhar
    # verbete — ou até alguém decidir, por escrito, que ele fica sem.
    slugs = {p["slug"] for p in PROPERTIES}
    assert len(slugs) == 15
    missing = slugs - set(load_entries())
    assert not missing, f"propriedades sem verbete no glossário: {sorted(missing)}"


def test_shipped_entries_are_drafts_in_ptbr_with_license() -> None:
    for entry in load_entries().values():
        assert entry.lang == "pt-BR"
        assert entry.license
        # D-130: nada sai como revisado sem edição do autor.
        assert entry.review_status in {"rascunho", "revisado"}


def test_file_loads_without_database(monkeypatch: pytest.MonkeyPatch) -> None:
    # Pure content: no session, no engine, no network.
    import app.db.base as db_base

    def _boom(*_a: object, **_k: object) -> None:
        raise AssertionError("o glossário não pode abrir sessão de banco")

    monkeypatch.setattr(db_base, "get_db", _boom)
    monkeypatch.setattr(socket, "socket", _boom)
    raw = json.loads(ENTRIES_PATH.read_text(encoding="utf-8"))
    assert len(parse_entries(raw)) == len(raw)


# --- HTTP --------------------------------------------------------------------


def test_list_endpoint_returns_entries_in_slug_order(client) -> None:
    response = client.get("/api/glossario")
    assert response.status_code == 200
    body = response.json()
    slugs = [e["slug"] for e in body]
    assert slugs == sorted(slugs)
    assert {"modulo_young", "densidade"} <= set(slugs)
    assert all(e["review_status"] == "rascunho" for e in body)


def test_get_endpoint_returns_one_entry(client) -> None:
    response = client.get("/api/glossario/modulo_young")
    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "modulo_young"
    assert body["license"]
    assert set(body) == {
        "slug",
        "summary",
        "definition",
        "how_measured",
        "reference",
        "license",
        "review_status",
        "lang",
    }


def test_missing_entry_is_a_written_404_naming_the_slug(client) -> None:
    response = client.get("/api/glossario/durabilidade-agua-doce-demo")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Sem verbete no glossário" in detail
    assert "durabilidade-agua-doce-demo" in detail


def test_access_rule_matches_property_list(client_without_subscription) -> None:
    glossary = client_without_subscription.get("/api/glossario").status_code
    properties = client_without_subscription.get("/api/properties").status_code
    assert glossary == properties


def test_requires_login(anon_client) -> None:
    assert anon_client.get("/api/glossario").status_code == 401
