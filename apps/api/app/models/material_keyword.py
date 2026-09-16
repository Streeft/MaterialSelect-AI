"""MaterialKeyword: one indexed row per material keyword (B5).

Replaces a ``LIKE`` scan over ``Material.keywords`` cast from JSON to text
(portable but unindexable — every row's whole keyword list is re-cast and
re-scanned on every search) with a real column a database can index. Kept in
sync with ``Material.keywords`` (still the JSON source of truth the rest of
the app reads) by :meth:`MaterialRepository.sync_keywords`, called from every
write path in ``MaterialService`` — this table is a derived search index, not
an independent source of truth.
"""

from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MaterialKeyword(Base):
    __tablename__ = "material_keyword"

    id: Mapped[int] = mapped_column(primary_key=True)
    material_id: Mapped[int] = mapped_column(
        ForeignKey("material.id", ondelete="CASCADE"), nullable=False, index=True
    )
    keyword: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
