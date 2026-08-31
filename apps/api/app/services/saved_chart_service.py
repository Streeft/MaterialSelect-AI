"""Service for managing saved charts (configurations)."""

from __future__ import annotations

from app.domain.errors import NotFoundError
from app.models.saved_chart import SavedChart
from app.models.user import User
from app.repositories.saved_chart_repository import SavedChartRepository
from app.schemas.saved_chart import SavedChartIn, SavedChartListItem, SavedChartOut


class SavedChartService:
    """Orchestrates saved chart endpoints.

    ``project_id`` scopes every saved-chart method (list/get/create/delete)
    to one Project — the catalogue is shared across every logged-in user, but
    a saved chart belongs to its creator's project and must be invisible to
    other users (D-42).
    """

    def __init__(self, db, project_id: int, user: User | None = None) -> None:
        self.repo = SavedChartRepository(db)
        self.user = user
        self.project_id = project_id

    def list_charts(self) -> list[SavedChartListItem]:
        """List all saved charts for the current project (omitting configuration)."""
        return [
            SavedChartListItem(
                id=c.id,
                name=c.name,
                created_at=c.created_at,
            )
            for c in self.repo.list_charts(self.project_id)
        ]

    def get_chart(self, chart_id: int) -> SavedChartOut:
        """Fetch one saved chart (full, with configuration)."""
        chart = self.repo.get_chart(chart_id, self.project_id)
        if chart is None:
            raise NotFoundError(f"Gráfico salvo não encontrado: {chart_id}")
        return SavedChartOut(
            id=chart.id,
            name=chart.name,
            configuration=chart.configuration,
            created_at=chart.created_at,
        )

    def create_chart(self, payload: SavedChartIn) -> SavedChartOut:
        """Create a new saved chart."""
        chart = SavedChart(
            name=payload.name.strip(),
            project_id=self.project_id,
            configuration=payload.configuration,
        )
        self.repo.add(chart)
        self.repo.flush()
        self.repo.commit()
        return SavedChartOut(
            id=chart.id,
            name=chart.name,
            configuration=chart.configuration,
            created_at=chart.created_at,
        )

    def delete_chart(self, chart_id: int) -> None:
        """Delete a saved chart."""
        chart = self.repo.get_chart(chart_id, self.project_id)
        if chart is None:
            raise NotFoundError(f"Gráfico salvo não encontrado: {chart_id}")
        self.repo.delete(chart)
        self.repo.commit()
