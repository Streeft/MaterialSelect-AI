"""The reservations every explanation carries, written by the backend.

A provider may write prose; it may not decide what the prose leaves out. Keeping
these sentences here means the things a reader depends on — this is preliminary
triage, absence is not a bad value, the leader may be an artefact of the weights
— survive a provider that would rather not mention them.

It is also why ``AIService.explain`` only has to police the provider's own text:
nothing in a caveat came from a model, so there is nothing here to check.
"""

from __future__ import annotations

from app.ai.provider import ResultContext


def standard_caveats(context: ResultContext) -> list[str]:
    """The caveats shown with any explanation of ``context``.

    Every figure-free sentence is unconditional; the last two are conditional on
    what the run actually produced, and both report a fact the ranking alone
    would hide.
    """
    caveats = [
        "Esta redação descreve resultados já calculados; ela não recalcula, não "
        "ajusta e não acrescenta nenhum valor.",
        "A ferramenta faz triagem preliminar. Não substitui validação experimental, "
        "análise estrutural detalhada nem julgamento de engenharia.",
    ]
    if context.excluded_for_missing:
        names = ", ".join(name for name, _ in context.excluded_for_missing)
        caveats.append(
            f"Materiais sem valor para algum critério ficaram fora do ranking e não "
            f"foram avaliados: {names}. A ausência não é um valor ruim, é ausência."
        )
    if context.sensitivity_changed:
        caveats.append(
            "A análise de sensibilidade mostra que o primeiro colocado muda quando os "
            "pesos variam: a recomendação é sensível à ponderação escolhida."
        )
    else:
        caveats.append("O primeiro colocado se mantém sob as variações de peso testadas.")
    return caveats
