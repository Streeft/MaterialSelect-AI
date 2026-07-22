"""AI layer (Phase 6 — not yet implemented).

Will expose a decoupled, optional ``AIProvider`` interface (interpret_problem,
suggest_properties, suggest_charts, explain_results, ...), with a mock
implementation for development and schema-validated structured output. The AI
never computes property values or numeric results — those come only from the
deterministic ``calculations`` layer. See docs/adr/0003-ia-desacoplada-do-calculo.md.
"""
