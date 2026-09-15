"""Catalogue of standard structural load cases (the Engineering Solver's spine).

A load case is a *derivation*, not a datum. Ashby's method turns a design brief
into a material index by writing three things and eliminating one:

1. the **objective** to minimise — here always the mass ``m = A · L · ρ``;
2. the **constraint** the part must meet — a stiffness, a load, a moment;
3. the **free variable** the designer may still choose — the section area
   for a bar, a beam or a column; the thickness for a plate, where the area in
   plan is what the drawing fixes. Each case declares which, and in what unit.

Eliminating the free variable between (1) and (2) leaves the objective as a
product of three separable factors::

    m = (structural factor) × (functional factor) × (material grouping)

and the material grouping *is* the performance index. That separation is the
whole point of the method, and this module makes it literal: every case carries
a **structural expression over design variables only** and points at the
**catalogued index** by slug. The index expression itself is never written
here — it is read from ``performance_index`` at solve time, exactly as D-35
requires of the AI layer, and for the same reason: two copies of one formula
become two answers.

Which gives the rule the solver depends on::

    massa = fator estrutural / índice

true for every case below, by construction, because each index is the
reciprocal of that case's material grouping. A test proves it dimensionally —
the structural factor divided by the index must come out in the unit the case
declares — so an algebra slip in a new case fails the suite instead of reaching
a reader.

**The two namespaces never mix.** A structural expression may only name a
design variable (``comprimento``, ``rigidez``, …); an index may only name a
property slug (``modulo_young``, ``densidade``, …). ``_validate`` enforces the
first half at import time, and the property catalogue enforces the second. A
shared name would let a design input silently shadow a material property, and
the number would still look plausible.

The derivations are classical mechanics of materials, written here from the
standard results; the method that assembles them into indices is Ashby's
(*Material Selection in Mechanical Design*), cited per case. No third-party
database, text or dataset is reproduced.

What is **not** here, and is a deliberate v1 omission: cost as an objective
(which replaces ρ with ρ·Cm in every material grouping), sections other than
solid square and solid rectangular, and any case the user would author themselves — a derivation is
verified by review, like ``units.py``, not by data entry.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.calculations.expressions import ExpressionError, variables_in

# π² written out: the safe expression grammar admits numeric literals only, and
# a named constant would have to enter the evaluator's whitelist for one case.
_PI_SQUARED = "9.869604401089358"


@dataclass(frozen=True)
class DesignVariable:
    """One number the designer supplies — never a material property."""

    key: str
    label: str
    unit: str
    help_text: str


@dataclass(frozen=True)
class SupportCondition:
    """A named end condition that fills one design variable with a constant.

    Kept as a choice rather than a hidden constant: the beam constant and the
    Euler end-fixity factor are what make two otherwise identical briefs give
    different answers, so the reader has to see which one ran.
    """

    key: str
    label: str
    variable_key: str
    value: float
    note: str | None = None


@dataclass(frozen=True)
class LoadCase:
    """A standard case: its derivation, the index it yields, and its factors."""

    key: str
    label: str
    summary: str
    index_slug: str
    objective_label: str
    constraint_label: str
    free_variable_label: str
    fixed_labels: tuple[str, ...]
    derivation: tuple[str, ...]
    #: Objective (mass) = ``objective_structural`` / index value.
    objective_structural: str
    objective_unit: str
    #: Free variable = ``free_structural`` × ``free_material``, in ``free_unit``.
    free_structural: str
    free_material: str
    free_unit: str
    variables: tuple[DesignVariable, ...]
    supports: tuple[SupportCondition, ...]
    reference: str

    @property
    def variable_keys(self) -> set[str]:
        return {variable.key for variable in self.variables}

    def variable(self, key: str) -> DesignVariable | None:
        for variable in self.variables:
            if variable.key == key:
                return variable
        return None

    @property
    def design_units(self) -> dict[str, str]:
        """Canonical unit per design variable, for dimensional analysis."""
        return {variable.key: variable.unit for variable in self.variables}


# --- design variables ------------------------------------------------------

_COMPRIMENTO = DesignVariable(
    key="comprimento",
    label="Comprimento",
    unit="m",
    help_text="Vão livre do componente, fixado pelo projeto.",
)
_RIGIDEZ = DesignVariable(
    key="rigidez",
    label="Rigidez exigida",
    unit="N/m",
    help_text="Força por unidade de deslocamento que o componente precisa sustentar.",
)
_CARGA = DesignVariable(
    key="carga",
    label="Carga aplicada",
    unit="N",
    help_text="Força que o componente precisa suportar sem falhar.",
)
_MOMENTO = DesignVariable(
    key="momento",
    label="Momento fletor máximo",
    unit="N*m",
    help_text="Momento no ponto mais solicitado da viga.",
)
_CONSTANTE_APOIO = DesignVariable(
    key="constante_apoio",
    label="Constante de apoio e carregamento",
    unit="dimensionless",
    help_text="Constante C da flecha (δ = F·L³ / (C·E·I)); depende de apoio e carga.",
)
_LARGURA = DesignVariable(
    key="largura",
    label="Largura da placa",
    unit="m",
    help_text="Largura fixada pelo projeto; na placa é a espessura que fica livre.",
)
_CONSTANTE_FLAMBAGEM = DesignVariable(
    key="constante_flambagem",
    label="Fator de extremidade (n²)",
    unit="dimensionless",
    help_text="Quadrado do inverso do comprimento efetivo de flambagem de Euler.",
)

_APOIOS_VIGA = (
    SupportCondition(
        key="engastada-livre",
        label="Engastada numa ponta, carga na outra",
        variable_key="constante_apoio",
        value=3.0,
    ),
    SupportCondition(
        key="biapoiada-central",
        label="Biapoiada, carga no meio do vão",
        variable_key="constante_apoio",
        value=48.0,
    ),
    SupportCondition(
        key="biengastada-central",
        label="Biengastada, carga no meio do vão",
        variable_key="constante_apoio",
        value=192.0,
    ),
)

_EXTREMIDADES_COLUNA = (
    SupportCondition(
        key="birrotulada",
        label="Birrotulada (caso de Euler)",
        variable_key="constante_flambagem",
        value=1.0,
    ),
    SupportCondition(
        key="engastada-livre",
        label="Engastada numa ponta, livre na outra",
        variable_key="constante_flambagem",
        value=0.25,
    ),
    SupportCondition(
        key="engastada-rotulada",
        label="Engastada numa ponta, rotulada na outra",
        variable_key="constante_flambagem",
        value=2.046,
        note="Valor aproximado: a condição exata é solução de equação transcendental.",
    ),
    SupportCondition(
        key="biengastada",
        label="Biengastada",
        variable_key="constante_flambagem",
        value=4.0,
    ),
)

_ASHBY = "Ashby, Material Selection in Mechanical Design"
_SECAO_QUADRADA = "Seção quadrada maciça de lado √A, de modo que I = A²/12."


# --- the catalogue ---------------------------------------------------------

LOAD_CASES: tuple[LoadCase, ...] = (
    LoadCase(
        key="tirante-rigidez",
        label="Tirante em tração, rigidez especificada",
        summary=(
            "Barra tracionada que não pode alongar mais do que o projeto admite; "
            "a área da seção é livre."
        ),
        index_slug="rigidez-especifica",
        objective_label="Minimizar massa",
        constraint_label="Rigidez axial S especificada",
        free_variable_label="Área da seção A",
        fixed_labels=("Comprimento L", "Rigidez S"),
        derivation=(
            "Objetivo: m = A · L · ρ.",
            "Restrição: S = A · E / L, que é a rigidez axial da barra.",
            "Isolando a variável livre: A = S · L / E.",
            "Substituindo: m = (S · L²) · (ρ / E).",
            "O primeiro parêntese só tem projeto; o segundo só tem material. "
            "Minimizar a massa é portanto maximizar E/ρ.",
        ),
        objective_structural="rigidez * comprimento ** 2",
        objective_unit="kg",
        free_structural="rigidez * comprimento",
        free_material="1 / modulo_young",
        free_unit="m**2",
        variables=(_COMPRIMENTO, _RIGIDEZ),
        supports=(),
        reference=_ASHBY,
    ),
    LoadCase(
        key="tirante-resistencia",
        label="Tirante em tração, carga especificada",
        summary=(
            "Barra tracionada que não pode romper sob a carga de projeto; "
            "a área da seção é livre."
        ),
        index_slug="resistencia-especifica",
        objective_label="Minimizar massa",
        constraint_label="Carga F suportada sem falha",
        free_variable_label="Área da seção A",
        fixed_labels=("Comprimento L", "Carga F"),
        derivation=(
            "Objetivo: m = A · L · ρ.",
            "Restrição: F = A · σu — a tensão na seção não passa da resistência.",
            "Isolando a variável livre: A = F / σu.",
            "Substituindo: m = (F · L) · (ρ / σu).",
            "Minimizar a massa é maximizar σu/ρ.",
        ),
        objective_structural="carga * comprimento",
        objective_unit="kg",
        free_structural="carga",
        free_material="1 / resistencia_tracao",
        free_unit="m**2",
        variables=(_COMPRIMENTO, _CARGA),
        supports=(),
        reference=_ASHBY,
    ),
    LoadCase(
        key="tirante-escoamento",
        label="Componente sob carga axial, escoamento especificado",
        summary=(
            "Barra ou tirante que não pode escoar sob a carga de projeto; "
            "a área da seção é livre."
        ),
        index_slug="componente-leve-escoamento",
        objective_label="Minimizar massa",
        constraint_label="Carga F suportada sem escoar",
        free_variable_label="Área da seção A",
        fixed_labels=("Comprimento L", "Carga F"),
        derivation=(
            "Objetivo: m = A · L · ρ.",
            "Restrição: F = A · σy — o projeto é contra escoamento, não contra ruptura.",
            "Isolando a variável livre: A = F / σy.",
            "Substituindo: m = (F · L) · (ρ / σy).",
            "Minimizar a massa é maximizar σy/ρ. Mesmo desenho do tirante por "
            "resistência: o que muda é qual limite o projeto respeita.",
        ),
        objective_structural="carga * comprimento",
        objective_unit="kg",
        free_structural="carga",
        free_material="1 / limite_escoamento",
        free_unit="m**2",
        variables=(_COMPRIMENTO, _CARGA),
        supports=(),
        reference=_ASHBY,
    ),
    LoadCase(
        key="placa-rigidez",
        label="Placa em flexão, rigidez especificada",
        summary=(
            "Placa que não pode fletir mais do que o projeto admite; "
            "a espessura é livre, o vão e a largura são fixos."
        ),
        index_slug="placa-leve-rigidez",
        objective_label="Minimizar massa",
        constraint_label="Rigidez à flexão S especificada",
        free_variable_label="Espessura t",
        fixed_labels=("Comprimento L", "Largura w", "Rigidez S", "Constante de apoio C"),
        derivation=(
            "Objetivo: m = w · L · t · ρ — aqui a área em planta é fixa e a "
            "espessura é que fica livre.",
            "Restrição: S = C · E · I / L³, com I = w · t³ / 12 para a seção retangular.",
            "Isolando a variável livre: t = (12 · S · L³ / (C · E · w))^(1/3).",
            "Substituindo: m = (12 · S · L⁶ · w² / C)^(1/3) · (ρ / E^(1/3)).",
            "Minimizar a massa é maximizar E^(1/3)/ρ. O expoente muda em relação "
            "à viga porque a variável livre entra ao cubo, não ao quadrado.",
        ),
        objective_structural=(
            "(12 * rigidez * comprimento ** 6 * largura ** 2 / constante_apoio) ** (1 / 3)"
        ),
        objective_unit="kg",
        free_structural=(
            "(12 * rigidez * comprimento ** 3 / (constante_apoio * largura)) ** (1 / 3)"
        ),
        free_material="1 / cbrt(modulo_young)",
        free_unit="m",
        variables=(_COMPRIMENTO, _LARGURA, _RIGIDEZ, _CONSTANTE_APOIO),
        supports=_APOIOS_VIGA,
        reference=_ASHBY,
    ),
    LoadCase(
        key="viga-rigidez",
        label="Viga em flexão, rigidez especificada",
        summary=(
            "Viga que não pode fletir mais do que o projeto admite; "
            "a seção é livre, o vão é fixo."
        ),
        index_slug="viga-leve-rigidez",
        objective_label="Minimizar massa",
        constraint_label="Rigidez à flexão S especificada",
        free_variable_label="Área da seção A",
        fixed_labels=("Comprimento L", "Rigidez S", "Constante de apoio C"),
        derivation=(
            "Objetivo: m = A · L · ρ.",
            "Restrição: S = C · E · I / L³, com C dado pelo apoio e pelo carregamento.",
            _SECAO_QUADRADA,
            "Logo S = C · E · A² / (12 · L³), e a variável livre sai: "
            "A = √(12 · S · L³ / (C · E)).",
            "Substituindo: m = √(12 · S · L⁵ / C) · (ρ / √E).",
            "Minimizar a massa é maximizar √E/ρ.",
        ),
        objective_structural="sqrt(12 * rigidez * comprimento ** 5 / constante_apoio)",
        objective_unit="kg",
        free_structural="sqrt(12 * rigidez * comprimento ** 3 / constante_apoio)",
        free_material="1 / sqrt(modulo_young)",
        free_unit="m**2",
        variables=(_COMPRIMENTO, _RIGIDEZ, _CONSTANTE_APOIO),
        supports=_APOIOS_VIGA,
        reference=_ASHBY,
    ),
    LoadCase(
        key="viga-resistencia",
        label="Viga em flexão, momento especificado",
        summary=(
            "Viga que não pode escoar na fibra mais solicitada; " "a seção é livre, o vão é fixo."
        ),
        index_slug="viga-leve-resistencia",
        objective_label="Minimizar massa",
        constraint_label="Momento fletor M suportado sem escoar",
        free_variable_label="Área da seção A",
        fixed_labels=("Comprimento L", "Momento M"),
        derivation=(
            "Objetivo: m = A · L · ρ.",
            "Restrição: σ_max = M · y / I ≤ σy na fibra externa.",
            _SECAO_QUADRADA + " Com y = √A/2, isso dá σ_max = 6 · M / A^(3/2).",
            "Isolando a variável livre: A = (6 · M / σy)^(2/3).",
            "Substituindo: m = L · (6 · M)^(2/3) · (ρ / σy^(2/3)).",
            "Minimizar a massa é maximizar σy^(2/3)/ρ.",
        ),
        objective_structural="comprimento * (6 * momento) ** (2 / 3)",
        objective_unit="kg",
        free_structural="(6 * momento) ** (2 / 3)",
        free_material="1 / limite_escoamento ** (2 / 3)",
        free_unit="m**2",
        variables=(_COMPRIMENTO, _MOMENTO),
        supports=(),
        reference=_ASHBY,
    ),
    LoadCase(
        key="coluna-flambagem",
        label="Coluna em compressão, flambagem elástica",
        summary=(
            "Coluna que não pode flambar sob a carga de projeto; "
            "a seção é livre, o comprimento é fixo."
        ),
        index_slug="viga-leve-rigidez",
        objective_label="Minimizar massa",
        constraint_label="Carga F suportada sem flambar",
        free_variable_label="Área da seção A",
        fixed_labels=("Comprimento L", "Carga F", "Fator de extremidade n²"),
        derivation=(
            "Objetivo: m = A · L · ρ.",
            "Restrição: F ≤ n² · π² · E · I / L², a carga crítica de Euler.",
            _SECAO_QUADRADA,
            "Logo A = √(12 · F · L² / (n² · π² · E)).",
            "Substituindo: m = √(12 · F · L⁴ / (n² · π²)) · (ρ / √E).",
            "Minimizar a massa é maximizar √E/ρ — o mesmo índice da viga em "
            "flexão, e não por coincidência: nos dois casos a restrição é "
            "elástica e a seção entra ao quadrado.",
        ),
        objective_structural=(
            "sqrt(12 * carga * comprimento ** 4 / (constante_flambagem * " + _PI_SQUARED + "))"
        ),
        objective_unit="kg",
        free_structural=(
            "sqrt(12 * carga * comprimento ** 2 / (constante_flambagem * " + _PI_SQUARED + "))"
        ),
        free_material="1 / sqrt(modulo_young)",
        free_unit="m**2",
        variables=(_COMPRIMENTO, _CARGA, _CONSTANTE_FLAMBAGEM),
        supports=_EXTREMIDADES_COLUNA,
        reference=_ASHBY,
    ),
)


def _validate(case: LoadCase) -> None:
    """Reject, at import time, a case whose expressions leave their namespace."""
    keys = case.variable_keys
    for expression in (case.objective_structural, case.free_structural):
        try:
            used = variables_in(expression)
        except ExpressionError as exc:  # pragma: no cover - a typo in this module
            raise ValueError(f"Caso de carga {case.key}: expressão inválida — {exc}") from exc
        unknown = used - keys
        if unknown:
            raise ValueError(
                f"Caso de carga {case.key}: a expressão estrutural nomeia "
                f"{', '.join(sorted(unknown))}, que não é variável de projeto."
            )
    for support in case.supports:
        if support.variable_key not in keys:
            raise ValueError(
                f"Caso de carga {case.key}: a condição {support.key} preenche "
                f"{support.variable_key}, que não é variável deste caso."
            )


for _case in LOAD_CASES:
    _validate(_case)

_BY_KEY = {case.key: case for case in LOAD_CASES}


def by_key(key: str) -> LoadCase | None:
    """Return the load case with this key, or ``None``."""
    return _BY_KEY.get(key)
