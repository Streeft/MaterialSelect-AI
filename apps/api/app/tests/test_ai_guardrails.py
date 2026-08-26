"""Tests for the limits placed on any AI provider's output.

These are the rules that turn "the AI does not invent numbers" from a promise
into a property of the code, so they are tested against hostile output, not just
the simulated provider's well-behaved output.
"""

from __future__ import annotations

import pytest

from app.ai.guardrails import (
    Catalogue,
    check_chart,
    check_constraint,
    check_index,
    check_property,
    is_grounded,
    numbers_in,
    ungrounded_numbers,
    units_compatible,
)
from app.schemas.selection import ConstraintIn

CATALOGUE = Catalogue(
    properties={
        "densidade": "kg/m**3",
        "modulo_young": "Pa",
        "temp_max_servico": "kelvin",
    },
    class_slugs={"metais", "polimeros"},
    index_slugs={"rigidez-especifica", "viga-leve-rigidez"},
)


class TestNumberExtraction:
    def test_plain_integers_and_decimals(self) -> None:
        assert numbers_in("300 e 2.5") >= {300.0, 2.5}

    def test_decimal_comma(self) -> None:
        assert 2.7 in numbers_in("densidade de 2,7 g/cm3")

    def test_scientific_notation(self) -> None:
        assert 1.2e3 in numbers_in("cerca de 1.2e3 Pa")

    def test_grouped_thousands_read_both_ways(self) -> None:
        # "1.500" is 1500 in pt-BR and 1.5 in en-US; the statement does not say
        # which, so both readings ground.
        found = numbers_in("resistência de 1.500 MPa")
        assert 1500.0 in found
        assert 1.5 in found

    def test_negative_numbers(self) -> None:
        assert -40.0 in numbers_in("temperatura de -40 °C")

    def test_no_numbers(self) -> None:
        assert numbers_in("um componente leve e rígido") == set()

    def test_empty_text(self) -> None:
        assert numbers_in("") == set()


class TestGrounding:
    def test_exact_match_grounds(self) -> None:
        assert is_grounded(300.0, {300.0, 2.5})

    def test_near_miss_does_not_ground(self) -> None:
        assert not is_grounded(301.0, {300.0})


class TestUngroundedNumbers:
    def test_prose_may_repeat_computed_figures(self) -> None:
        assert ungrounded_numbers("A pontuação foi 0.847.", {0.847}) == []

    def test_prose_may_not_introduce_a_measurement(self) -> None:
        assert ungrounded_numbers("O módulo é 210,5 GPa.", {0.847}) == [210.5]

    def test_small_integers_are_exempt_as_counts(self) -> None:
        # "3 de 5 candidatos", "1º colocado" describe the result's shape.
        assert ungrounded_numbers("3 de 5 candidatos; o 1º é o melhor.", set()) == []

    def test_large_round_number_is_not_exempt(self) -> None:
        assert 1500.0 in ungrounded_numbers("cerca de 1500 MPa", set())


class TestEntityChecks:
    def test_known_property_passes(self) -> None:
        assert check_property("densidade", CATALOGUE) is None

    def test_invented_property_is_rejected(self) -> None:
        reason = check_property("tenacidade_fratura", CATALOGUE)
        assert reason and "não existe" in reason

    def test_known_index_passes(self) -> None:
        assert check_index("rigidez-especifica", CATALOGUE) is None

    def test_invented_index_is_rejected(self) -> None:
        # The layer selects from the catalogue; it never authors an expression.
        assert check_index("indice-inventado", CATALOGUE) is not None

    def test_chart_axes_must_exist(self) -> None:
        assert check_chart("densidade", "modulo_young", CATALOGUE) is None
        assert check_chart("densidade", "inexistente", CATALOGUE) is not None

    def test_chart_rejects_the_same_property_twice(self) -> None:
        assert check_chart("densidade", "densidade", CATALOGUE) is not None


class TestUnitCompatibility:
    def test_convertible_unit(self) -> None:
        assert units_compatible("g/cm**3", "kg/m**3")

    def test_incompatible_dimension(self) -> None:
        assert not units_compatible("meter", "kg/m**3")

    def test_unknown_unit(self) -> None:
        assert not units_compatible("bananas", "Pa")


class TestConstraintChecks:
    STATEMENT = "Viga leve com temperatura de serviço no mínimo 300 °C e módulo acima de 70 GPa."

    def _check(self, **kwargs) -> str | None:
        return check_constraint(ConstraintIn(**kwargs), self.STATEMENT, CATALOGUE)

    def test_grounded_threshold_passes(self) -> None:
        assert (
            self._check(operator="gte", property_slug="temp_max_servico", value=300.0, unit="degC")
            is None
        )

    def test_number_absent_from_the_statement_is_rejected(self) -> None:
        reason = self._check(
            operator="gte", property_slug="temp_max_servico", value=450.0, unit="degC"
        )
        assert reason and "não aparece no enunciado" in reason

    def test_correct_conversion_is_still_rejected(self) -> None:
        # 300 °C really is 573.15 K, but converting is the backend's job: only it
        # records the conversion trail. The AI must quote the user's own number.
        reason = self._check(
            operator="gte", property_slug="temp_max_servico", value=573.15, unit="kelvin"
        )
        assert reason and "não aparece no enunciado" in reason

    def test_dimensioned_threshold_without_a_unit_is_rejected(self) -> None:
        # Downstream an absent unit means "already canonical". On an offset
        # scale that reverses the statement: "no mínimo 300 °C" would become
        # ≥ 300 K, i.e. −173 °C, which constrains nothing.
        reason = self._check(operator="gte", property_slug="temp_max_servico", value=300.0)
        assert reason and "não indica a unidade" in reason

    def test_dimensionless_property_needs_no_unit(self) -> None:
        catalogue = Catalogue(
            properties={"dureza": "dimensionless"},
            class_slugs=set(),
            index_slugs=set(),
        )
        assert (
            check_constraint(
                ConstraintIn(operator="gte", property_slug="dureza", value=300.0),
                self.STATEMENT,
                catalogue,
            )
            is None
        )

    def test_incompatible_unit_is_rejected(self) -> None:
        reason = self._check(
            operator="gte", property_slug="temp_max_servico", value=300.0, unit="GPa"
        )
        assert reason and "incompatível" in reason

    def test_unknown_property_is_rejected(self) -> None:
        reason = self._check(operator="gt", property_slug="tenacidade", value=300.0)
        assert reason and "não existe no catálogo" in reason

    def test_numeric_operator_without_a_value_is_rejected(self) -> None:
        assert self._check(operator="gt", property_slug="densidade") is not None

    def test_range_requires_both_ends(self) -> None:
        assert (
            self._check(operator="between", property_slug="modulo_young", value_min=70.0)
            is not None
        )

    def test_range_with_both_ends_grounded_passes(self) -> None:
        assert (
            check_constraint(
                ConstraintIn(
                    operator="between",
                    property_slug="modulo_young",
                    value_min=70.0,
                    value_max=300.0,
                    unit="GPa",
                ),
                self.STATEMENT,
                CATALOGUE,
            )
            is None
        )

    def test_existence_operator_needs_no_number(self) -> None:
        assert self._check(operator="exists", property_slug="densidade") is None

    def test_known_class_passes(self) -> None:
        assert self._check(operator="in_class", class_slugs=["metais"]) is None

    def test_invented_class_is_rejected(self) -> None:
        reason = self._check(operator="in_class", class_slugs=["ligas-magicas"])
        assert reason and "não existem" in reason

    def test_class_constraint_without_classes_is_rejected(self) -> None:
        assert self._check(operator="in_class", class_slugs=[]) is not None

    def test_text_constraint_needs_a_term(self) -> None:
        assert self._check(operator="text_contains", text="   ") is not None
        assert self._check(operator="text_contains", text="aeroespacial") is None

    @pytest.mark.parametrize("operator", ["gt", "gte", "lt", "lte"])
    def test_every_threshold_operator_is_grounded(self, operator: str) -> None:
        assert (
            self._check(operator=operator, property_slug="modulo_young", value=70.0, unit="GPa")
            is None
        )
        assert (
            self._check(operator=operator, property_slug="modulo_young", value=999.0, unit="GPa")
            is not None
        )


class TestCheckCitations:
    def test_valid_indices_pass_through(self) -> None:
        from app.ai.guardrails import check_citations
        from app.knowledge.retrieval import RetrievedChunk
        from app.models.enums import DocumentKind, SourceAuthority

        chunk = RetrievedChunk(
            document_title="Livro",
            document_kind=DocumentKind.LIVRO,
            document_authority=SourceAuthority.CIENTIFICA,
            page_start=1,
            page_end=1,
            text="x",
            score=1.0,
        )
        assert check_citations([1], (chunk,)) == [1]

    def test_index_out_of_range_is_dropped(self) -> None:
        from app.ai.guardrails import check_citations

        assert check_citations([1, 2, 99], ()) == []

    def test_zero_and_negative_indices_are_dropped(self) -> None:
        from app.ai.guardrails import check_citations
        from app.knowledge.retrieval import RetrievedChunk
        from app.models.enums import DocumentKind, SourceAuthority

        chunk = RetrievedChunk(
            document_title="x",
            document_kind=DocumentKind.OUTRO,
            document_authority=SourceAuthority.NAO_VERIFICADA,
            page_start=None,
            page_end=None,
            text="x",
            score=1.0,
        )
        assert check_citations([0, -1, 1], (chunk,)) == [1]

    def test_empty_input_is_empty_output(self) -> None:
        from app.ai.guardrails import check_citations

        assert check_citations([], ()) == []
