"""Knowledge base (Cérebro): curated reference material behind the AI layer.

The pipeline is: discover files under the configured root, catalogue them with
their provenance, extract text, split it into passages that keep their page
locator, and (later) index those passages for retrieval.

One rule governs everything downstream and is worth stating at the entrance:
**this layer supplies vocabulary and context, never numbers.** A property value
read out of a textbook does not become quotable because it was indexed; the
guardrails in :mod:`app.ai.guardrails` still require every figure in the AI's
prose to have come from the deterministic pipeline. Retrieval widens what the
model can *say*, not what it can *assert*.

Like the AI and billing layers, this one is optional: with no knowledge root
configured nothing here is imported and the product is unchanged.
"""
