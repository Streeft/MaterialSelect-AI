"""Notas de família de materiais (D-151): texto conceitual, versionado e validado."""

from __future__ import annotations

import json
import socket

import pytest
from pydantic import ValidationError

from app.db.seed import CLASSES
from app.domain.family_notes import (
    BODY_MAX,
    FAMILIES_WITHOUT_NOTE,
    ITEM_MAX,
    NOTES_PATH,
    PARAGRAPH_MAX,
    SUMMARY_MAX,
    FamilyNote,
    FamilyNotesError,
    load_notes,
    parse_notes,
)
from app.domain.glossary import NUMBER_WITH_UNIT

LICENSE = (
    "Texto autoral do projeto MaterialSelect AI, distribuído sob a licença MIT do repositório."
)


def _note(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "slug": "metais",
        "summary": "Materiais de ligação metálica.",
        "body": ["Átomos num arranjo cristalino.", "Elétrons livres conduzem calor."],
        "when_to_use": ["Peças que carregam carga."],
        "watch_out": ["Corrosão."],
        "reference": None,
        "license": LICENSE,
        "review_status": "rascunho",
        "lang": "pt-BR",
    }
    base.update(overrides)
    return base


# --- validação --------------------------------------------------------------


def test_minimal_note_is_accepted() -> None:
    note = FamilyNote.model_validate(_note())
    assert note.slug == "metais"
    assert note.reference is None


def test_summary_above_limit_is_refused() -> None:
    with pytest.raises(ValidationError):
        FamilyNote.model_validate(_note(summary="a" * (SUMMARY_MAX + 1)))


def test_summary_limit_is_inclusive() -> None:
    FamilyNote.model_validate(_note(summary="a" * SUMMARY_MAX))


def test_body_above_limit_is_refused_even_in_short_paragraphs() -> None:
    paragraph = "a" * (BODY_MAX // 3 + 1)
    with pytest.raises(ValidationError, match="corpo"):
        FamilyNote.model_validate(_note(body=[paragraph, paragraph, paragraph]))


def test_body_at_limit_is_accepted() -> None:
    FamilyNote.model_validate(_note(body=["a" * (BODY_MAX // 3)] * 3))


def test_long_paragraph_is_refused() -> None:
    with pytest.raises(ValidationError, match="parágrafo"):
        FamilyNote.model_validate(_note(body=["a" * (PARAGRAPH_MAX + 1)]))


def test_blank_paragraph_is_refused() -> None:
    with pytest.raises(ValidationError, match="parágrafo"):
        FamilyNote.model_validate(_note(body=["Texto.", "   "]))


def test_empty_body_is_refused() -> None:
    with pytest.raises(ValidationError):
        FamilyNote.model_validate(_note(body=[]))


def test_body_as_one_string_is_refused() -> None:
    # Strict: a string is not a list of paragraphs, even though it iterates.
    with pytest.raises(ValidationError):
        FamilyNote.model_validate(_note(body="Um parágrafo só."))


@pytest.mark.parametrize("field", ["when_to_use", "watch_out"])
def test_lists_must_have_items(field: str) -> None:
    with pytest.raises(ValidationError):
        FamilyNote.model_validate(_note(**{field: []}))


@pytest.mark.parametrize("field", ["when_to_use", "watch_out"])
def test_long_item_is_refused(field: str) -> None:
    with pytest.raises(ValidationError, match="item"):
        FamilyNote.model_validate(_note(**{field: ["a" * (ITEM_MAX + 1)]}))


def test_unknown_field_is_refused() -> None:
    # A typo ("wach_out") must fail the build, not vanish silently.
    with pytest.raises(ValidationError):
        FamilyNote.model_validate(_note(wach_out=["Corrosão."]))


def test_missing_license_is_refused() -> None:
    raw = _note()
    del raw["license"]
    with pytest.raises(ValidationError):
        FamilyNote.model_validate(raw)


@pytest.mark.parametrize("status", ["revisado", "rascunho"])
def test_review_status_accepts_the_two_states(status: str) -> None:
    assert FamilyNote.model_validate(_note(review_status=status)).review_status == status


@pytest.mark.parametrize("status", ["aprovado", "", "Rascunho", None])
def test_review_status_refuses_anything_else(status: object) -> None:
    with pytest.raises(ValidationError):
        FamilyNote.model_validate(_note(review_status=status))


def test_language_other_than_ptbr_is_refused() -> None:
    with pytest.raises(ValidationError):
        FamilyNote.model_validate(_note(lang="en"))


def test_duplicate_slug_is_refused() -> None:
    with pytest.raises(FamilyNotesError, match="repetido"):
        parse_notes([_note(), _note()])


def test_non_list_file_is_refused() -> None:
    with pytest.raises(FamilyNotesError):
        parse_notes({"metais": _note()})


# --- canário: nota conceitual, nunca numérica ---------------------------------


@pytest.mark.parametrize(
    ("field", "text"),
    [
        ("summary", "O aço tem cerca de 200 GPa."),
        ("body", ["Típico: 7,8 g/cm³."]),
        ("when_to_use", ["Serve até 150 °C."]),
        ("watch_out", ["Alonga de 0,3 % a 2%."]),
        ("watch_out", ["Custa 2 USD/kg."]),
    ],
)
def test_number_followed_by_unit_is_refused(field: str, text: object) -> None:
    with pytest.raises(ValidationError, match="número com unidade"):
        FamilyNote.model_validate(_note(**{field: text}))


@pytest.mark.parametrize(
    ("field", "text"),
    [
        ("summary", "Cerca de 3 vezes mais rígido."),
        ("body", ["Usado desde 1950."]),
        ("when_to_use", ["Série 7000."]),
    ],
)
def test_any_digit_is_refused(field: str, text: object) -> None:
    # Stricter than the glossary: a family note has no reason to carry a figure.
    with pytest.raises(ValidationError, match="algarismo"):
        FamilyNote.model_validate(_note(**{field: text}))


def test_reference_may_carry_a_standard_number() -> None:
    # The number of a standard is not a material value.
    note = FamilyNote.model_validate(_note(reference="ISO 6892-1"))
    assert note.reference == "ISO 6892-1"


def test_no_shipped_note_carries_a_digit() -> None:
    for note in load_notes().values():
        for text in note.texts():
            assert not NUMBER_WITH_UNIT.search(text), note.slug
            assert not any(ch.isdigit() for ch in text), note.slug


# --- o arquivo versionado ----------------------------------------------------


def test_every_seed_family_has_a_note_or_a_written_exception() -> None:
    # Canário: a próxima classe criada em seed.CLASSES falha aqui até ganhar
    # nota — ou até alguém decidir, por escrito, que ela fica sem.
    slugs = {c["slug"] for c in CLASSES}
    assert slugs == {"metais", "polimeros", "ceramicas", "compositos", "elastomeros"}
    missing = slugs - set(load_notes()) - set(FAMILIES_WITHOUT_NOTE)
    assert not missing, f"famílias sem nota nem exceção escrita: {sorted(missing)}"


def test_exceptions_are_written_and_not_also_noted() -> None:
    notes = load_notes()
    for slug, reason in FAMILIES_WITHOUT_NOTE.items():
        assert reason.strip(), f"exceção sem motivo escrito: {slug}"
        assert slug not in notes, f"{slug} tem nota e está na lista de exceções"


def test_every_note_names_a_real_family() -> None:
    # A typo in a slug ("ceramica") would be a note nobody ever sees. A note for
    # a family that only the official bundle (D-102) brings has to widen this.
    seed_slugs = {c["slug"] for c in CLASSES}
    orphans = set(load_notes()) - seed_slugs
    assert not orphans, f"notas para famílias que o catálogo não tem: {sorted(orphans)}"


def test_shipped_notes_are_drafts_in_ptbr_with_license() -> None:
    for note in load_notes().values():
        assert note.lang == "pt-BR"
        assert note.license == LICENSE
        # D-151: nada sai como revisado sem edição do autor.
        assert note.review_status == "rascunho"


def test_file_loads_without_database(monkeypatch: pytest.MonkeyPatch) -> None:
    # Pure content: no session, no engine, no network.
    import app.db.base as db_base

    def _boom(*_a: object, **_k: object) -> None:
        raise AssertionError("as notas de família não podem abrir sessão de banco")

    monkeypatch.setattr(db_base, "get_db", _boom)
    monkeypatch.setattr(socket, "socket", _boom)
    raw = json.loads(NOTES_PATH.read_text(encoding="utf-8"))
    assert len(parse_notes(raw)) == len(raw)


# --- HTTP --------------------------------------------------------------------

FIELDS = {
    "slug",
    "summary",
    "body",
    "when_to_use",
    "watch_out",
    "reference",
    "license",
    "review_status",
    "lang",
}


def test_list_endpoint_returns_notes_in_slug_order(client) -> None:
    response = client.get("/api/familias/notas")
    assert response.status_code == 200
    body = response.json()
    slugs = [n["slug"] for n in body]
    assert slugs == sorted(slugs)
    assert {"metais", "elastomeros"} <= set(slugs)
    assert all(n["review_status"] == "rascunho" for n in body)
    assert all(set(n) == FIELDS for n in body)


def test_get_endpoint_returns_one_note(client) -> None:
    response = client.get("/api/familias/notas/ceramicas")
    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "ceramicas"
    assert body["license"] == LICENSE
    assert isinstance(body["body"], list) and body["body"]
    assert set(body) == FIELDS


def test_missing_note_is_a_written_404_naming_the_slug(client) -> None:
    response = client.get("/api/familias/notas/madeiras-demo")
    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Sem nota para a família" in detail
    assert "madeiras-demo" in detail


def test_access_rule_matches_class_list(client_without_subscription) -> None:
    notes = client_without_subscription.get("/api/familias/notas").status_code
    classes = client_without_subscription.get("/api/classes").status_code
    assert notes == classes


def test_requires_login(anon_client) -> None:
    assert anon_client.get("/api/familias/notas").status_code == 401
    assert anon_client.get("/api/familias/notas/metais").status_code == 401
