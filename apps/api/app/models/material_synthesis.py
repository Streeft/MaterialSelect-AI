"""MaterialSynthesis: a receita que produziu um registro derivado (P3).

Guardar a receita é o que separa "valor calculado" de "valor inventado". Sem
ela, um registro sintetizado é um punhado de números sem origem — exatamente o
que o princípio 1 proíbe. Com ela, qualquer um refaz a conta: o tipo, os pais e
os parâmetros bastam para reproduzir cada valor, porque as leis moram em código
(``app.calculations.synthesis``) e não mudam sem revisão.

**Os pais são duas colunas de chave estrangeira e não um JSON de ids**, pela
mesma razão que o [D-62](../../docs/DECISIONS.md) deu a ``Favorite`` e a
``RecentRecord``: um par polimórfico em JSON não teria chave estrangeira
nenhuma, e um id apontando para nada é pior do que uma coluna a mais. O segundo
pai é anulável porque uma espuma tem um só — qual tipo exige qual está no
serviço, não aqui, do mesmo jeito que o tipo do estágio decide quais campos um
``SelectionStage`` carrega.

``ondelete="SET NULL"`` nos pais em vez de cascata: materiais neste sistema são
**desativados**, não excluídos, então isto é rede de segurança e não caminho
esperado. Se um pai sumir mesmo assim, o registro derivado continua existindo
com os valores que já tinha — eles são linhas materializadas, não uma junção
viva — e a receita passa a dizer, honestamente, que um dos constituintes não
está mais no catálogo. Apagar o registro junto seria destruir dado por causa de
uma referência; fingir que a receita continua completa seria pior.
"""

from __future__ import annotations

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class MaterialSynthesis(Base):
    """A receita de um registro derivado: tipo, pais e parâmetros."""

    __tablename__ = "material_synthesis"

    #: Um registro derivado tem exatamente uma receita, então a chave primária é
    #: a do próprio material.
    material_id: Mapped[int] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), primary_key=True
    )
    #: ``composito`` ou ``espuma`` — ver ``app.calculations.synthesis.KINDS``.
    kind: Mapped[str] = mapped_column(String(40), nullable=False)

    parent_a_id: Mapped[int | None] = mapped_column(
        ForeignKey("material.id", ondelete="SET NULL"), nullable=True, index=True
    )
    parent_b_id: Mapped[int | None] = mapped_column(
        ForeignKey("material.id", ondelete="SET NULL"), nullable=True, index=True
    )

    #: Os números da receita: ``fracao_volumetrica`` num compósito,
    #: ``densidade_relativa`` numa espuma. JSON porque a forma muda com o tipo e
    #: nada faz junção sobre eles — a mesma razão pela qual a caixa de um Chart
    #: Stage é coluna e estes não são.
    parameters: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)

    material: Mapped[Material] = relationship(  # noqa: F821
        foreign_keys=[material_id], back_populates="synthesis"
    )
    parent_a: Mapped[Material | None] = relationship(foreign_keys=[parent_a_id])  # noqa: F821
    parent_b: Mapped[Material | None] = relationship(foreign_keys=[parent_b_id])  # noqa: F821
