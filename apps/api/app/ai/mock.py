"""A deterministic, offline stand-in for a language model.

This provider is not a toy: it is the reference implementation of the contract,
and the one the product ships with. It reads a Portuguese problem statement with
plain lexical rules against the live catalogue, and it is **deterministic** —
the same statement always yields the same reading, which is what lets the AI
layer appear in a reproducibility argument at all.

Its limits are the honest ones. It matches vocabulary, so it will miss phrasings
it does not know; when it does, it says so in ``open_questions`` instead of
guessing. Every number it proposes is copied verbatim from the user's text — it
never converts, never rounds and never fills a gap, so the grounding guardrail
passes by construction rather than by luck.
"""

from __future__ import annotations

import re
import unicodedata

from app.ai.provider import AIProvider, ProblemContext, PropertyFacts, ResultContext
from app.calculations.expressions import ExpressionError, safe_variable
from app.calculations.powerlaw import as_monomial

# --- lexical resources -----------------------------------------------------

# Comparators, longest phrasing first so "no mínimo" wins over "mínimo".
_COMPARATORS: list[tuple[str, str]] = [
    ("nao inferior a", "gte"),
    ("nao superior a", "lte"),
    ("no minimo", "gte"),
    ("no maximo", "lte"),
    ("pelo menos", "gte"),
    ("ao menos", "gte"),
    ("a partir de", "gte"),
    ("minima de", "gte"),
    ("minimo de", "gte"),
    ("maxima de", "lte"),
    ("maximo de", "lte"),
    ("maior ou igual a", "gte"),
    ("menor ou igual a", "lte"),
    ("acima de", "gt"),
    ("abaixo de", "gt".replace("gt", "lt")),
    ("superior a", "gt"),
    ("inferior a", "lt"),
    ("maior que", "gt"),
    ("menor que", "lt"),
    ("mais de", "gt"),
    ("menos de", "lt"),
    ("ate", "lte"),
    (">=", "gte"),
    ("<=", "lte"),
    ("≥", "gte"),
    ("≤", "lte"),
    (">", "gt"),
    ("<", "lt"),
]

# Written units mapped to Pint-parsable strings. Keys are accent-folded and
# lower-cased; single ambiguous letters are excluded on purpose.
_UNITS: dict[str, str] = {
    "gpa": "GPa",
    "mpa": "MPa",
    "kpa": "kPa",
    "pa": "Pa",
    "g/cm3": "g/cm**3",
    "g/cm^3": "g/cm**3",
    "kg/m3": "kg/m**3",
    "kg/m^3": "kg/m**3",
    "oc": "degC",
    "c": "degC",  # only ever reached after a degree sign; see _read_unit
    "celsius": "degC",
    "graus": "degC",  # "300 graus C" — the letter lands in the next token
    "grau": "degC",
    "k": "kelvin",
    "kelvin": "kelvin",
    "w/(m*k)": "W/(m*K)",
    "w/mk": "W/(m*K)",
    "w/m.k": "W/(m*K)",
}

# Portuguese engineering vocabulary for the seeded properties. Matching also
# uses each property's own name, slug and symbol, so a property added by the
# user is still found — this table only sharpens the common cases.
_PROPERTY_SYNONYMS: dict[str, tuple[str, ...]] = {
    "densidade": ("massa especifica", "peso especifico", "leve", "leveza", "densa"),
    "modulo_young": ("rigidez", "rigido", "modulo elastico", "elasticidade"),
    "limite_escoamento": ("escoamento", "escoar", "limite elastico"),
    "resistencia_tracao": ("resistencia", "resistente", "tracao", "ruptura"),
    "dureza": ("duro", "vickers", "abrasao", "desgaste"),
    "temp_max_servico": (
        "temperatura",
        "termico",
        "servico",
        "quente",
        "calor",
        "operacao",
    ),
    "condutividade_termica": ("conducao", "conduzir calor", "isolante termico"),
    "custo_massa": ("custo", "preco", "barato", "economico", "orcamento"),
}

# Component function, detected from the statement.
_FUNCTIONS: list[tuple[tuple[str, ...], str, str]] = [
    (("viga", "flexao", "flexionad"), "Viga em flexão", "viga"),
    (("placa", "painel", "chapa"), "Placa em flexão", "placa"),
    (("tirante", "cabo", "tracionad", "tirantes"), "Elemento sob tração", "tracao"),
    (("eixo", "torcao", "torcionad"), "Eixo sob torção", "torcao"),
    (("mola", "elastica"), "Mola elástica", "mola"),
    (("vaso", "pressao", "tubulacao", "tubo"), "Componente sob pressão", "pressao"),
]

# Design objective, detected from the statement.
_OBJECTIVES: list[tuple[tuple[str, ...], str, str]] = [
    (("leve", "leveza", "massa", "peso", "aliviar"), "Minimizar massa", "massa"),
    (("barato", "custo", "preco", "economic"), "Minimizar custo", "custo"),
    (("rigid", "deforma"), "Maximizar rigidez", "rigidez"),
    (("resist", "ruptura", "falha"), "Maximizar resistência", "resistencia"),
]

# Parameters a designer may adjust, worth surfacing as free variables.
_FREE_VARIABLES: list[tuple[tuple[str, ...], str]] = [
    (("espessura",), "espessura"),
    (("secao", "seccao"), "área da seção"),
    (("diametro",), "diâmetro"),
    (("raio",), "raio"),
    (("comprimento",), "comprimento"),
    (("largura",), "largura"),
    (("altura",), "altura"),
]

_STOPWORDS = {"de", "da", "do", "por", "e", "a", "o", "em", "com", "maxima", "maximo"}

# A number followed by an optional unit token, e.g. "300 °C", "2,5 g/cm3", "70GPa".
_VALUE_UNIT = re.compile(
    r"(?P<number>[+-]?\d{1,3}(?:[. ]\d{3})+(?:,\d+)?|[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?)"
    r"\s*(?P<unit>°?[a-zA-Z][a-zA-Z0-9/^*.()]*)?"
)

_RANGE = re.compile(
    r"\bentre\s+(?P<low>[\d.,]+)\s*(?:[a-zA-Z°/^*.()]+)?\s+e\s+(?P<high>[\d.,]+)\s*(?P<unit>[a-zA-Z°/^*.()]+)?"
)


def fold(text: str) -> str:
    """Lower-case and strip accents, so matching ignores both."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


def _tokens_for(property_facts: PropertyFacts) -> set[str]:
    """Words that should make this property a match."""
    tokens = set(_PROPERTY_SYNONYMS.get(property_facts.slug, ()))
    tokens.add(fold(property_facts.name))
    for word in re.split(r"[\s_\-()]+", fold(property_facts.name)):
        if len(word) > 3 and word not in _STOPWORDS:
            tokens.add(word)
    for word in property_facts.slug.split("_"):
        if len(word) > 3:
            tokens.add(word)
    return {token for token in tokens if token}


def _read_unit(raw: str | None, accepted: list[str], canonical: str) -> str | None:
    """Map a written unit token to a Pint unit the property accepts."""
    if not raw:
        return None
    cleaned = fold(raw).replace("º", "o").replace("°", "o").strip(" .,;")
    # "°C" folds to "oc"; a bare "c" only reaches the table via that path.
    candidate = _UNITS.get(cleaned)
    if candidate is None and cleaned.startswith("o"):
        candidate = _UNITS.get(cleaned[1:])
    if candidate is None:
        for unit in [*accepted, canonical]:
            if fold(unit) == cleaned:
                return unit
        return None
    return candidate


def _split_clauses(statement: str) -> list[str]:
    """Break a statement into the fragments a single constraint lives in."""
    parts = re.split(r"[.;\n]|\be\b(?!ntre)|,", statement)
    return [part.strip() for part in parts if part.strip()]


class MockAIProvider(AIProvider):
    """Rule-based interpretation over the live catalogue. No network, no model."""

    name = "mock"
    simulated = True

    # --- interpretation ---------------------------------------------------

    def interpret(self, context: ProblemContext) -> dict:
        statement = context.statement
        folded = fold(statement)

        function_text, function_tag = self._match(_FUNCTIONS, folded)
        objective_text, objective_tag = self._match(_OBJECTIVES, folded)
        mentioned = self._mentioned_properties(context, folded)
        constraints, unreadable_units = self._read_constraints(context, statement)
        indices = self._match_indices(context, function_tag, objective_tag, mentioned)
        chart = self._suggest_chart(context, indices, mentioned)

        free_variables = [
            label for keywords, label in _FREE_VARIABLES if any(k in folded for k in keywords)
        ]

        open_questions: list[str] = []
        for property_name, clause in unreadable_units:
            open_questions.append(
                f"Em “{clause}” há um limite para {property_name}, mas não foi possível "
                "identificar a unidade. A restrição não foi proposta: lida na unidade "
                "canônica ela poderia inverter o sentido do enunciado. Escreva a unidade "
                "(ex.: “300 °C”, “70 GPa”, “3 g/cm3”)."
            )
        if not constraints:
            open_questions.append(
                "Nenhuma restrição numérica foi reconhecida no enunciado. Escreva os "
                "limites com valor e unidade (ex.: “temperatura de serviço no mínimo "
                "300 °C”) ou adicione-os manualmente na etapa de restrições."
            )
        if not indices:
            open_questions.append(
                "Nenhum índice de desempenho do catálogo corresponde claramente ao "
                "enunciado. Descreva a função do componente (viga, placa, tirante…) e "
                "o que deve ser minimizado."
            )
        if not objective_text:
            open_questions.append(
                "O objetivo não ficou explícito. Diga o que se quer minimizar ou "
                "maximizar (massa, custo, rigidez…)."
            )

        return {
            "function_text": function_text,
            "objective_text": objective_text,
            "free_variables": free_variables,
            "constraints": constraints,
            "properties": [
                {
                    "slug": facts.slug,
                    "name": facts.name,
                    "rationale": f"Mencionada no enunciado ({reason}).",
                }
                for facts, reason in mentioned
            ],
            "indices": indices,
            "chart": chart,
            "open_questions": open_questions,
        }

    @staticmethod
    def _match(
        table: list[tuple[tuple[str, ...], str, str]], folded: str
    ) -> tuple[str | None, str | None]:
        for keywords, label, tag in table:
            if any(keyword in folded for keyword in keywords):
                return label, tag
        return None, None

    @staticmethod
    def _mentioned_properties(
        context: ProblemContext, folded: str
    ) -> list[tuple[PropertyFacts, str]]:
        found: list[tuple[PropertyFacts, str]] = []
        for facts in context.properties:
            for token in sorted(_tokens_for(facts), key=len, reverse=True):
                if token in folded:
                    found.append((facts, f"termo “{token}”"))
                    break
        return found

    def _read_constraints(
        self, context: ProblemContext, statement: str
    ) -> tuple[list[dict], list[tuple[str, str]]]:
        """Extract constraints clause by clause, copying numbers verbatim.

        Returns the proposals plus the clauses that clearly stated a limit whose
        unit could not be identified. Those are not proposed — they become open
        questions, because a threshold read in the wrong unit is worse than no
        threshold at all.
        """
        by_slug = {facts.slug: facts for facts in context.properties}
        constraints: list[dict] = []
        unreadable: list[tuple[str, str]] = []
        seen: set[tuple[str, str]] = set()

        for clause in _split_clauses(statement):
            folded_clause = fold(clause)
            match = next(
                (
                    facts
                    for facts, _ in self._mentioned_properties(context, folded_clause)
                    if facts.slug in by_slug
                ),
                None,
            )
            if match is None:
                continue

            proposal = self._range_constraint(match, clause, folded_clause) or (
                self._threshold_constraint(match, clause, folded_clause)
            )
            if proposal is None:
                if self._is_threshold_missing_its_unit(match, folded_clause):
                    unreadable.append((match.name, clause.strip()))
                continue
            key = (proposal["constraint"]["property_slug"], proposal["constraint"]["operator"])
            if key in seen:
                continue
            seen.add(key)
            constraints.append(proposal)
        return constraints, unreadable

    @classmethod
    def _is_threshold_missing_its_unit(cls, facts: PropertyFacts, folded: str) -> bool:
        """True when the clause states a limit but names no usable unit."""
        if not any(phrase in folded for phrase, _ in _COMPARATORS):
            return False
        found = _VALUE_UNIT.search(folded)
        if not found:
            return False
        unit = _read_unit(found.group("unit"), facts.accepted_units, facts.canonical_unit)
        return cls._needs_a_unit(facts, unit)

    @staticmethod
    def _needs_a_unit(facts: PropertyFacts, unit: str | None) -> bool:
        """True when a threshold was read but its unit could not be.

        Proposing it anyway would let the value be taken in the canonical unit,
        which on an offset scale reverses the user's meaning ("300 °C" read as
        300 K). The clause is dropped and turned into an open question instead.
        """
        return unit is None and facts.canonical_unit.strip().lower() not in {
            "",
            "dimensionless",
        }

    def _range_constraint(self, facts: PropertyFacts, clause: str, folded: str) -> dict | None:
        found = _RANGE.search(folded)
        if not found:
            return None
        unit = _read_unit(found.group("unit"), facts.accepted_units, facts.canonical_unit)
        if self._needs_a_unit(facts, unit):
            return None
        return {
            "constraint": {
                "operator": "between",
                "property_slug": facts.slug,
                "value_min": _to_float(found.group("low")),
                "value_max": _to_float(found.group("high")),
                "unit": unit,
            },
            "evidence": clause.strip()[:300],
            "rationale": f"Faixa lida para {facts.name}.",
        }

    def _threshold_constraint(self, facts: PropertyFacts, clause: str, folded: str) -> dict | None:
        operator = next((op for phrase, op in _COMPARATORS if phrase in folded), None)
        if operator is None:
            return None
        found = _VALUE_UNIT.search(folded)
        if not found:
            return None
        unit = _read_unit(found.group("unit"), facts.accepted_units, facts.canonical_unit)
        if self._needs_a_unit(facts, unit):
            return None
        return {
            "constraint": {
                "operator": operator,
                "property_slug": facts.slug,
                "value": _to_float(found.group("number")),
                "unit": unit,
            },
            "evidence": clause.strip()[:300],
            "rationale": f"Limite lido para {facts.name}.",
        }

    @staticmethod
    def _match_indices(
        context: ProblemContext,
        function_tag: str | None,
        objective_tag: str | None,
        mentioned: list[tuple[PropertyFacts, str]],
    ) -> list[dict]:
        """Score catalogued indices against the reading; never author one."""
        mentioned_slugs = {facts.slug for facts, _ in mentioned}
        scored: list[tuple[int, dict]] = []

        for index in context.indices:
            haystack = fold(
                " ".join(
                    filter(
                        None,
                        [
                            index.name,
                            index.description or "",
                            " ".join((index.assumptions or {}).values()),
                        ],
                    )
                )
            )
            matched_function = bool(function_tag and function_tag in haystack)
            matched_objective = bool(objective_tag and objective_tag in haystack)
            score = (3 if matched_function else 0) + (2 if matched_objective else 0)
            try:
                variables = set(as_monomial(index.expression).exponents)
            except ExpressionError:
                variables = set()
            overlap = {slug for slug in mentioned_slugs if safe_variable(slug) in variables}
            score += len(overlap)
            if score <= 0:
                continue
            scored.append(
                (
                    score,
                    {
                        "slug": index.slug,
                        "name": index.name,
                        "expression": index.expression,
                        "goal": index.goal,
                        "rationale": _index_rationale(
                            function_tag if matched_function else None,
                            objective_tag if matched_objective else None,
                            overlap,
                        ),
                    },
                )
            )

        # Deterministic order: score first, then slug, so ties never shuffle.
        scored.sort(key=lambda item: (-item[0], item[1]["slug"]))
        return [proposal for _, proposal in scored[:3]]

    @staticmethod
    def _suggest_chart(
        context: ProblemContext,
        indices: list[dict],
        mentioned: list[tuple[PropertyFacts, str]],
    ) -> dict | None:
        """Propose the map on which the leading index reads as a straight line."""
        known = {facts.slug for facts in context.properties}

        if indices:
            expression = indices[0]["expression"]
            try:
                exponents = as_monomial(expression).exponents
            except ExpressionError:
                exponents = {}
            by_variable = {safe_variable(slug): slug for slug in known}
            denominator = [
                by_variable[var] for var, e in exponents.items() if e < 0 and var in by_variable
            ]
            numerator = [
                by_variable[var] for var, e in exponents.items() if e > 0 and var in by_variable
            ]
            if len(denominator) == 1 and len(numerator) == 1:
                return {
                    "x": denominator[0],
                    "y": numerator[0],
                    "scale": "log",
                    "rationale": (
                        f"Nestes eixos o índice “{indices[0]['name']}” aparece como uma "
                        "reta em escala logarítmica."
                    ),
                }

        if len(mentioned) >= 2:
            first, second = mentioned[0][0], mentioned[1][0]
            return {
                "x": first.slug,
                "y": second.slug,
                "scale": "log",
                "rationale": "Duas propriedades citadas no enunciado.",
            }
        return None

    # --- explanation ------------------------------------------------------

    def explain(self, context: ResultContext) -> dict:
        """Describe a computed result. Every figure comes from the result itself."""
        paragraphs: list[str] = []

        opening = f"O estudo “{context.study_name}”"
        if context.function_text:
            opening += f" trata de {context.function_text.lower()}"
        if context.objective_text:
            opening += f", com o objetivo de {context.objective_text.lower()}"
        paragraphs.append(opening + ".")

        if context.constraint_labels:
            funnel = "; ".join(f"{label} → {remaining}" for label, remaining in context.funnel)
            paragraphs.append(
                f"Partindo de {context.initial_count} materiais, as restrições aplicadas "
                f"({', '.join(context.constraint_labels)}) reduziram o conjunto a "
                f"{context.final_count}. Eliminação passo a passo: {funnel}."
            )
        else:
            paragraphs.append(
                f"Nenhuma restrição foi aplicada, de modo que os {context.final_count} "
                "materiais do catálogo seguiram como candidatos."
            )

        if context.index_name and context.index_expression:
            dimension = (
                f", de dimensão {context.index_dimension}" if context.index_dimension else ""
            )
            paragraphs.append(
                f"O mérito foi medido pelo índice “{context.index_name}” "
                f"({context.index_expression}){dimension}, calculado pelo backend a partir "
                "dos valores cadastrados."
            )

        if context.ranked:
            leader_name, leader_rank, leader_score = context.ranked[0]
            listing = "; ".join(f"{rank}º {name}" for name, rank, _ in context.ranked[:5])
            paragraphs.append(
                f"A ordenação resultante é: {listing}. O primeiro colocado é "
                f"{leader_name}, com pontuação {leader_score:.3f}."
            )
            del leader_rank  # position is already in the listing

        caveats = [
            "Esta redação descreve resultados já calculados; ela não recalcula, não "
            "ajusta e não acrescenta nenhum valor.",
            "A ferramenta faz triagem preliminar. Não substitui validação experimental, "
            "análise estrutural detalhada nem julgamento de engenharia.",
        ]
        if context.excluded_for_missing:
            names = ", ".join(name for name, _ in context.excluded_for_missing)
            caveats.append(
                f"Materiais sem valor para algum critério ficaram fora do ranking e não "
                f"foram avaliados: {names}. A ausência não é um valor ruim, é ausência."
            )
        if context.sensitivity_changed:
            caveats.append(
                "A análise de sensibilidade mostra que o primeiro colocado muda quando os "
                "pesos variam: a recomendação é sensível à ponderação escolhida."
            )
        else:
            caveats.append("O primeiro colocado se mantém sob as variações de peso testadas.")

        summary = (
            f"{context.ranked[0][0]} lidera entre {context.final_count} candidatos."
            if context.ranked
            else f"{context.final_count} candidatos após as restrições."
        )
        return {"summary": summary, "paragraphs": paragraphs, "caveats": caveats}


def _index_rationale(function_tag: str | None, objective_tag: str | None, overlap: set[str]) -> str:
    """State only what actually matched *this* index.

    The tags arrive already filtered by the caller: an index that scored solely
    on a shared property must not also claim to match the component's function,
    which would read as an agreement the catalogue never expressed.
    """
    reasons: list[str] = []
    if function_tag:
        reasons.append(f"função “{function_tag}”")
    if objective_tag:
        reasons.append(f"objetivo “{objective_tag}”")
    if overlap:
        reasons.append(f"propriedades citadas ({', '.join(sorted(overlap))})")
    if not reasons:
        return "Índice do catálogo."
    return "Compatível com " + ", ".join(reasons) + "."


def _to_float(raw: str) -> float | None:
    """Parse a number exactly as written, without reinterpreting its magnitude."""
    cleaned = raw.replace(" ", "")
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:  # pragma: no cover - the regex only matches numerals
        return None
