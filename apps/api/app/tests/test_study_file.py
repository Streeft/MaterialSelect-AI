"""Notes on a study and its stages, and the versioned study file (D-122).

The file is data and nothing else: these tests pin that it round-trips to the
same answer, that a stranger's file is bounded and validated before anything is
created, and that nobody's study leaves the project it belongs to.
"""

from __future__ import annotations

import json

import pytest

from app.schemas.selection import clean_note
from app.services.study_file import (
    MAX_STUDY_FILE_BYTES,
    STUDY_FILE_FORMAT,
    STUDY_FILE_VERSION,
    filename_stem,
)

STUDIES = "/api/selection/studies"


def _payload(name: str = "Haste com notas", **extra) -> dict:
    payload = {
        "name": name,
        "universe": "material",
        "stages": [
            {
                "kind": "limit",
                "label": "Densidade",
                "notes": "Limite vindo do enunciado.\nSegunda linha com E < 70 GPa.",
                "root_group": {
                    "operator": "AND",
                    "constraints": [
                        {
                            "operator": "lte",
                            "property_slug": "densidade",
                            "value": 5,
                            "unit": "g/cm**3",
                        }
                    ],
                },
            },
            {"kind": "limit", "enabled": False, "root_group": {"operator": "AND"}},
        ],
        "index": {"name": "Rigidez específica", "expression": "modulo_young / densidade"},
        "criteria": [{"key": "__index__", "weight": 1.0}],
        "notes": "Estudo da aula 3.",
    }
    payload.update(extra)
    return payload


def _body(client, name: str = "Haste com notas") -> dict:
    created = client.post(STUDIES, json=_payload(name))
    assert created.status_code == 201, created.text
    return created.json()


def _exported(client, study_id: int) -> dict:
    response = client.get(f"{STUDIES}/{study_id}/export")
    assert response.status_code == 200
    return json.loads(response.content)


# --- notes ------------------------------------------------------------------


def test_notes_round_trip_on_the_study_and_on_each_stage(client):
    study = _body(client)
    fetched = client.get(f"{STUDIES}/{study['id']}").json()
    assert fetched["notes"] == "Estudo da aula 3."
    assert fetched["stages"][0]["notes"].startswith("Limite vindo do enunciado.")
    assert "E < 70 GPa" in fetched["stages"][0]["notes"]
    # a stage nobody wrote a note on is None, never an empty string
    assert fetched["stages"][1]["notes"] is None


def test_the_listing_says_whether_a_study_has_notes(client):
    client.post(STUDIES, json=_payload("Com nota"))
    bare = _payload("Sem nota", notes=None)
    for stage in bare["stages"]:
        stage.pop("notes", None)
    client.post(STUDIES, json=bare)
    listing = {s["name"]: s["has_notes"] for s in client.get(STUDIES).json()}
    assert listing == {"Com nota": True, "Sem nota": False}


@pytest.mark.parametrize(
    ("raw", "stored"),
    [
        ("  texto  ", "texto"),
        ("", None),
        ("   \n  ", None),
        ("a\x00b\x1b[31mc", "ab[31mc"),
        ("linha 1\r\nlinha 2", "linha 1\nlinha 2"),
        ("<b>negrito</b> & E < 70", "<b>negrito</b> & E < 70"),
    ],
)
def test_a_note_is_canonical_plain_text(raw, stored):
    # Markup is kept as the characters the author typed — nothing renders it.
    assert clean_note(raw) == stored


def test_a_note_over_the_limit_is_refused(client):
    response = client.post(STUDIES, json=_payload(notes="x" * 2001))
    assert response.status_code == 422


# --- export -----------------------------------------------------------------


def test_export_is_a_versioned_json_attachment_with_the_limitation_notice(client):
    study = _body(client)
    response = client.get(f"{STUDIES}/{study['id']}/export")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.headers["x-content-type-options"] == "nosniff"
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment;") and "estudo-haste-com-notas.json" in disposition
    document = json.loads(response.content)
    assert document["format"] == STUDY_FILE_FORMAT
    assert document["version"] == STUDY_FILE_VERSION
    assert document["notice"] is None  # D-138: no usage-limitation notice
    assert document["study"]["notes"] == "Estudo da aula 3."
    # nothing the engine computed, and no ids, travel in the file
    assert "id" not in document["study"] and "created_at" not in document["study"]
    assert "position" not in document["study"]["stages"][0]


def test_export_of_another_users_study_is_a_404(client, other_user, login_as):
    study = _body(client)
    with login_as(other_user):
        assert client.get(f"{STUDIES}/{study['id']}/export").status_code == 404


def test_export_requires_login(anon_client):
    assert anon_client.get(f"{STUDIES}/1/export").status_code == 401
    assert anon_client.post(f"{STUDIES}/import", content=b"{}").status_code == 401


def test_filename_stem_is_ascii():
    assert filename_stem("Haste leve é rígida!") == "estudo-haste-leve-e-rigida"
    assert filename_stem("???") == "estudo-sem-nome"


# --- import -----------------------------------------------------------------


def _import(client, document: dict | bytes):
    content = document if isinstance(document, bytes) else json.dumps(document).encode()
    return client.post(
        f"{STUDIES}/import", content=content, headers={"content-type": "application/json"}
    )


def test_an_exported_study_imports_and_reruns_to_the_same_answer(client, other_user, login_as):
    study = _body(client)
    document = _exported(client, study["id"])
    original_run = client.post(f"{STUDIES}/{study['id']}/run").json()

    with login_as(other_user):
        imported = _import(client, document)
        assert imported.status_code == 201, imported.text
        body = imported.json()
        assert body["name"] == "Haste com notas"  # a different project: no clash
        assert body["notes"] == "Estudo da aula 3."
        assert body["stages"][0]["notes"].startswith("Limite")
        assert body["stages"][1]["enabled"] is False
        rerun = client.post(f"{STUDIES}/{body['id']}/run").json()

    assert rerun["final_count"] == original_run["final_count"]
    assert [c["record_id"] for c in rerun["candidates"]] == [
        c["record_id"] for c in original_run["candidates"]
    ]
    assert [r["record_id"] for r in rerun["ranking"]["ranked"]] == [
        r["record_id"] for r in original_run["ranking"]["ranked"]
    ]


def test_importing_into_the_same_project_never_overwrites(client):
    study = _body(client)
    document = _exported(client, study["id"])
    first = _import(client, document).json()
    second = _import(client, document).json()
    assert first["name"] == "Haste com notas (importado)"
    assert second["name"] == "Haste com notas (importado 2)"
    assert len(client.get(STUDIES).json()) == 3


@pytest.mark.parametrize(
    ("mutate", "fragment"),
    [
        (lambda d: d.update(format="outro"), "não é um estudo"),
        (lambda d: d.update(version=2), "mais nova"),
        (lambda d: d.update(version="1"), "versão"),
        (lambda d: d.update(version=True), "versão"),
        (lambda d: d.update(extra=1), "«extra»"),
        (lambda d: d["study"].update(hack="x"), "desconhecidos: study.hack"),
        (
            lambda d: d["study"]["stages"][0].update(shell="rm -rf /"),
            "study.stages[0].shell",
        ),
        (
            lambda d: d["study"]["stages"][0]["root_group"]["constraints"][0].update(zz=1),
            "root_group.constraints[0].zz",
        ),
        (lambda d: d["study"].pop("name"), "study.name"),
        (lambda d: d["study"].update(notes="x" * 3000), "notes"),
        (lambda d: d["study"].update(method="eval"), "method"),
    ],
)
def test_a_malformed_or_stray_file_is_refused_and_creates_nothing(client, mutate, fragment):
    study = _body(client)
    document = _exported(client, study["id"])
    mutate(document)
    response = _import(client, document)
    assert response.status_code == 400
    assert fragment in response.json()["detail"]
    assert len(client.get(STUDIES).json()) == 1


@pytest.mark.parametrize("body", [b"", b"nao json", b"[1, 2]", b"\xff\xfe", b'"texto"'])
def test_a_body_that_is_not_a_study_object_is_a_400(client, body):
    assert _import(client, body).status_code == 400


def test_a_deeply_nested_file_is_a_400_not_a_crash(client):
    deep = b"[" * 50000 + b"]" * 50000
    assert _import(client, deep).status_code == 400


def test_a_file_over_the_ceiling_is_refused_with_413(client):
    big = b'{"format": "' + b"x" * (MAX_STUDY_FILE_BYTES + 10) + b'"}'
    assert _import(client, big).status_code == 413


def test_the_file_is_checked_against_the_importers_catalogue(client):
    study = _body(client)
    document = _exported(client, study["id"])
    document["study"]["stages"][0]["root_group"]["constraints"][0]["property_slug"] = "nao_existe"
    response = _import(client, document)
    assert response.status_code in (400, 404)
    assert "nao_existe" in response.json()["detail"]
    assert len(client.get(STUDIES).json()) == 1


def test_a_note_with_markup_is_stored_as_typed_and_never_rendered(client):
    payload = _payload("Com marcação", notes="<script>alert(1)</script>")
    created = client.post(STUDIES, json=payload).json()
    assert created["notes"] == "<script>alert(1)</script>"
    # the export is JSON served as an attachment with nosniff, not markup
    response = client.get(f"{STUDIES}/{created['id']}/export")
    assert response.headers["content-type"].startswith("application/json")
    assert "attachment" in response.headers["content-disposition"]
