"""The classic Ashby charts, as data (D-211).

A preset is a *question*, not an answer: which two properties go on the axes,
in which scale, and which merit index is overlaid as a line. It carries no
number about any material — the map draws whatever the catalogue holds for
those axes, and a preset whose properties the catalogue does not define is
offered as unavailable, with the missing ones named, never filled in.

The list follows the charts of Ashby, *Materials Selection in Mechanical
Design*, chap. 4, restricted to the properties this catalogue defines. The
index expressions use property slugs, the same grammar as
:mod:`app.calculations.expressions`; when a catalogued
:class:`~app.models.performance_index.PerformanceIndex` has the same slug and
expression, the service hands its slug over so the page selects it by name.

Pure data: no I/O, no ORM.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class PresetIndex:
    """The merit index a preset overlays as a line."""

    name: str
    expression: str
    goal: Literal["maximize", "minimize"]
    #: A catalogued index with this slug, when one exists (checked by the service).
    slug: str | None = None


@dataclass(frozen=True)
class MapPreset:
    slug: str
    name: str
    description: str
    x: str
    y: str
    scale: Literal["linear", "log"] = "log"
    index: PresetIndex | None = None


MAP_PRESETS: tuple[MapPreset, ...] = (
    MapPreset(
        slug="modulo-densidade",
        name="Módulo de Young × Densidade",
        description="Leveza e rigidez: tirantes, vigas e placas leves.",
        x="densidade",
        y="modulo_young",
        index=PresetIndex(
            name="Viga leve limitada por rigidez",
            expression="sqrt(modulo_young) / densidade",
            goal="maximize",
            slug="viga-leve-rigidez",
        ),
    ),
    MapPreset(
        slug="resistencia-densidade",
        name="Limite de escoamento × Densidade",
        description="Leveza e resistência: componentes que não podem escoar.",
        x="densidade",
        y="limite_escoamento",
        index=PresetIndex(
            name="Viga leve limitada por resistência",
            expression="limite_escoamento ** (2 / 3) / densidade",
            goal="maximize",
            slug="viga-leve-resistencia",
        ),
    ),
    MapPreset(
        slug="modulo-resistencia",
        name="Módulo de Young × Limite de escoamento",
        description="Molas e articulações: energia elástica armazenada por volume.",
        x="limite_escoamento",
        y="modulo_young",
        index=PresetIndex(
            name="Mola (σy²/E)",
            expression="limite_escoamento ** 2 / modulo_young",
            goal="maximize",
        ),
    ),
    MapPreset(
        slug="modulo-custo",
        name="Módulo de Young × Custo por volume",
        description="Rigidez barata: o custo de cada unidade de rigidez.",
        x="custo_volume",
        y="modulo_young",
        index=PresetIndex(
            name="Rigidez por custo de volume (E/Cv)",
            expression="modulo_young / custo_volume",
            goal="maximize",
        ),
    ),
    MapPreset(
        slug="condutividade-expansao",
        name="Condutividade térmica × Expansão térmica",
        description="Distorção térmica: peças que não podem empenar sob calor.",
        x="coef_expansao_termica",
        y="condutividade_termica",
        index=PresetIndex(
            name="Distorção térmica (λ/α)",
            expression="condutividade_termica / coef_expansao_termica",
            goal="maximize",
        ),
    ),
    MapPreset(
        slug="tenacidade-resistencia",
        name="Tenacidade à fratura × Limite de escoamento",
        description="Tolerância a defeitos: escoar antes de fraturar.",
        x="limite_escoamento",
        y="tenacidade_fratura",
        index=PresetIndex(
            name="Tolerância a defeito (KIc/σy)",
            expression="tenacidade_fratura / limite_escoamento",
            goal="maximize",
        ),
    ),
)
