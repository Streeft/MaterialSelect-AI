"""Tests for the export layer.

The central case is formula injection. A material name is free text that can
arrive through the import wizard or the manual form; if it leaves in a CSV
unescaped, opening that file runs it. The test therefore stores a hostile name
through the real API and reads it back out of a real export.
"""

from __future__ import annotations

import csv
import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

from app.exporters.cells import format_number, is_dangerous, safe_number, safe_text
from app.exporters.report import (
    DEMO_DATA_NOTICE,
    LIMITATION_NOTICE,
    Report,
    Sheet,
    standard_notices,
)
from app.exporters.spreadsheet import to_csv, to_xlsx

HOSTILE_NAMES = [
    "=cmd|'/c calc'!A1",
    "+1+1",
    "-2+3",
    "@SUM(A1:A9)",
    '=HYPERLINK("http://exemplo","clique")',
]


class TestCellSafety:
    @pytest.mark.parametrize("name", HOSTILE_NAMES)
    def test_formula_prefixes_are_detected(self, name: str) -> None:
        assert is_dangerous(name)

    @pytest.mark.parametrize("name", HOSTILE_NAMES)
    def test_dangerous_text_is_marked_as_literal(self, name: str) -> None:
        escaped = safe_text(name)
        assert escaped.startswith("'")
        # Escaping is visible, not destructive: the original survives intact.
        assert escaped[1:] == name

    def test_ordinary_text_is_untouched(self) -> None:
        assert safe_text("Aço Demo B") == "Aço Demo B"

    def test_none_becomes_an_empty_cell(self) -> None:
        assert safe_text(None) == ""

    def test_negative_numbers_stay_numeric(self) -> None:
        # A numeric cell is never parsed as a formula, and escaping it would
        # make arithmetic in the exported sheet impossible.
        assert safe_number(-40.5) == -40.5

    def test_missing_number_is_a_word_not_a_zero(self) -> None:
        assert format_number(None) == "ausente"
        assert format_number(None, missing="indefinido") == "indefinido"

    def test_integers_render_without_a_decimal_tail(self) -> None:
        assert format_number(2700.0) == "2700"


class TestNotices:
    def test_limitation_notice_is_always_present(self) -> None:
        assert LIMITATION_NOTICE in standard_notices(includes_demo_data=False)

    def test_demo_warning_comes_first_when_it_applies(self) -> None:
        notices = standard_notices(includes_demo_data=True)
        assert notices[0] == DEMO_DATA_NOTICE

    def test_no_demo_warning_when_no_demo_data(self) -> None:
        assert DEMO_DATA_NOTICE not in standard_notices(includes_demo_data=False)


def _report() -> Report:
    return Report(
        title="Relatório de teste",
        subtitle="subtítulo",
        notices=standard_notices(includes_demo_data=True),
        sheets=[
            Sheet(
                name="Dados",
                header=["Material", "Valor"],
                rows=[["=SOMA(A1)", 2700.0], ["Aço Demo B", None]],
                notes=["uma observação"],
            )
        ],
    )


class TestCsvRendering:
    def test_hostile_cell_is_escaped(self) -> None:
        assert "'=SOMA(A1)" in to_csv(_report())

    def test_notices_are_written_before_the_data(self) -> None:
        text = to_csv(_report())
        assert text.index(LIMITATION_NOTICE) < text.index("Material")

    def test_starts_with_a_bom_so_excel_reads_utf8(self) -> None:
        # Without it Excel on Windows renders "Relatório" as "RelatÃ³rio".
        assert to_csv(_report()).startswith("﻿")

    def test_is_parseable_and_keeps_the_header(self) -> None:
        rows = list(csv.reader(io.StringIO(to_csv(_report()).lstrip("﻿"))))
        assert ["Material", "Valor"] in rows


class TestXlsxRendering:
    def test_workbook_has_a_notice_cover_plus_each_sheet(self) -> None:
        workbook = load_workbook(io.BytesIO(to_xlsx(_report())))
        assert workbook.sheetnames == ["Aviso", "Dados"]

    def test_hostile_cell_is_escaped_in_xlsx_too(self) -> None:
        workbook = load_workbook(io.BytesIO(to_xlsx(_report())))
        values = [cell.value for row in workbook["Dados"].iter_rows() for cell in row]
        assert "'=SOMA(A1)" in values
        assert "=SOMA(A1)" not in values

    def test_numbers_stay_numbers(self) -> None:
        workbook = load_workbook(io.BytesIO(to_xlsx(_report())))
        values = [cell.value for row in workbook["Dados"].iter_rows() for cell in row]
        assert 2700.0 in values

    def test_sheet_names_are_made_excel_legal(self) -> None:
        report = _report()
        report.sheets.append(Sheet(name="Inválido: nome/com*chars", header=["a"], rows=[]))
        workbook = load_workbook(io.BytesIO(to_xlsx(report)))
        assert all(not set(name) & set(":\\/?*[]") for name in workbook.sheetnames)


class TestCatalogueExport:
    def test_csv_export_succeeds(self, client: TestClient) -> None:
        response = client.get("/api/exports/catalogo.csv")
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/csv")
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "attachment" in response.headers["content-disposition"]

    def test_csv_carries_the_mandatory_notices(self, client: TestClient) -> None:
        text = client.get("/api/exports/catalogo.csv").text
        assert LIMITATION_NOTICE in text
        assert DEMO_DATA_NOTICE in text  # the seeded catalogue is demo data

    def test_missing_value_is_reported_as_absent(self, client: TestClient) -> None:
        # Cerâmica Demo D has an explicitly missing thermal conductivity.
        text = client.get("/api/exports/catalogo.csv").text
        assert "ausente" in text

    def test_xlsx_export_is_a_real_workbook(self, client: TestClient) -> None:
        response = client.get("/api/exports/catalogo.xlsx")
        assert response.status_code == 200
        workbook = load_workbook(io.BytesIO(response.content))
        assert "Materiais" in workbook.sheetnames
        assert "Proveniência" in workbook.sheetnames

    def test_provenance_records_the_conversion_trail(self, client: TestClient) -> None:
        text = client.get("/api/exports/catalogo.csv").text
        assert "pint:GPa->Pa" in text

    def test_unsupported_format_is_rejected(self, client: TestClient) -> None:
        assert client.get("/api/exports/catalogo.pdf").status_code == 400

    def test_a_hostile_material_name_cannot_escape_as_a_formula(self, client: TestClient) -> None:
        created = client.post(
            "/api/materials",
            json={
                "name": "=cmd|'/c calc'!A1",
                "class_id": 1,
                "keywords": [],
                "values": [
                    {
                        "property_slug": "densidade",
                        "kind": "scalar",
                        "value": 1000.0,
                        "unit": "kg/m**3",
                        "data_quality": "ESTIMADO",
                    }
                ],
            },
        )
        assert created.status_code == 201, created.text

        text = client.get("/api/exports/catalogo.csv").text
        assert "'=cmd|'/c calc'!A1" in text or "\"'=cmd|'/c calc'!A1\"" in text
        # The unescaped form must not appear at the start of any field.
        rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
        assert not any(
            isinstance(cell, str) and cell.startswith("=") for row in rows for cell in row
        )


class TestStudyExport:
    def _study_id(self, client: TestClient) -> int:
        response = client.post(
            "/api/selection/studies",
            json={
                "name": "Estudo exportável",
                "function_text": "Viga em flexão",
                "objective_text": "Minimizar massa",
                "free_variables": ["espessura"],
                "combinator": "AND",
                "constraints": [
                    {"operator": "gt", "property_slug": "modulo_young", "value": 1.0, "unit": "GPa"}
                ],
                "index": {
                    "name": "Viga leve",
                    "expression": "sqrt(modulo_young) / densidade",
                    "goal": "maximize",
                },
                "normalization": "minmax",
                "criteria": [
                    {"key": "__index__", "weight": 2.0},
                    {"key": "densidade", "weight": 1.0},
                ],
            },
        )
        assert response.status_code == 201, response.text
        return response.json()["id"]

    def test_report_contains_every_audit_section(self, client: TestClient) -> None:
        response = client.get(f"/api/exports/estudos/{self._study_id(client)}.xlsx")
        assert response.status_code == 200, response.text
        names = load_workbook(io.BytesIO(response.content)).sheetnames
        for expected in [
            "Aviso",
            "Problema",
            "Restrições e funil",
            "Candidatos",
            "Índice de desempenho",
            "Contribuições",
            "Excluídos por dado ausente",
            "Sensibilidade",
            "Proveniência",
        ]:
            assert expected in names, f"faltou a aba '{expected}' em {names}"

    def test_csv_report_states_the_derived_dimension(self, client: TestClient) -> None:
        text = client.get(f"/api/exports/estudos/{self._study_id(client)}.csv").text
        assert "Dimensão (derivada)" in text
        assert "[length]" in text

    def test_report_records_the_funnel(self, client: TestClient) -> None:
        text = client.get(f"/api/exports/estudos/{self._study_id(client)}.csv").text
        assert "Restrições e funil" in text
        assert "Módulo de Young" in text

    def test_report_carries_the_limitation_notice(self, client: TestClient) -> None:
        text = client.get(f"/api/exports/estudos/{self._study_id(client)}.csv").text
        assert LIMITATION_NOTICE in text

    def test_provenance_lists_the_properties_the_decision_used(self, client: TestClient) -> None:
        text = client.get(f"/api/exports/estudos/{self._study_id(client)}.csv").text
        provenance = text.split("Proveniência")[-1]
        assert "Densidade" in provenance
        assert "Módulo de Young" in provenance

    def test_filename_is_ascii_safe(self, client: TestClient) -> None:
        response = client.get(f"/api/exports/estudos/{self._study_id(client)}.csv")
        disposition = response.headers["content-disposition"]
        plain = disposition.split('filename="')[1].split('"')[0]
        assert plain.isascii()
        assert "filename*=UTF-8''" in disposition

    def test_unknown_study_is_404(self, client: TestClient) -> None:
        assert client.get("/api/exports/estudos/999999.csv").status_code == 404
