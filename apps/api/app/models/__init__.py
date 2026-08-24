"""ORM models package.

Importing this package registers every model on the shared declarative
``Base.metadata`` so that Alembic autogenerate and ``create_all`` can see them.
"""

from app.models.audit import AuditEvent
from app.models.enums import (
    AuditAction,
    AuditEntityType,
    BetterDirection,
    DataQuality,
    DocumentKind,
    ImportStatus,
    IngestStatus,
    PropertyCategory,
    SourceAuthority,
)
from app.models.import_job import ImportJob, ImportMappingTemplate
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.performance_index import PerformanceIndex
from app.models.project import Project
from app.models.property_definition import PropertyDefinition
from app.models.selection import RankingCriterion, SelectionConstraint, SelectionStudy
from app.models.source import Source
from app.models.subscription import Subscription
from app.models.user import User, UserSession

__all__ = [
    "AuditAction",
    "AuditEntityType",
    "AuditEvent",
    "BetterDirection",
    "DataQuality",
    "DocumentKind",
    "ImportJob",
    "ImportMappingTemplate",
    "ImportStatus",
    "IngestStatus",
    "KnowledgeChunk",
    "KnowledgeDocument",
    "Material",
    "MaterialClass",
    "MaterialPropertyValue",
    "PerformanceIndex",
    "Project",
    "PropertyCategory",
    "PropertyDefinition",
    "RankingCriterion",
    "SelectionConstraint",
    "SelectionStudy",
    "Source",
    "SourceAuthority",
    "Subscription",
    "User",
    "UserSession",
]
