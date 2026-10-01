"""Export layer (Phase 7).

Produces CSV/XLSX/HTML/DOCX/PPTX reports with the full traceability trail
(criteria, filters, units, indices, ranking, eliminated candidates, sources and
a demo-data warning). CSV exports must be protected against formula injection.

PPTX renderer (pptx.py, B2) is implemented, tested and exposed via router
endpoints (/catalogo.pptx, /estudos/{id}.pptx, /estudos/{id}/laudo.pptx).
PNG/SVG/PDF remain planned for future expansions.

See docs/TODO.md for the full export roadmap.
"""
