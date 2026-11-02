"""Contracts of the expression calculator (D-191).

The grammar lives in ``app.calculations.expressions`` and nowhere else. These
schemas carry what the calculator needs to *show* an expression — its friendly
LaTeX, its dimension and unit, its errors with position — and the palette of
things it may contain, read from the catalogue rather than written into the
client.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ExpressionUniverse = Literal["material", "process"]


class ExpressionDescribeIn(BaseModel):
    expression: str = Field(max_length=2000)
    universe: ExpressionUniverse = "material"


class ExpressionIssueOut(BaseModel):
    """One refusal, in Portuguese, with the 0-based character span it is about."""

    message: str
    start: int | None = None
    end: int | None = None


class ExpressionVariableOut(BaseModel):
    """One property (or process attribute) as the calculator shows it.

    ``variable`` is the name the grammar uses and stays behind the scenes; the
    reader sees ``name``, ``symbol`` (as ``symbol_latex``) and ``unit``.
    """

    variable: str
    slug: str
    name: str
    symbol: str | None = None
    symbol_latex: str
    unit: str | None = None
    display_unit: str | None = None
    category: str
    description: str | None = None


class ExpressionDescribeOut(BaseModel):
    """What an expression is, without evaluating it over any material.

    Answered with 200 even when the expression is refused (``valid`` false and
    ``errors`` filled): the calculator asks while the reader builds, and a 400
    per keystroke would be noise. A parseable expression keeps its LaTeX even
    when a name or the dimension is wrong, so the reader sees what they wrote.
    """

    expression: str
    valid: bool
    normalized: str | None = None
    latex: str | None = None
    latex_symbols: str | None = None
    label: str | None = None
    dimension: str | None = None
    unit: str | None = None
    #: No addition or subtraction anywhere (D-128): a ratio of two of its values means something.
    is_multiplicative: bool | None = None
    variables: list[ExpressionVariableOut] = Field(default_factory=list)
    errors: list[ExpressionIssueOut] = Field(default_factory=list)
    tree: dict[str, Any] | None = None


class ExpressionFunctionOut(BaseModel):
    """One function of the grammar, as a calculator key."""

    name: str
    min_args: int
    max_args: int
    label: str
    latex: str
    description: str


class ExpressionConstantOut(BaseModel):
    name: str
    latex: str
    label: str
    description: str


class ExpressionPaletteOut(BaseModel):
    """Everything an expression may contain, for the universe asked for."""

    universe: ExpressionUniverse
    variables: list[ExpressionVariableOut]
    functions: list[ExpressionFunctionOut]
    constants: list[ExpressionConstantOut]
