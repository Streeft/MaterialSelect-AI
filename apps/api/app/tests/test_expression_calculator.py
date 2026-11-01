"""The expression calculator (D-191): grammar extension, rendering and API.

Three layers, tested where they live:

* the grammar (``calculations/expressions``): the new functions and constants,
  their numeric and dimensional behaviour, and the position of every refusal;
* the rendering (``calculations/expression_render``): LaTeX and plain text
  from the AST, with friendly names, symbols, pt-BR numbers and escaping;
* the API (``/api/expressions``): palette from the catalogue and ``describe``
  answering 200 with written errors, agreeing with ``/selection/index``.
"""

from __future__ import annotations

import math

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.expression_render import (
    VariableLabel,
    escape_text,
    friendly_label,
    normalized,
    symbol_latex,
    to_latex,
    to_text,
    to_tree,
)
from app.calculations.expressions import (
    ExpressionError,
    evaluate,
    is_multiplicative,
    parse,
    result_dimension,
    result_unit,
    validate_names,
    variables_in,
)
from app.calculations.powerlaw import as_monomial, index_line
from app.models.material import Material

LABELS = {
    "modulo_young": VariableLabel("Módulo de Young", "E"),
    "densidade": VariableLabel("Densidade", "ρ"),
    "limite_escoamento": VariableLabel("Limite de escoamento", "σy"),
}
UNITS = {"E": "Pa", "rho": "kg/m**3", "s": "Pa"}


# --- grammar: new functions and constants ---------------------------------


@pytest.mark.parametrize(
    ("expression", "expected"),
    [
        ("sq(E)", 9.0),
        ("inv(E)", 1 / 3),
        ("pow(E, 2)", 9.0),
        ("pow(E, 1/2)", math.sqrt(3)),
        ("min(E, rho)", 2.0),
        ("max(E, rho, 7)", 7.0),
        ("ln(E)", math.log(3)),
        ("log10(E)", math.log10(3)),
        ("exp(rho)", math.exp(2)),
        ("pi * E", math.pi * 3),
        ("e ** rho", math.e**2),
    ],
)
def test_new_functions_and_constants_evaluate(expression: str, expected: float) -> None:
    assert evaluate(expression, {"E": 3.0, "rho": 2.0}) == pytest.approx(expected)


def test_constants_are_not_variables() -> None:
    assert variables_in("pi * E / e") == {"E"}
    assert validate_names("pi * E", {"E"}) == {"E"}


@pytest.mark.parametrize("expression", ["ln(E)", "log10(rho)", "exp(E)"])
def test_transcendental_of_a_dimension_is_refused(expression: str) -> None:
    with pytest.raises(ExpressionError, match="só aceita argumento adimensional"):
        result_dimension(expression, UNITS)


def test_transcendental_of_a_ratio_is_dimensionless() -> None:
    assert result_dimension("ln(E / s)", UNITS) == "dimensionless"
    # The dimension pass uses artificial unit magnitudes: ln(a - b) at a = b
    # would be ln(0), and that must not refuse a well-formed expression.
    assert result_dimension("ln(E / s - 1)", UNITS) == "dimensionless"


def test_ln_of_a_non_positive_value_is_undefined_for_that_material() -> None:
    with pytest.raises(ExpressionError, match="valores positivos"):
        evaluate("ln(E)", {"E": 0.0})
    with pytest.raises(ExpressionError, match="valores positivos"):
        evaluate("log10(E)", {"E": -1.0})


def test_min_of_different_dimensions_is_inconsistent() -> None:
    with pytest.raises(ExpressionError, match="dimensionalmente inconsistente"):
        result_dimension("min(E, rho)", UNITS)
    assert result_dimension("max(E, s)", UNITS) == "[mass] / [length] / [time] ** 2"


def test_exp_overflow_is_an_expression_error() -> None:
    with pytest.raises(ExpressionError, match="limite numérico"):
        evaluate("exp(E)", {"E": 1e6})


@pytest.mark.parametrize(
    ("expression", "message"),
    [
        ("sqrt(E, rho)", "exatamente um argumento"),
        ("pow(E)", "exatamente 2 argumentos"),
        ("min(E)", "de 2 a 8 argumentos"),
        ("round(E)", "Função não permitida"),
        ("E ^ 2", "use \\*\\*"),
    ],
)
def test_refusals_are_written_and_located(expression: str, message: str) -> None:
    with pytest.raises(ExpressionError, match=message) as info:
        parse(expression)
    assert info.value.start is not None
    assert info.value.end is not None and info.value.end > info.value.start


def test_syntax_errors_point_at_the_problem() -> None:
    with pytest.raises(ExpressionError, match="parêntese foi aberto") as unclosed:
        parse("sqrt(E / rho")
    assert unclosed.value.start == 4
    with pytest.raises(ExpressionError, match="sem o '\\(' correspondente") as unmatched:
        parse("E / rho)")
    assert unmatched.value.start == 7
    with pytest.raises(ExpressionError, match="termina incompleta") as incomplete:
        parse("E /")
    assert incomplete.value.start == 3


def test_unknown_variable_is_located_by_characters_not_bytes() -> None:
    # "ρ" is two UTF-8 bytes: a byte offset would point one character late.
    with pytest.raises(ExpressionError) as info:
        validate_names("ρ0 + foo", {"ρ0"})
    assert (info.value.start, info.value.end) == (5, 8)


def test_new_functions_keep_the_power_law_when_they_are_powers() -> None:
    monomial = as_monomial("sq(E) * inv(rho) * pow(s, 1/3) * pi")
    assert monomial.exponents == pytest.approx({"E": 2.0, "rho": -1.0, "s": 1 / 3})
    assert monomial.coefficient == pytest.approx(math.pi)
    assert index_line("pow(E, 0.5) / rho", "rho", "E").slope == pytest.approx(2.0)


@pytest.mark.parametrize("expression", ["ln(E / s)", "min(E, s) / rho", "exp(E / s)"])
def test_non_power_functions_over_properties_have_no_index_line(expression: str) -> None:
    with pytest.raises(ExpressionError, match="lei de potência"):
        as_monomial(expression)


def test_functions_over_constants_fold() -> None:
    assert as_monomial("E * ln(e) * max(1, 2)").coefficient == pytest.approx(2.0)


def test_multiplicative_reading_covers_the_new_functions() -> None:
    assert is_multiplicative("sq(E) * inv(rho)")
    assert not is_multiplicative("min(E, s) - s")


@pytest.mark.parametrize(
    ("expression", "unit"),
    [
        ("E / rho", "Pa*m**3/kg"),
        ("sqrt(E) / rho", "Pa**(1/2)*m**3/kg"),
        ("s ** (2/3) / rho", "Pa**(2/3)*m**3/kg"),
        ("E / s", "dimensionless"),
        ("inv(rho)", "m**3/kg"),
    ],
)
def test_result_unit_reads_like_a_canonical_unit(expression: str, unit: str) -> None:
    assert result_unit(expression, UNITS) == unit


# --- rendering ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("expression", "latex", "text"),
    [
        (
            "modulo_young / densidade",
            r"\frac{\text{Módulo de Young}}{\text{Densidade}}",
            "Módulo de Young / Densidade",
        ),
        (
            "sqrt(modulo_young) / densidade",
            r"\frac{\sqrt{\text{Módulo de Young}}}{\text{Densidade}}",
            "√(Módulo de Young) / Densidade",
        ),
        (
            "modulo_young ** (1/2) / densidade",
            r"\frac{\left(\text{Módulo de Young}\right)^{1/2}}{\text{Densidade}}",
            "(Módulo de Young)^(1/2) / Densidade",
        ),
        (
            "(modulo_young / densidade) ** 2",
            r"\left(\frac{\text{Módulo de Young}}{\text{Densidade}}\right)^{2}",
            "(Módulo de Young / Densidade)²",
        ),
        (
            "modulo_young - (densidade - 0.5)",
            r"\text{Módulo de Young} - \left(\text{Densidade} - 0{,}5\right)",
            "Módulo de Young − (Densidade − 0,5)",
        ),
        (
            "densidade / (modulo_young * densidade)",
            r"\frac{\text{Densidade}}{\text{Módulo de Young} \cdot \text{Densidade}}",
            "Densidade / (Módulo de Young × Densidade)",
        ),
        (
            "min(modulo_young, limite_escoamento) * pi",
            r"\min\left(\text{Módulo de Young};\ \text{Limite de escoamento}\right) \cdot \pi",
            "mín(Módulo de Young; Limite de escoamento) × π",
        ),
        ("1e-6 * densidade", r"10^{-6} \cdot \text{Densidade}", "10⁻⁶ × Densidade"),
    ],
)
def test_latex_and_text_use_friendly_names(expression: str, latex: str, text: str) -> None:
    assert to_latex(expression, LABELS) == latex
    assert to_text(expression, LABELS) == text


def test_symbol_rendering_follows_ashby() -> None:
    assert (
        to_latex("modulo_young ** (1/2) / densidade", LABELS, use_symbols=True)
        == r"\frac{E^{1/2}}{\rho}"
    )
    assert symbol_latex("σy") == r"\sigma_{\mathrm{y}}"
    assert symbol_latex("Tmax") == r"T_{\mathrm{max}}"
    assert symbol_latex("K_IC") == r"K_{\mathrm{IC}}"
    assert symbol_latex("HV") == r"\mathrm{HV}"
    assert symbol_latex("CO₂m") == r"\mathrm{CO_{2}m}"
    assert symbol_latex("ṅ") == r"\dot{n}"


def test_every_function_renders() -> None:
    labels = {"x": VariableLabel("X")}
    for expression, fragment in [
        ("cbrt(x)", r"\sqrt[3]{"),
        ("abs(x)", r"\left|"),
        ("sq(x)", "^{2}"),
        ("inv(x)", r"\frac{1}{"),
        ("pow(x, 3)", "^{3}"),
        ("ln(x)", r"\ln\left("),
        ("log10(x)", r"\log_{10}\left("),
        ("exp(x)", r"\mathrm{e}^{"),
        ("max(x, 1)", r"\max\left("),
        ("e * x", r"\mathrm{e} \cdot"),
    ]:
        assert fragment in to_latex(expression, labels), expression


def test_latex_special_characters_in_names_are_escaped() -> None:
    labels = {"x": VariableLabel("50% de {carga} & #1_a")}
    assert to_latex("x", labels) == r"\text{50\% de \{carga\} \& \#1\_a}"
    assert escape_text("a\\b^c~") == r"a\textbackslash{}b\textasciicircum{}c\textasciitilde{}"


def test_tree_and_normalized_form() -> None:
    assert to_tree("sqrt(E) / 2") == {
        "kind": "binary",
        "op": "/",
        "left": {"kind": "call", "function": "sqrt", "args": [{"kind": "variable", "name": "E"}]},
        "right": {"kind": "number", "value": 2.0},
    }
    assert to_tree("pi")["kind"] == "constant"
    assert normalized("sqrt( E )/rho") == "sqrt(E) / rho"


def test_friendly_label_never_raises() -> None:
    class Definition:
        slug, name, symbol = "densidade", "Densidade", "ρ"

    assert friendly_label("1 / densidade", [Definition()]) == "1 / Densidade"
    assert friendly_label("densidade +", [Definition()]) == "densidade +"


# --- API ---------------------------------------------------------------------


def _describe(client: TestClient, expression: str, universe: str = "material") -> dict:
    res = client.post(
        "/api/expressions/describe", json={"expression": expression, "universe": universe}
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_describe_gives_friendly_latex_dimension_and_unit(client: TestClient) -> None:
    body = _describe(client, "sqrt(modulo_young) / densidade")
    assert body["valid"] is True
    assert body["errors"] == []
    assert body["latex"] == r"\frac{\sqrt{\text{Módulo de Young}}}{\text{Densidade}}"
    assert body["latex_symbols"] == r"\frac{\sqrt{E}}{\rho}"
    assert body["label"] == "√(Módulo de Young) / Densidade"
    assert body["dimension"] == "[length] ** 2.5 / [mass] ** 0.5 / [time]"
    assert body["unit"] == "Pa**(1/2)*m**3/kg"
    assert body["is_multiplicative"] is True
    assert [v["slug"] for v in body["variables"]] == ["modulo_young", "densidade"]
    assert body["variables"][0]["name"] == "Módulo de Young"
    assert body["tree"]["op"] == "/"


def test_describe_refuses_with_200_and_a_position(client: TestClient) -> None:
    body = _describe(client, "modulo_young / ")
    assert body["valid"] is False
    assert body["latex"] is None
    (error,) = body["errors"]
    assert error["message"].startswith("Sintaxe inválida")
    assert error["start"] == len("modulo_young / ")


def test_describe_keeps_the_latex_when_only_a_name_is_wrong(client: TestClient) -> None:
    body = _describe(client, "modulo_young / inexistente")
    assert body["valid"] is False
    assert body["latex"] == r"\frac{\text{Módulo de Young}}{\mathtt{inexistente}}"
    (error,) = body["errors"]
    assert "Variáveis desconhecidas: inexistente" in error["message"]
    assert (error["start"], error["end"]) == (15, 26)


def test_describe_reports_a_dimensional_error(client: TestClient) -> None:
    body = _describe(client, "densidade + modulo_young")
    assert body["valid"] is False
    assert body["latex"] is not None
    assert "dimensionalmente inconsistente" in body["errors"][0]["message"]


def test_describe_agrees_with_the_index_endpoint(client: TestClient) -> None:
    """``valid`` here is exactly "``/selection/index`` accepts it"."""
    for expression in [
        "modulo_young / densidade",
        "sq(modulo_young) * inv(densidade)",
        "ln(modulo_young / limite_escoamento)",
        "max(modulo_young, limite_escoamento) / densidade",
        "pi * densidade",
        "ln(densidade)",
        "min(modulo_young, densidade)",
        "modulo_young ^ 2",
        "inexistente",
    ]:
        described = _describe(client, expression)["valid"]
        evaluated = client.post(
            "/api/selection/index", json={"expression": expression, "goal": "maximize"}
        )
        assert evaluated.status_code == (200 if described else 400), expression


def test_describe_names_an_ordinal_property(client: TestClient, db_session: Session) -> None:
    from app.models.ordinal_property import OrdinalPropertyDefinition, OrdinalScaleLevel

    definition = OrdinalPropertyDefinition(slug="durabilidade_teste", name="Durabilidade de teste")
    definition.levels = [
        OrdinalScaleLevel(rank=0, label="Ruim"),
        OrdinalScaleLevel(rank=1, label="Boa"),
    ]
    db_session.add(definition)
    db_session.commit()
    body = _describe(client, "durabilidade_teste / densidade")
    assert "Propriedade ordinal" in body["errors"][0]["message"]
    assert "Durabilidade de teste" in body["errors"][0]["message"]


def test_palette_reads_the_catalogue(client: TestClient) -> None:
    res = client.get("/api/expressions/palette")
    assert res.status_code == 200
    body = res.json()
    by_slug = {v["slug"]: v for v in body["variables"]}
    density = by_slug["densidade"]
    assert density["name"] == "Densidade"
    assert density["symbol_latex"] == r"\rho"
    assert density["category"] == "FISICA"
    assert density["variable"] == "densidade"
    assert by_slug["modulo_young"]["category"] == "MECANICA"
    names = [f["name"] for f in body["functions"]]
    assert names[:3] == ["sqrt", "cbrt", "sq"]
    assert set(names) == {
        "sqrt", "cbrt", "sq", "pow", "inv", "abs", "ln", "log10", "exp", "min", "max",
    }  # fmt: skip
    assert {c["name"] for c in body["constants"]} == {"pi", "e"}
    # Grouped: sorted by category, then by name.
    keys = [(v["category"], v["name"].casefold()) for v in body["variables"]]
    assert keys == sorted(keys)


def test_process_palette_has_only_numeric_attributes(client: TestClient) -> None:
    body = client.get("/api/expressions/palette", params={"universe": "process"}).json()
    assert body["universe"] == "process"
    assert body["variables"], "the seed has numeric process attributes"
    assert all(v["category"] == "PROCESSO" for v in body["variables"])
    assert all(v["unit"] for v in body["variables"])


def test_comparison_column_of_a_typed_index_is_named_by_its_reading(
    client: TestClient, db_session: Session
) -> None:
    ids = list(db_session.execute(select(Material.id).order_by(Material.id).limit(3)).scalars())
    body = client.post(
        "/api/charts/compare",
        json={
            "material_ids": ids,
            "property_slugs": ["densidade"],
            "computed": [{"expression": "modulo_young / densidade"}],
        },
    ).json()
    column = body["computed"][0]
    assert column["name"] == "Módulo de Young / Densidade"
    assert column["expression"] == "modulo_young / densidade"


def test_index_endpoint_names_the_missing_property(client: TestClient) -> None:
    body = client.post(
        "/api/selection/index", json={"expression": "dureza / densidade", "goal": "maximize"}
    ).json()
    reasons = {v["undefined_reason"] for v in body["values"] if v["value"] is None}
    assert reasons == {"Dados ausentes: Dureza (Vickers)"}


def test_evaluator_without_labels_keeps_the_variable_names() -> None:
    from app.calculations.performance import evaluate_index

    evaluation = evaluate_index("a / b", {"a", "b"}, {"a": 1.0})
    assert evaluation.undefined_reason == "Dados ausentes: b"
    labelled = evaluate_index("a / b", {"a", "b"}, {"a": 1.0}, {"b": "Densidade"})
    assert labelled.undefined_reason == "Dados ausentes: Densidade"
