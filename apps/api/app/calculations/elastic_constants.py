"""The isotropic relations between elastic constants (D-255).

A linear, isotropic, elastic solid has two independent constants; given Young's
modulus ``E`` and Poisson's ratio ``ν``, the shear and bulk moduli follow:

* ``G = E / (2 (1 + ν))``
* ``K = E / (3 (1 − 2 ν))``

These are the relations D-188 already uses to tie the demo values together, and
the ones a solver applies itself when a card gives it ``E`` and ``ν``. They are
exact *for an isotropic solid* and nothing else: a laminate, a wood or a
single crystal has more than two constants, and these numbers say nothing about
it. The caller marks every value computed here as derived, names the formula,
and never uses it where the catalogue declared the quantity absent (principle 3).

Inputs in any consistent stress unit; the result is in the same unit.
Out-of-range ``ν`` (thermodynamically, ``−1 < ν ≤ 0.5``; ``K`` needs ``ν < 0.5``)
gives ``None`` — never a negative or infinite modulus.
"""

from __future__ import annotations

import math

SHEAR_FORMULA = "G = E/2(1+nu)"
BULK_FORMULA = "K = E/3(1-2nu)"


def _usable(young: float, poisson: float) -> bool:
    return math.isfinite(young) and math.isfinite(poisson) and young > 0


def shear_modulus(young: float, poisson: float) -> float | None:
    """``G = E / 2(1+ν)`` for an isotropic solid; ``None`` outside ``−1 < ν ≤ 0,5``."""
    if not _usable(young, poisson) or not (-1.0 < poisson <= 0.5):
        return None
    return young / (2.0 * (1.0 + poisson))


def bulk_modulus(young: float, poisson: float) -> float | None:
    """``K = E / 3(1−2ν)`` for an isotropic solid; ``None`` when ``ν ≥ 0,5``."""
    if not _usable(young, poisson) or not (-1.0 < poisson < 0.5):
        return None
    return young / (3.0 * (1.0 - 2.0 * poisson))
