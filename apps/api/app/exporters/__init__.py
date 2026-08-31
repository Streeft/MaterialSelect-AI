"""Export layer (Phase 7 — not yet fully shipped).

Produces CSV/XLSX/HTML/PPTX reports with the full traceability trail
(criteria, filters, units, indices, ranking, eliminated candidates, sources and
a demo-data warning). CSV exports must be protected against formula injection.

PPTX renderer (pptx.py, B2) is implemented and tested but not yet exposed via
a router endpoint; the architecture is complete and serves as the foundation
for future integration (see docs/TODO.md B2). PNG/SVG/PDF remain planned but
not yet implemented.

See docs/TODO.md for the full export roadmap.
"""
