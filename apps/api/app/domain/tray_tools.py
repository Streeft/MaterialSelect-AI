"""The calculators a reader can carry in the tray (D-258).

A closed list, kept on the server: a tool in the tray is a **shortcut to a
screen**, and the set of screens is the product's, not the reader's. The slug is
what is stored; the label and the route are answered with the tray so the
client never keeps its own copy of the list. A slug outside it is refused on
the way in, and one that left the list later is simply no longer answered.

A tool carries no datum. It is here because, on a real bench, the calculator
sits in the tray next to the material it will be used on.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TrayTool:
    slug: str
    label: str
    route: str


TRAY_TOOLS: tuple[TrayTool, ...] = (
    TrayTool("dimensionar", "Dimensionar", "/app/dimensionar"),
    TrayTool("custo", "Custo", "/app/custo"),
    TrayTool("eco", "Eco", "/app/eco"),
    TrayTool("sintetizar", "Sintetizar", "/app/sintetizar"),
    TrayTool("baterias", "Baterias", "/app/baterias"),
)

TOOLS_BY_SLUG: dict[str, TrayTool] = {tool.slug: tool for tool in TRAY_TOOLS}
