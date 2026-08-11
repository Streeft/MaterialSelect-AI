"""The boundary the AI layer may not cross.

``AIProvider`` is deliberately narrow. It receives the catalogue and the user's
text, and returns *proposals*. It is given no database session, no expression
evaluator and no access to computed values other than the ones handed to it, so
a provider physically cannot query the catalogue at will, run an expression, or
alter a number the deterministic layers produced.

Adding a real model means implementing this interface and nothing else; the
service, the guardrails and the whole product keep working with it removed.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.ai.guardrails import Catalogue
from app.config import Settings


class AIUnavailableError(RuntimeError):
    """The layer is disabled, misconfigured, or the provider did not answer."""


@dataclass(frozen=True)
class PropertyFacts:
    """What a provider is told about one property. No values, only metadata."""

    slug: str
    name: str
    symbol: str | None
    category: str
    canonical_unit: str
    accepted_units: list[str]
    better_direction: str
    keywords: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class IndexFacts:
    """What a provider is told about one catalogued performance index."""

    slug: str
    name: str
    expression: str
    goal: str
    description: str | None
    assumptions: dict | None


@dataclass(frozen=True)
class ClassFacts:
    """What a provider is told about one material class."""

    slug: str
    name: str


@dataclass(frozen=True)
class ProblemContext:
    """Everything a provider may see when reading a problem statement."""

    statement: str
    properties: list[PropertyFacts]
    indices: list[IndexFacts]
    classes: list[ClassFacts]

    def catalogue(self) -> Catalogue:
        """The same context expressed as the guardrails' allow-list."""
        return Catalogue(
            properties={p.slug: p.canonical_unit for p in self.properties},
            class_slugs={c.slug for c in self.classes},
            index_slugs={i.slug for i in self.indices},
        )


@dataclass(frozen=True)
class ResultContext:
    """An already-computed selection, for prose only.

    The provider receives the *outcome*, never the inputs needed to recompute
    it: there is nothing here it could recalculate differently.
    """

    study_name: str
    function_text: str | None
    objective_text: str | None
    constraint_labels: list[str]
    index_name: str | None
    index_expression: str | None
    index_dimension: str | None
    initial_count: int
    final_count: int
    funnel: list[tuple[str, int]]
    ranked: list[tuple[str, int, float]]  # (name, rank, score)
    excluded_for_missing: list[tuple[str, list[str]]]
    sensitivity_changed: bool
    numbers: set[float] = field(default_factory=set)


class AIProvider(ABC):
    """Interpretation and wording. Never arithmetic."""

    #: Identifier reported to the user in every response.
    name: str = "abstract"
    #: True when no external service is involved.
    simulated: bool = True

    @classmethod
    def from_settings(cls, settings: Settings) -> AIProvider:
        """Build the provider for a configuration.

        The default ignores it, which is what a provider that needs no
        credential, no model name and no timeout should do. Overriding this is
        the only place configuration is allowed to reach a provider: the
        interface below still receives nothing but the catalogue and the text.
        """
        return cls()

    @abstractmethod
    def interpret(self, context: ProblemContext) -> dict:
        """Read a problem statement into the shape of an :class:`InterpretationOut`.

        Returns a plain dict so the service — not the provider — decides what a
        valid response looks like, validating it against the schema and the
        guardrails before anyone sees it.
        """

    @abstractmethod
    def explain(self, context: ResultContext) -> dict:
        """Write prose about an already-computed result."""
