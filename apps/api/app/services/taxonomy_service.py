"""Business logic for the material taxonomy (classes)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.domain.slug import slugify
from app.models.material_class import MaterialClass
from app.repositories.material_class_repository import MaterialClassRepository
from app.schemas.material_class import MaterialClassIn, MaterialClassOut


class TaxonomyService:
    """Coordinates CRUD of material classes, guarding taxonomy integrity."""

    def __init__(self, db: Session) -> None:
        self.repo = MaterialClassRepository(db)

    def list_classes(self) -> list[MaterialClassOut]:
        return [
            self._to_out(cls, count) for cls, count in self.repo.list_with_counts()
        ]

    def create_class(self, payload: MaterialClassIn) -> MaterialClassOut:
        slug = self._resolve_slug(payload)
        if self.repo.slug_exists(slug):
            raise ConflictError(f"Já existe uma classe com o slug: {slug}")
        if self.repo.name_exists(payload.name):
            raise ConflictError(f"Já existe uma classe com o nome: {payload.name}")
        self._validate_parent(payload.parent_id)

        obj = MaterialClass(
            name=payload.name.strip(),
            slug=slug,
            parent_id=payload.parent_id,
            description=payload.description,
        )
        self.repo.add(obj)
        self.repo.commit()
        return self._to_out(obj, 0)

    def update_class(self, class_id: int, payload: MaterialClassIn) -> MaterialClassOut:
        obj = self.repo.get(class_id)
        if obj is None:
            raise NotFoundError(f"Classe não encontrada: {class_id}")

        slug = self._resolve_slug(payload)
        if self.repo.slug_exists(slug, exclude_id=class_id):
            raise ConflictError(f"Já existe uma classe com o slug: {slug}")
        if self.repo.name_exists(payload.name, exclude_id=class_id):
            raise ConflictError(f"Já existe uma classe com o nome: {payload.name}")
        self._validate_parent(payload.parent_id, class_id=class_id)

        obj.name = payload.name.strip()
        obj.slug = slug
        obj.parent_id = payload.parent_id
        obj.description = payload.description
        self.repo.commit()
        return self._to_out(obj, self.repo.material_count(class_id))

    def delete_class(self, class_id: int) -> None:
        obj = self.repo.get(class_id)
        if obj is None:
            raise NotFoundError(f"Classe não encontrada: {class_id}")
        if self.repo.material_count(class_id) > 0:
            raise ConflictError(
                "Não é possível excluir uma classe em uso por materiais."
            )
        if self.repo.child_count(class_id) > 0:
            raise ConflictError(
                "Não é possível excluir uma classe com subclasses."
            )
        self.repo.delete(obj)
        self.repo.commit()

    # --- helpers ----------------------------------------------------------

    def _resolve_slug(self, payload: MaterialClassIn) -> str:
        slug = (payload.slug or slugify(payload.name)).strip()
        if not slug:
            raise ValidationError("Não foi possível gerar um slug a partir do nome.")
        return slug

    def _validate_parent(self, parent_id: int | None, class_id: int | None = None) -> None:
        """Ensure the parent exists and does not create a cycle."""
        if parent_id is None:
            return
        if class_id is not None and parent_id == class_id:
            raise ValidationError("Uma classe não pode ser pai de si mesma.")
        parent = self.repo.get(parent_id)
        if parent is None:
            raise NotFoundError(f"Classe pai não encontrada: {parent_id}")
        # Walk up the ancestry to detect a cycle (parent is a descendant of self).
        if class_id is not None:
            ancestor = parent
            seen: set[int] = set()
            while ancestor is not None:
                if ancestor.id == class_id:
                    raise ValidationError(
                        "A hierarquia de classes não pode conter ciclos."
                    )
                if ancestor.id in seen:
                    break
                seen.add(ancestor.id)
                ancestor = self.repo.get(ancestor.parent_id) if ancestor.parent_id else None

    @staticmethod
    def _to_out(cls: MaterialClass, material_count: int) -> MaterialClassOut:
        return MaterialClassOut(
            id=cls.id,
            name=cls.name,
            slug=cls.slug,
            parent_id=cls.parent_id,
            description=cls.description,
            material_count=material_count,
        )
