"""Who may write the identity-level data of a material, in one place (TM2-a, TM4-d).

Composition, designations and curves are facts about a material, so the rule for
writing them is the material's: a record another user owns is not found (the
visibility filter already answered 404 before this runs), the shared catalogue
is a curator's (D-83), and a record that came from the licensed official
catalogue (D-102) is not edited by hand at all — its values are the dataset's,
and a manual edit would put a claim next to them that the dataset never made.
"""

from __future__ import annotations

from app.domain.errors import CatalogReadOnlyError, ConflictError
from app.models.material import Material

OFFICIAL_READ_ONLY = (
    "Este material vem do catálogo oficial licenciado e não é editado pela ficha. "
    "Para corrigir o dado, use uma nova versão do catálogo."
)


def ensure_identity_writable(
    material: Material, *, can_edit_shared: bool, is_official: bool
) -> None:
    """Raise unless the viewer may write this material's composition, designations or curves."""
    if material.owner_id is None and not can_edit_shared:
        raise CatalogReadOnlyError()
    if is_official:
        raise ConflictError(OFFICIAL_READ_ONLY)
