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
    ProcessAttributeKind,
    PropertyCategory,
    SourceAuthority,
)
from app.models.import_job import ImportJob, ImportMappingTemplate
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_keyword import MaterialKeyword
from app.models.material_property_value import MaterialPropertyValue
from app.models.my_records import Favorite, RecentRecord
from app.models.performance_index import PerformanceIndex
from app.models.process import MaterialProcess, Process, ProcessClass
from app.models.process_attribute import (
    ProcessAttributeDefinition,
    ProcessAttributeValue,
)
from app.models.project import Project
from app.models.property_definition import PropertyDefinition
from app.models.saved_chart import SavedChart
from app.models.selection import (
    ConstraintGroup,
    RankingCriterion,
    SelectionConstraint,
    SelectionStage,
    SelectionStudy,
)
from app.models.source import Source
from app.models.subscription import Subscription
from app.models.transport_mode import TransportMode
from app.models.user import User, UserSession

__all__ = [
    "AuditAction",
    "AuditEntityType",
    "AuditEvent",
    "BetterDirection",
    "ConstraintGroup",
    "DataQuality",
    "DocumentKind",
    "Favorite",
    "ImportJob",
    "ImportMappingTemplate",
    "ImportStatus",
    "IngestStatus",
    "KnowledgeChunk",
    "KnowledgeDocument",
    "KnowledgeEmbedding",
    "Material",
    "MaterialClass",
    "MaterialKeyword",
    "MaterialProcess",
    "MaterialPropertyValue",
    "PerformanceIndex",
    "Process",
    "ProcessAttributeDefinition",
    "ProcessAttributeKind",
    "ProcessAttributeValue",
    "ProcessClass",
    "Project",
    "PropertyCategory",
    "PropertyDefinition",
    "RankingCriterion",
    "RecentRecord",
    "SavedChart",
    "SelectionConstraint",
    "SelectionStage",
    "SelectionStudy",
    "Source",
    "SourceAuthority",
    "Subscription",
    "TransportMode",
    "User",
    "UserSession",
]
