"""The ABNT reference of a source (D-233): built in the backend, from recorded fields only.

The rule behind every test below is the project's third principle applied to a
bibliography: a part nobody recorded is **left out**, never filled in. No author
becomes "Anônimo", no year becomes "s.d." or an estimated date, no place becomes
"[S. l.]". What the reference says is what the source record says.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.domain.citation import SourceParts, abnt_reference
from app.models.source import Source


def _parts(**over) -> SourceParts:
    base = dict(
        label="Fonte de teste",
        authors=None,
        title=None,
        publisher=None,
        year=None,
        url=None,
        accessed_on=None,
        reference=None,
    )
    base.update(over)
    return SourceParts(**base)


def test_a_complete_record_follows_the_abnt_element_order():
    parts = _parts(
        authors="ASHBY, Michael F.",
        title="Materials selection in mechanical design",
        publisher="Butterworth-Heinemann",
        year=2011,
        url="https://exemplo.org/livro",
        accessed_on=date(2026, 11, 13),
    )
    assert abnt_reference(parts) == (
        "ASHBY, Michael F. Materials selection in mechanical design. "
        "Butterworth-Heinemann, 2011. "
        "Disponível em: https://exemplo.org/livro. Acesso em: 13 nov. 2026."
    )


def test_without_a_title_the_label_stands_in_as_the_title():
    # A source always has a label; it is the name the catalogue calls it by.
    assert abnt_reference(_parts(authors="NIST.", label="Base de dados do NIST")) == (
        "NIST. Base de dados do NIST."
    )


def test_without_an_author_the_entry_is_the_title_with_its_first_word_in_capitals():
    parts = _parts(title="Propriedades de ligas de alumínio", year=2020)
    assert abnt_reference(parts) == "PROPRIEDADES de ligas de alumínio. 2020."


def test_an_article_takes_the_next_word_with_it_in_the_entry():
    parts = _parts(title="A ciência dos materiais")
    assert abnt_reference(parts) == "A CIÊNCIA dos materiais."


def test_a_missing_year_is_left_out_not_written_as_sd():
    text = abnt_reference(_parts(authors="SILVA, A.", title="Livro", publisher="Editora X"))
    assert text == "SILVA, A. Livro. Editora X."
    assert "s.d." not in text and "[s. d.]" not in text


def test_a_missing_publisher_is_left_out_not_written_as_sn():
    text = abnt_reference(_parts(authors="SILVA, A.", title="Livro", year=2019))
    assert text == "SILVA, A. Livro. 2019."
    assert "s. n." not in text and "S. l." not in text


def test_a_missing_author_is_never_replaced_by_anonymous():
    text = abnt_reference(_parts(title="Tabela de propriedades"))
    assert "nônimo" not in text and "Autor" not in text


def test_the_access_date_needs_an_address_and_is_dropped_without_one():
    # "Acesso em" qualifies a "Disponível em"; alone it would cite nothing.
    text = abnt_reference(_parts(title="Livro", accessed_on=date(2026, 1, 5)))
    assert "Acesso em" not in text


def test_an_address_without_an_access_date_does_not_invent_one():
    text = abnt_reference(_parts(title="Livro", url="https://exemplo.org"))
    assert text == "LIVRO. Disponível em: https://exemplo.org."
    assert "Acesso" not in text


@pytest.mark.parametrize(
    ("month", "abbreviation"),
    [
        (1, "jan."),
        (2, "fev."),
        (3, "mar."),
        (4, "abr."),
        (5, "maio"),
        (6, "jun."),
        (7, "jul."),
        (8, "ago."),
        (9, "set."),
        (10, "out."),
        (11, "nov."),
        (12, "dez."),
    ],
)
def test_months_are_abbreviated_the_abnt_way(month, abbreviation):
    text = abnt_reference(
        _parts(title="Livro", url="https://x.org", accessed_on=date(2026, month, 2))
    )
    assert text.endswith(f"Acesso em: 2 {abbreviation} 2026.")


def test_the_free_text_reference_is_kept_verbatim_after_the_publication_data():
    parts = _parts(
        authors="ASHBY, M.",
        title="Livro",
        year=2011,
        reference="Tabela 4.1, p. 62",
    )
    assert abnt_reference(parts) == "ASHBY, M. Livro. 2011. Tabela 4.1, p. 62."


def test_no_double_full_stop_when_a_part_already_ends_with_punctuation():
    parts = _parts(authors="SILVA, A. et al.", title="Será?", year=2020)
    assert abnt_reference(parts) == "SILVA, A. et al. Será? 2020."


def test_the_same_record_always_gives_the_same_text():
    parts = _parts(authors="ASHBY, M.", title="Livro", year=2011, publisher="Elsevier")
    assert abnt_reference(parts) == abnt_reference(parts)


def test_parts_are_read_from_a_source_row_without_inventing_any():
    source = Source(label="Dataset X", reference=None, is_demo=False)
    parts = SourceParts.from_source(source)
    assert parts.label == "Dataset X"
    assert (parts.authors, parts.title, parts.publisher, parts.year) == (None, None, None, None)
    assert abnt_reference(parts) == "DATASET X."


def test_blank_strings_count_as_absent():
    parts = _parts(authors="  ", title="  ", publisher="", url=" ", reference="  ", label="Rótulo")
    assert abnt_reference(parts) == "RÓTULO."


# --- The sheet's contract -----------------------------------------------------


def _material_with_sources(client, db_session):
    """A catalogue material whose sheet names at least one source."""
    for item in client.get("/api/materials").json():
        sheet = client.get(f"/api/materials/{item['id']}").json()
        labels = {
            p["source_label"]
            for group in sheet["property_groups"]
            for p in group["properties"]
            if p["source_label"]
        }
        if labels:
            return sheet, labels
    raise AssertionError("no seeded material cites a source")


def test_the_sheet_lists_each_source_it_cites_once_with_its_abnt_text(client, db_session):
    sheet, labels = _material_with_sources(client, db_session)

    by_label = {s["label"]: s for s in sheet["sources"]}
    # Every label the sheet shows has an entry, and none is repeated.
    assert labels <= set(by_label)
    assert len(by_label) == len(sheet["sources"])
    for source in sheet["sources"]:
        assert source["abnt"]
        assert source["label"]


def test_the_structured_fields_reach_the_sheet_and_shape_the_abnt_text(client, db_session):
    sheet, labels = _material_with_sources(client, db_session)
    label = sorted(labels)[0]
    source = db_session.query(Source).filter(Source.label == label).one()
    source.authors = "ASHBY, Michael F."
    source.title = "Materials selection in mechanical design"
    source.publisher = "Butterworth-Heinemann"
    source.year = 2011
    source.url = "https://exemplo.org/livro"
    source.accessed_on = date(2026, 11, 13)
    db_session.commit()

    sheet = client.get(f"/api/materials/{sheet['id']}").json()
    entry = next(s for s in sheet["sources"] if s["label"] == label)
    assert entry["authors"] == "ASHBY, Michael F."
    assert entry["year"] == 2011
    assert entry["url"] == "https://exemplo.org/livro"
    assert entry["accessed_on"] == "2026-11-13"
    assert entry["abnt"].startswith("ASHBY, Michael F. Materials selection in mechanical design.")
    assert entry["abnt"].endswith("Acesso em: 13 nov. 2026.")


def test_a_source_with_nothing_recorded_gets_a_text_with_no_invented_part(client, db_session):
    sheet, labels = _material_with_sources(client, db_session)
    label = sorted(labels)[0]
    source = db_session.query(Source).filter(Source.label == label).one()
    for field in ("authors", "title", "publisher", "year", "url", "accessed_on"):
        setattr(source, field, None)
    db_session.commit()

    entry = next(
        s
        for s in client.get(f"/api/materials/{sheet['id']}").json()["sources"]
        if s["label"] == label
    )
    assert entry["authors"] is None and entry["year"] is None and entry["url"] is None
    assert "s.d." not in entry["abnt"] and "Acesso" not in entry["abnt"]
    assert entry["abnt"].startswith(label.split(" ")[0].upper())


def test_the_source_registry_exposes_the_same_fields(client, db_session):
    source = db_session.query(Source).first()
    source.year = 2020
    db_session.commit()
    rows = client.get("/api/sources").json()
    row = next(r for r in rows if r["id"] == source.id)
    assert row["year"] == 2020
    assert {"authors", "title", "publisher", "url", "accessed_on"} <= set(row)


# --- The official catalogue's manifest -----------------------------------------


def test_the_manifest_keys_are_read_only_when_well_formed():
    from app.catalog.importer import _bibliography

    meta = {
        "authors": " ASHBY, M. ",
        "title": "Livro",
        "publisher": "",
        "year": 2011,
        "url": 5,
        "accessed_on": "2026-11-13",
    }
    assert _bibliography(meta) == {
        "authors": "ASHBY, M.",
        "title": "Livro",
        "year": 2011,
        "accessed_on": date(2026, 11, 13),
    }
    # A year that is not a year, and a date that is not a date, are dropped, not coerced.
    assert _bibliography({"year": "2011", "accessed_on": "13/11/2026"}) == {}
    assert _bibliography({"year": True}) == {}
    assert _bibliography({}) == {}
