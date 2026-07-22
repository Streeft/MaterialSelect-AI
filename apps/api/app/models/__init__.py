"""ORM models package.

Importing this package registers every model on the shared declarative
``Base.metadata`` so that Alembic autogenerate and ``create_all`` can see them.
"""

from app.models.enums import DataQuality, PropertyCategory, BetterDirection
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source

__all__ = [
    "DataQuality",
    "PropertyCategory",
    "BetterDirection",
    "Material",
    "MaterialClass",
    "MaterialPropertyValue",
    "PropertyDefinition",
    "Source",
]
