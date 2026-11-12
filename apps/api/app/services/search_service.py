"""The palette's quick search (D-207): reads narrow rows, ranks them by name.

Ranking is the pure rule in ``app.domain.quick_search``; this only gathers the
candidates per kind and applies the limit **per kind**, so a catalogue of
thousands of materials cannot push the reader's one notebook off the list.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.quick_search import Candidate, rank
from app.repositories.search_repository import SearchRepository
from app.schemas.search import SearchHit, SearchOut


class SearchService:
    def __init__(self, db: Session, viewer_id: int, project_id: int | None) -> None:
        self.repo = SearchRepository(db, viewer_id, project_id)

    def search(self, query: str, limit: int) -> SearchOut:
        if not query.strip():
            return SearchOut(items=[])
        groups: list[list[Candidate]] = [
            [
                Candidate(
                    name,
                    class_name,
                    SearchHit(kind="material", id=id_, name=name, class_name=class_name),
                )
                for id_, name, class_name in self.repo.materials()
            ],
            [
                Candidate(
                    name,
                    class_name,
                    SearchHit(kind="process", id=id_, name=name, class_name=class_name, slug=slug),
                )
                for id_, name, class_name, slug in self.repo.processes()
            ],
            [
                Candidate(title, None, SearchHit(kind="notebook", id=id_, name=title))
                for id_, title in self.repo.notebooks()
            ],
            [
                Candidate(name, None, SearchHit(kind="study", id=id_, name=name))
                for id_, name in self.repo.studies()
            ],
        ]
        items: list[SearchHit] = []
        for candidates in groups:
            for candidate in rank(query, candidates, limit):
                assert isinstance(candidate.ref, SearchHit)
                items.append(candidate.ref)
        return SearchOut(items=items)
