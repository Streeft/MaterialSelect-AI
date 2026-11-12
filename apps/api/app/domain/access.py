"""Who may use the tool, and who may write the shared catalogue (D-46, D-83).

Pure rules, read by the HTTP gate and by ``/billing/status`` alike, so the
screen that says "you are in" and the API that lets you in cannot disagree.
"""

from __future__ import annotations

from typing import Literal

AccessMode = Literal["subscription", "open"]


def grants_access(mode: AccessMode, subscribed: bool) -> bool:
    """Open mode admits any logged-in user; otherwise only a subscriber."""
    return mode == "open" or subscribed


def can_edit_shared_catalog(mode: AccessMode, subscribed: bool) -> bool:
    """Every user who got in may write the shared catalogue (D-208).

    Until D-207 open mode kept the catalogue read-only for anyone without a
    subscription (D-83), which hid Classes, Properties and Import from a
    student on a fresh database. D-208 revokes that: login is the only
    requirement, in both modes. The arguments stay so the HTTP gate and
    ``/billing/status`` keep one shared call site; protections that live on the
    record (official and demo material, delete confirmation) are untouched.
    """
    return True
