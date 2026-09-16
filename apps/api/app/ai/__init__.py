"""Optional, decoupled AI layer (Phase 6).

Four modules, in the order a request passes through them:

* :mod:`app.ai.provider` — the narrow interface a provider implements, plus the
  read-only context it is allowed to see. No database, no evaluator.
* :mod:`app.ai.mock` — the deterministic simulated provider the product ships
  with; needs no key and no network.
* :mod:`app.ai.guardrails` — pure rules every provider output must survive:
  entities must exist, numbers must be grounded in the user's own text, units
  must be compatible, prose may not introduce figures.
* :mod:`app.ai.factory` — which provider is configured, if any.

The AI never computes a property value or a numeric result; those come only from
``calculations``/``domain``. See docs/09-camada-ia.md and
docs/adr/0003-ia-desacoplada-do-calculo.md.
"""
