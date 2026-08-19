"""Subscription: o vínculo 1:1 entre um User e sua assinatura Stripe.

Sem RLS e sem tenant_id — o isolamento por usuário já existe (user_id é
FK única) e este modelo só acrescenta o estado de cobrança em cima dele
(ver docs/superpowers/specs/2026-08-18-multi-tenant-billing-design.md).
`status` espelha o vocabulário do próprio Stripe de propósito: traduzir
para um enum próprio custaria uma tabela de mapeamento sem necessidade.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Subscription(Base):
    """Um plano Stripe por usuário. `active` é o único status que libera acesso."""

    __tablename__ = "subscription"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    stripe_customer_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    stripe_subscription_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )
