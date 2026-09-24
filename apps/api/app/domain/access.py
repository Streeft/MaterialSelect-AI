"""Who may use the tool, and who may write the shared catalogue (D-46, D-82).

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
    """Only a subscriber writes the catalogue every other user reads.

    Under the subscription gate the answer is yes without asking: the gate
    already admitted only subscribers, so D-62's "whoever is in may write the
    shared catalogue" stays exactly what it was. Open mode is the only one in
    which "in" and "subscribed" come apart.
    """
    return mode != "open" or subscribed
