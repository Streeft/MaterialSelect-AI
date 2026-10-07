"""Data-access layer for materials."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import UTC, datetime

from sqlalchemy import and_, case, delete, exists, false, func, not_, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.sql.elements import ColumnElement

from app.domain.composition import (
    CompositionCondition,
    EntryFacts,
    UndeterminedReason,
    evaluate,
)
from app.domain.search_query import (
    And,
    CompositionAtom,
    DesignationAtom,
    Node,
    Not,
    Or,
    SystemAtom,
    Term,
    composition_conditions,
    extract_positive_terms,
    parse_query,
    positive_designations,
    to_designation_pattern,
    to_like_pattern,
)
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_composition import MaterialCompositionEntry
from app.models.material_designation import MaterialDesignation
from app.models.material_keyword import MaterialKeyword
from app.models.material_property_value import MaterialPropertyValue
from app.models.property_definition import PropertyDefinition
from app.models.source import Source
from app.repositories.visibility import visible_materials


@dataclass
class ConditionTally:
    """How one composition condition came out over the visible catalogue (D-105).

    Decided material by material by ``app.domain.composition.evaluate`` — the
    rule lives there once; this only holds the answer the SQL is compiled from.
    """

    condition: CompositionCondition
    satisfied: set[int] = field(default_factory=set)
    not_satisfied: set[int] = field(default_factory=set)
    undetermined: Counter[UndeterminedReason] = field(default_factory=Counter)


@dataclass
class SearchFacts:
    """What a search knows besides the rows: only set when it asked about composition."""

    tallies: list[ConditionTally] = field(default_factory=list)
    #: Visible, active materials the whole query could not decide — the answer
    #: depended on composition data that is absent. They are not in the result.
    undetermined: int = 0
    #: Visible, active materials with no composition row at all.
    without_composition: int = 0


def _code_exists(*conditions: ColumnElement[bool]) -> ColumnElement[bool]:
    return exists(
        select(MaterialDesignation.id).where(
            MaterialDesignation.material_id == Material.id, *conditions
        )
    )


def _designation_match(atom: DesignationAtom) -> ColumnElement[bool]:
    if atom.exact:
        return _code_exists(MaterialDesignation.code_key == atom.key)
    return _code_exists(
        MaterialDesignation.code_key.like(to_designation_pattern(atom), escape="\\")
    )


def _matches(term: Term) -> ColumnElement[bool]:
    """One term against every column a reader would expect it to hit.

    Name, class, keyword and — since D-105 — designation code. A term that
    matches any of them matches the material; `NOT` then negates the whole
    disjunction, which is what "steel NOT alloy" means.
    """
    pattern = to_like_pattern(term)
    keyword_match = exists(
        select(MaterialKeyword.id).where(
            MaterialKeyword.material_id == Material.id,
            func.lower(MaterialKeyword.keyword).like(pattern, escape="\\"),
        )
    )
    return or_(
        func.lower(Material.name).like(pattern, escape="\\"),
        func.lower(MaterialClass.name).like(pattern, escape="\\"),
        keyword_match,
        _code_exists(func.lower(MaterialDesignation.code_key).like(pattern, escape="\\")),
    )


def _ids(ids: set[int]) -> ColumnElement[bool]:
    return Material.id.in_(sorted(ids)) if ids else false()


def _compile(
    node: Node, tallies: dict[CompositionCondition, ConditionTally]
) -> tuple[ColumnElement[bool], ColumnElement[bool]]:
    """Turn a parsed query into a pair of SQL predicates: (decided true, decided false).

    Three-valued on purpose (D-105). Text and designation atoms are always
    decided, so their false side is plain negation. A composition atom can be
    *undetermined* — the data is absent — and then it is on neither side; ``NOT``
    swaps the sides and so cannot turn absence into a pass, which is the rule
    D-59 set for a negative operator over a missing value. ``AND``/``OR`` follow
    Kleene: and-true needs every side true, and-false needs any side false.
    """
    if isinstance(node, Term):
        match = _matches(node)
        return match, not_(match)
    if isinstance(node, SystemAtom):
        match = _code_exists(MaterialDesignation.system == node.system)
        return match, not_(match)
    if isinstance(node, DesignationAtom):
        match = _designation_match(node)
        return match, not_(match)
    if isinstance(node, CompositionAtom):
        tally = tallies[node.condition]
        return _ids(tally.satisfied), _ids(tally.not_satisfied)
    if isinstance(node, Not):
        true_side, false_side = _compile(node.operand, tallies)
        return false_side, true_side
    pairs = [_compile(o, tallies) for o in node.operands]
    trues, falses = [p[0] for p in pairs], [p[1] for p in pairs]
    if isinstance(node, And):
        return and_(*trues), or_(*falses)
    assert isinstance(node, Or)
    return or_(*trues), and_(*falses)


class MaterialRepository:
    """Encapsulates all material-related database queries.

    ``viewer_id`` is who is reading, and every statement that selects materials
    narrows to what that reader may see (P1-4). It is a constructor argument
    rather than a parameter on eight methods so that a call site cannot pass it
    to some of them and not the others; it defaults to ``None``, which means the
    shared catalogue and nothing else — the safe direction for a construction
    site that was never updated.
    """

    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.db = db
        self.viewer_id = viewer_id

    def _catalogue(self):
        """Active materials this reader may see, joined to their class."""
        return (
            select(Material)
            .join(MaterialClass, Material.class_id == MaterialClass.id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
        )

    def list_materials(self, search: str | None = None) -> list[Material]:
        """Return active materials, optionally filtered by a search query."""
        return self.search_materials(search)[0]

    def search_materials(self, search: str | None = None) -> tuple[list[Material], SearchFacts]:
        """Active materials matching a query (D-55, D-105), with what the search knows.

        The search is case-insensitive and matches the material name, its class
        name, any keyword or designation code; field atoms (``comp:``,
        ``norma:``, ``designacao:``) ask structured questions. When a query is
        present, results are ranked by relevance (exact match > prefix >
        substring > class/keyword match; an exact designation code weighs as
        much as an exact name). Uses parameterised queries only.
        """
        stmt = self._catalogue().options(
            joinedload(Material.material_class),
            # One extra query for the whole page, so the catalogue can state
            # each material's data quality and designations. Reaching the same
            # collections lazily would be one query per row.
            selectinload(Material.property_values),
            selectinload(Material.designations),
        )
        facts = SearchFacts()

        if not (search and search.strip()):
            stmt = stmt.order_by(Material.name)
            return list(self.db.execute(stmt).scalars().unique().all()), facts

        parsed = parse_query(search)
        conditions = composition_conditions(parsed)
        tallies = self._tally_composition(conditions, facts) if conditions else {}
        true_side, false_side = _compile(parsed, tallies)
        stmt = stmt.where(true_side)
        if conditions:
            facts.undetermined = self.db.execute(
                self._catalogue()
                .with_only_columns(func.count(Material.id))
                .where(not_(true_side), not_(false_side))
            ).scalar_one()

        score_terms = [_term_score(term) for term in extract_positive_terms(parsed)]
        score_terms += [_designation_score(atom) for atom in positive_designations(parsed)]
        if score_terms:
            stmt = stmt.order_by(sum(score_terms).desc(), Material.name)
        else:
            stmt = stmt.order_by(Material.name)
        return list(self.db.execute(stmt).scalars().unique().all()), facts

    def _tally_composition(
        self, conditions: list[CompositionCondition], facts: SearchFacts
    ) -> dict[CompositionCondition, ConditionTally]:
        """Decide every composition condition for every visible, active material.

        The verdict comes from ``app.domain.composition.evaluate`` — the one
        place the reach rule is written — and only the resulting id sets reach
        SQL. Rows of materials the reader cannot see are never read, so neither
        the result nor any count can reveal them (D-62).
        """
        visible = (
            select(Material.id)
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
        )
        visible_ids = set(self.db.execute(visible).scalars())
        with_composition = set(
            self.db.execute(
                select(MaterialCompositionEntry.material_id)
                .where(MaterialCompositionEntry.material_id.in_(visible))
                .distinct()
            ).scalars()
        )
        facts.without_composition = len(visible_ids - with_composition)

        entries: dict[str, dict[int, EntryFacts]] = {}
        rows = self.db.execute(
            select(
                MaterialCompositionEntry.material_id,
                MaterialCompositionEntry.element,
                MaterialCompositionEntry.is_balance,
                MaterialCompositionEntry.is_missing,
                MaterialCompositionEntry.normalized_min,
                MaterialCompositionEntry.normalized_max,
                MaterialCompositionEntry.normalized_nominal,
            )
            .where(MaterialCompositionEntry.element.in_({c.element for c in conditions}))
            .where(MaterialCompositionEntry.material_id.in_(visible))
        ).all()
        for material_id, element, is_balance, is_missing, low, high, nominal in rows:
            entries.setdefault(element, {})[material_id] = EntryFacts(
                is_balance=is_balance,
                is_missing=is_missing,
                normalized_min=low,
                normalized_max=high,
                normalized_nominal=nominal,
            )

        tallies: dict[CompositionCondition, ConditionTally] = {}
        for condition in conditions:
            tally = ConditionTally(condition)
            by_material = entries.get(condition.element, {})
            for material_id in visible_ids:
                verdict = evaluate(
                    condition,
                    by_material.get(material_id),
                    has_composition=material_id in with_composition,
                )
                if verdict.value is True:
                    tally.satisfied.add(material_id)
                elif verdict.value is False:
                    tally.not_satisfied.add(material_id)
                else:
                    assert verdict.reason is not None
                    tally.undetermined[verdict.reason] += 1
            tallies[condition] = tally
            facts.tallies.append(tally)
        return tallies

    def get_material(self, material_id: int) -> Material | None:
        """Return one material with its class, property values and definitions.

        ``populate_existing`` forces the ORM to overwrite any already-loaded
        (possibly stale) state for this material in the identity map. Without it,
        re-reading after a bulk delete/insert of property values (as done by
        ``replace_property_values``) would return the OLD collection, because a
        loaded, non-expired collection is not refreshed by a plain re-query.
        """
        stmt = (
            select(Material)
            .options(
                joinedload(Material.material_class),
                joinedload(Material.property_values).joinedload(
                    MaterialPropertyValue.property_definition
                ),
                joinedload(Material.property_values).joinedload(MaterialPropertyValue.source),
                # D-105: the sheet's composition and designations, each with
                # the source that states it.
                selectinload(Material.designations).joinedload(MaterialDesignation.source),
                selectinload(Material.composition).joinedload(MaterialCompositionEntry.source),
            )
            .where(Material.id == material_id)
            .where(visible_materials(self.viewer_id))
            .execution_options(populate_existing=True)
        )
        return self.db.execute(stmt).scalars().unique().one_or_none()

    def get_property_by_slug(self, slug: str) -> PropertyDefinition | None:
        """Return a property definition by slug, or None."""
        stmt = select(PropertyDefinition).where(PropertyDefinition.slug == slug)
        return self.db.execute(stmt).scalars().one_or_none()

    def list_properties(self) -> list[PropertyDefinition]:
        """The whole property catalogue, in name order.

        No visibility filter: a property *definition* is shared by everyone —
        ownership lives on the material (P1-4), never on what a property is.
        """
        stmt = select(PropertyDefinition).order_by(PropertyDefinition.name)
        return list(self.db.execute(stmt).scalars().all())

    def values_for_property(self, slug: str) -> list[MaterialPropertyValue]:
        """Return non-missing values for a property, for ACTIVE materials only.

        The ``is_active`` filter keeps soft-deleted materials out of charts and
        any other aggregate consumers — deactivation must remove a material from
        every selection surface, not just the catalogue list.
        """
        stmt = (
            select(MaterialPropertyValue)
            .join(PropertyDefinition, MaterialPropertyValue.property_id == PropertyDefinition.id)
            .join(Material, MaterialPropertyValue.material_id == Material.id)
            .options(joinedload(MaterialPropertyValue.material).joinedload(Material.material_class))
            .where(PropertyDefinition.slug == slug)
            .where(MaterialPropertyValue.is_missing.is_(False))
            .where(Material.is_active.is_(True))
            .where(visible_materials(self.viewer_id))
        )
        return list(self.db.execute(stmt).scalars().unique().all())

    def sync_keywords(self, material_id: int, keywords: list[str]) -> None:
        """Replace every MaterialKeyword row for ``material_id`` with ``keywords``.

        Delete-then-insert rather than diffing: a material's keyword list is
        small (a handful of words) and rewritten wholesale on every edit, so
        there is nothing a diff would save.
        """
        self.db.execute(delete(MaterialKeyword).where(MaterialKeyword.material_id == material_id))
        for keyword in keywords:
            self.db.add(MaterialKeyword(material_id=material_id, keyword=keyword))

    # --- write helpers ----------------------------------------------------

    def get_class(self, class_id: int) -> MaterialClass | None:
        """Return a material class by id, or None."""
        return self.db.get(MaterialClass, class_id)

    def name_exists(self, name: str, exclude_id: int | None = None) -> bool:
        """True if a material **this reader can see** already uses ``name``.

        Scoped to the visible set rather than to the whole table, and that is
        the better answer on both counts it trades between (P1-4). A global
        check would refuse a name because of a record the person cannot see —
        an error message that reveals a hidden record exists. Scoping it keeps
        names unique inside every view that is ever rendered, which is all the
        readability of a chart or a report actually requires: no single view
        mixes two readers' records.
        """
        stmt = (
            select(Material.id)
            .where(func.lower(Material.name) == name.strip().lower())
            .where(visible_materials(self.viewer_id))
        )
        if exclude_id is not None:
            stmt = stmt.where(Material.id != exclude_id)
        return self.db.execute(stmt).first() is not None

    def get_or_create_source(
        self,
        label: str,
        is_demo: bool = False,
        *,
        license_label: str | None = None,
        license_url: str | None = None,
        contains_third_party_data: bool = False,
        reviewed_by_user_id: int | None = None,
    ) -> Source:
        """Return the source with ``label``, creating it if necessary.

        The licensing fields (M1) only apply to a brand-new row — reusing an
        existing label never overwrites its already-recorded license or
        reviewer. The decision is made once, at registration; see
        ``app.importers.service`` for where it is enforced before this is
        ever called with an unregistered license."""
        existing = (
            self.db.execute(select(Source).where(Source.label == label)).scalars().one_or_none()
        )
        if existing:
            return existing
        source = Source(
            label=label,
            is_demo=is_demo,
            license_label=license_label,
            license_url=license_url,
            contains_third_party_data=contains_third_party_data,
            reviewed_by_user_id=reviewed_by_user_id,
            reviewed_at=datetime.now(UTC) if reviewed_by_user_id is not None else None,
        )
        self.db.add(source)
        self.db.flush()
        return source

    def get_source_by_label(self, label: str) -> Source | None:
        return self.db.execute(select(Source).where(Source.label == label)).scalars().one_or_none()

    def list_sources(self) -> list[Source]:
        return list(self.db.execute(select(Source).order_by(Source.label)).scalars().all())

    def delete_values_for_material(self, material_id: int) -> None:
        """Remove all property values of a material (used when replacing them)."""
        self.db.execute(
            delete(MaterialPropertyValue).where(MaterialPropertyValue.material_id == material_id)
        )

    def add(self, obj: object) -> None:
        """Stage a new ORM object for insertion."""
        self.db.add(obj)

    def flush(self) -> None:
        """Flush pending changes (assigns primary keys without committing)."""
        self.db.flush()

    def commit(self) -> None:
        """Commit the current transaction."""
        self.db.commit()


def _escape(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _term_score(term: str):
    """Relevance of one positive bare term (exact > prefix > substring)."""
    escaped = _escape(term)
    prefix_pat = f"{escaped}%"
    sub_pat = f"%{escaped}%"
    kw_exact = exists(
        select(MaterialKeyword.id).where(
            MaterialKeyword.material_id == Material.id,
            func.lower(MaterialKeyword.keyword) == term,
        )
    )
    kw_sub = exists(
        select(MaterialKeyword.id).where(
            MaterialKeyword.material_id == Material.id,
            func.lower(MaterialKeyword.keyword).like(sub_pat, escape="\\"),
        )
    )
    code_exact = _code_exists(func.lower(MaterialDesignation.code_key) == term)
    code_sub = _code_exists(func.lower(MaterialDesignation.code_key).like(sub_pat, escape="\\"))
    return (
        case((func.lower(Material.name) == term, 100), else_=0)
        + case((func.lower(Material.name).like(prefix_pat, escape="\\"), 50), else_=0)
        + case((func.lower(Material.name).like(sub_pat, escape="\\"), 25), else_=0)
        + case((func.lower(MaterialClass.name) == term, 20), else_=0)
        + case((func.lower(MaterialClass.name).like(sub_pat, escape="\\"), 10), else_=0)
        + case((kw_exact, 15), else_=0)
        + case((kw_sub, 5), else_=0)
        # D-105: a code typed exactly is as strong a signal as an exact name —
        # nobody types "S30400" meaning anything else.
        + case((code_exact, 100), else_=0)
        + case((code_sub, 20), else_=0)
    )


def _designation_score(atom: DesignationAtom):
    """``designacao:304*`` ranks the code ``304`` itself above ``304L``."""
    literal = atom.key.replace("*", "").replace("?", "")
    return case((_code_exists(MaterialDesignation.code_key == literal), 100), else_=0)
