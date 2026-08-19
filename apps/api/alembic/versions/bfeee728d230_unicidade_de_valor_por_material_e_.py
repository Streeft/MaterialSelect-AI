"""unicidade de valor por material e propriedade

Uma linha por par (material, propriedade). Isto é garantia de determinismo, não
arrumação: com duas linhas para o mesmo par, o valor que chega a um gráfico, a
um filtro ou a um ranking passa a depender da ordem em que o SELECT devolveu as
linhas — e o mesmo catálogo poderia produzir duas respostas diferentes, que é
justamente o que a metodologia afirma ser impossível.

Os serviços já recusam propriedades repetidas dentro de um payload. Só a
constraint cobre duas requisições concorrentes e os caminhos de escrita que não
passam por essa verificação juntos.

Se o banco já tiver duplicatas, esta migration **falha e não apaga nada**. A
mensagem diz quais pares estão duplicados; a decisão de qual linha manter é do
usuário, porque as duas podem ter proveniências diferentes e escolher por ele
seria descartar dado em silêncio.

Revision ID: bfeee728d230
Revises: 983b5bc9bf8f
Create Date: 2026-08-05 00:55:49.388228
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bfeee728d230'
down_revision: Union[str, None] = '983b5bc9bf8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_DUPLICATES = sa.text(
    """
    SELECT material_id, property_id, COUNT(*) AS total
    FROM material_property_value
    GROUP BY material_id, property_id
    HAVING COUNT(*) > 1
    ORDER BY material_id, property_id
    """
)


def _fail_on_existing_duplicates() -> None:
    """Recusa aplicar a constraint sobre um banco que já a viola.

    Sem isto o erro seria o "UNIQUE constraint failed" do driver, sem dizer
    quais linhas o causaram.
    """
    rows = op.get_bind().execute(_DUPLICATES).fetchall()
    if not rows:
        return

    detalhe = ", ".join(
        f"material_id={row.material_id} property_id={row.property_id} ({row.total} linhas)"
        for row in rows
    )
    raise RuntimeError(
        "Existem valores duplicados em material_property_value e a unicidade não "
        f"pode ser aplicada: {detalhe}. Remova ou consolide as linhas excedentes "
        "— escolha qual proveniência manter — e aplique a migration novamente."
    )


def upgrade() -> None:
    _fail_on_existing_duplicates()
    with op.batch_alter_table('material_property_value', schema=None) as batch_op:
        batch_op.create_unique_constraint(
            'uq_material_property_value_pair', ['material_id', 'property_id']
        )


def downgrade() -> None:
    with op.batch_alter_table('material_property_value', schema=None) as batch_op:
        batch_op.drop_constraint('uq_material_property_value_pair', type_='unique')
