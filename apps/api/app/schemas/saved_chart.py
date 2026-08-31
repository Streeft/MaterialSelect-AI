from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SavedChartIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    configuration: dict = Field(description="Estado de filtro opaco do frontend")


class SavedChartOut(BaseModel):
    id: int
    name: str
    configuration: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class SavedChartListItem(BaseModel):
    """List view omits configuration — a list of dozens of saved charts
    shouldn't ship every one's full filter blob to render a picker."""

    id: int
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}
