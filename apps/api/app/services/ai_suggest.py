"""The context of every tool's suggestions (D-228): validated, then enriched.

A screen sends what it shows — ids, slugs, its parameters — and nothing it
computed. Each builder here checks that context (an unknown id is a 404, a
malformed calculator request a 400) and **enriches** it from the database or by
running the backend's own calculation again: Comparar sends ids and the table
is read here; Custo, Eco, Baterias, Dimensionar and Sintetizar send their
request and the result is recomputed here; the Painel reads its aggregates.
Whatever a client puts under another key ("result", "values"…) is never read.

Each builder returns a :class:`~app.ai.suggest.SuggestContext`:

* ``facts`` — the compact PT-BR text the model reads;
* ``numbers`` — every figure the prose may cite (read or computed here);
* ``allowed`` — what an action may name on this screen;
* ``rules`` — the tool's deterministic suggestions, which the simulated
  provider answers and a failing model degrades to ("never empty").
"""

from __future__ import annotations

import re
from collections.abc import Callable, Iterable, Mapping
from typing import Any

from pydantic import BaseModel, Field
from pydantic import ValidationError as PydanticValidationError

from app.ai.guardrails import numbers_in
from app.ai.suggest import (
    Allowed,
    NumberRange,
    SuggestContext,
    act,
    card,
    clip,
    expand_numbers,
    fmt,
    numbers_of,
)
from app.domain.errors import NotFoundError, ValidationError
from app.knowledge.lexical import fold
from app.models.user import User
from app.repositories.selection_repository import SelectionRepository

#: Columns and texts are bounded so one context cannot carry a file.
_MAX_COLUMNS = 200
_MAX_FACT_ROWS = 12


class _ScreenContext(BaseModel):
    """The common shape: unknown keys are ignored, never read."""

    model_config = {"extra": "ignore"}


class _MapasIn(_ScreenContext):
    x: str | None = None
    y: str | None = None
    index_slug: str | None = None


class _CompararIn(_ScreenContext):
    material_ids: list[int] = Field(min_length=1, max_length=20)
    property_slugs: list[str] = Field(default_factory=list, max_length=20)


class _CatalogoIn(_ScreenContext):
    busca: str = Field(default="", max_length=200)
    classe: str = ""
    qualidade: str = ""
    demo: str = ""
    ordenar: str = "relevancia"


class _FichaIn(_ScreenContext):
    material_id: int


class _ProcessosIn(_ScreenContext):
    slug: str | None = None


class _GlossarioIn(_ScreenContext):
    q: str = Field(default="", max_length=120)
    slug: str | None = None


class _ImportarIn(_ScreenContext):
    columns: list[str] = Field(min_length=1, max_length=_MAX_COLUMNS)


class _CalculatorIn(_ScreenContext):
    request: dict[str, Any]


class _EcoCompareIn(_ScreenContext):
    comparison: dict[str, Any]


class _AdminClassIn(_ScreenContext):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = None
    description: str | None = Field(default=None, max_length=2000)


class _AdminPropertyIn(_ScreenContext):
    name: str = Field(min_length=1, max_length=120)
    slug: str | None = None
    symbol: str | None = Field(default=None, max_length=20)
    canonical_unit: str | None = Field(default=None, max_length=60)
    description: str | None = Field(default=None, max_length=2000)


_QUALITY_LABELS = {
    "complete": "completos",
    "gaps": "com lacunas",
    "measured": "medidos",
    "referenced": "com referência",
}
_DEMO_LABELS = {"sim": "só demonstração", "nao": "sem demonstração"}


def _read(model: type[BaseModel], context: Mapping[str, Any], tool: str) -> Any:
    try:
        return model.model_validate(context)
    except PydanticValidationError as exc:
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(part) for part in first.get("loc", ())) or "contexto"
        raise ValidationError(
            f"Contexto inválido para a ferramenta {tool}: {where} — {first.get('msg', 'inválido')}."
        ) from exc


class SuggestContextBuilder:
    """One method per tool; each validates and enriches that tool's context."""

    def __init__(self, db, user: User | None) -> None:
        self.db = db
        self.user = user
        self.viewer_id = user.id if user is not None else None
        self._properties: list | None = None

    def build(self, tool: str, context: Mapping[str, Any]) -> SuggestContext:
        builder: Callable[[Mapping[str, Any]], SuggestContext] = getattr(self, f"_{tool}")
        return builder(context)

    # --- shared reads -----------------------------------------------------

    def properties(self) -> list:
        """Property definitions with how many values each has (most first)."""
        if self._properties is None:
            from app.services.property_service import PropertyService

            self._properties = sorted(
                PropertyService(self.db, self.user).list_properties(),
                key=lambda p: (-p.value_count, p.name),
            )
        return self._properties

    def property_names(self) -> dict[str, str]:
        return {p.slug: p.name for p in self.properties()}

    def _materials_page(self, limit: int = 40, search: str | None = None):
        from app.services.material_service import MaterialService

        return MaterialService(self.db, self.user).list_materials(search, offset=0, limit=limit)

    # --- Mapas --------------------------------------------------------------

    def _mapas(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.services.chart_service import ChartService

        context = _read(_MapasIn, raw, "mapas")
        names = self.property_names()
        for axis in (context.x, context.y):
            if axis and axis not in names:
                raise ValidationError(f"Propriedade desconhecida no contexto dos Mapas: '{axis}'.")
        indices = {
            i.slug: i.name for i in SelectionRepository(self.db, self.viewer_id).list_indices()
        }
        if context.index_slug and context.index_slug not in indices:
            raise ValidationError(f"Índice desconhecido no contexto: '{context.index_slug}'.")
        presets = [p for p in ChartService(self.db, self.viewer_id).map_presets() if p.available]
        with_data = {p.slug: p.name for p in self.properties() if p.value_count > 0}

        facts = [
            f"Eixo X: {names[context.x]}" if context.x else "Eixo X: nenhum",
            f"Eixo Y: {names[context.y]}" if context.y else "Eixo Y: nenhum",
            f"Índice: {indices[context.index_slug]}" if context.index_slug else "Índice: nenhum",
            "Mapas clássicos: "
            + "; ".join(f"{p.name} ({p.x_name or p.x} × {p.y_name or p.y})" for p in presets[:8]),
        ]
        numbers = set()
        for preset in presets:
            numbers |= numbers_in(preset.description)

        rules: list[dict] = []
        current = next(
            (p for p in presets if (p.x, p.y) == (context.x, context.y)),
            None,
        )
        if current is not None and current.index and current.index.slug != context.index_slug:
            rules.append(
                card(
                    f"Índice do mapa {current.name}",
                    f"Este par de eixos é o do mapa clássico {current.name}; a linha do "
                    f"índice {current.index.name} separa os candidatos de melhor desempenho.",
                    act("set_index", current.index.slug),
                )
            )
        other = next((p for p in presets if (p.x, p.y) != (context.x, context.y)), None)
        if other is not None:
            rules.append(
                card(
                    f"Abrir o mapa {other.name}",
                    clip(other.description, 300)
                    or f"Mapa clássico de {other.x_name or other.x} × {other.y_name or other.y}.",
                    act("apply_preset", other.slug),
                )
            )
        ranked = [slug for slug in with_data if slug not in (context.x, context.y)]
        if not (context.x and context.y) and len(with_data) >= 2:
            first, second = list(with_data)[:2]
            rules.append(
                card(
                    "Eixos com mais dados",
                    f"{with_data[first]} e {with_data[second]} são as propriedades com mais "
                    "valores no catálogo: o mapa sai com mais pontos.",
                    act("set_axes", second, first),
                )
            )
        elif ranked and context.x:
            rules.append(
                card(
                    "Troque o eixo Y",
                    f"Mantendo {names[context.x]} no X, {with_data[ranked[0]]} é a propriedade "
                    "com mais valores para o eixo Y.",
                    act("set_axes", context.x, ranked[0]),
                )
            )
        return SuggestContext(
            tool="mapas",
            facts="\n".join(facts),
            numbers=frozenset(numbers),
            allowed=Allowed(
                properties=with_data | {s: names[s] for s in (context.x, context.y) if s},
                indices=indices,
                presets={p.slug: p.name for p in presets},
            ),
            rules=tuple(rules[:3]),
            rule_summary="Próximos passos para explorar o mapa de propriedades.",
        )

    # --- Comparar -------------------------------------------------------------

    def _comparar(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.schemas.charts import CompareRequest
        from app.services.chart_service import ChartService

        context = _read(_CompararIn, raw, "comparar")
        names = self.property_names()
        unknown = [s for s in context.property_slugs if s not in names]
        if unknown:
            raise ValidationError(f"Propriedade desconhecida no contexto: '{unknown[0]}'.")
        slugs = context.property_slugs or [p.slug for p in self.properties()[:8]]
        table = ChartService(self.db, self.viewer_id).compare(
            CompareRequest(material_ids=context.material_ids, property_slugs=slugs)
        )
        found = {m.material_id for m in table.materials}
        missing = [i for i in context.material_ids if i not in found]
        if missing:
            raise NotFoundError(f"Material não encontrado: {missing[0]}")
        materials = {m.material_id: m.name for m in table.materials}

        lines = []
        for material in table.materials[:_MAX_FACT_ROWS]:
            cells = []
            for cell, axis in zip(material.cells, table.properties, strict=False):
                value = "ausente" if cell.value is None else f"{fmt(cell.value)} {axis.unit}"
                cells.append(f"{axis.property_name}: {value}")
            lines.append(f"{material.name} ({material.class_name}) — " + "; ".join(cells))

        rules: list[dict] = []
        best_axes = [a for a in table.properties if a.best_material_ids and a.present_count >= 2]
        for axis in best_axes[:2]:
            winner = axis.best_material_ids[0]
            cell = next(
                c
                for m in table.materials
                if m.material_id == winner
                for c in m.cells
                if c.property_slug == axis.property_slug
            )
            rules.append(
                card(
                    f"Melhor em {axis.property_name}",
                    f"{materials[winner]} tem o melhor valor de {axis.property_name} entre os "
                    f"comparados ({fmt(cell.value)} {axis.unit}).",
                    act("open_route", f"/app/materiais/{winner}"),
                )
            )
        present = sorted(table.properties, key=lambda a: -a.present_count)
        if len(present) >= 2:
            x, y = present[1], present[0]
            rules.append(
                card(
                    "Veja os comparados num mapa",
                    f"{x.property_name} × {y.property_name} são as propriedades com mais valores "
                    "entre estes materiais.",
                    act("set_axes", x.property_slug, y.property_slug),
                )
            )
        return SuggestContext(
            tool="comparar",
            facts="Tabela calculada pelo servidor:\n" + "\n".join(lines),
            numbers=frozenset(expand_numbers(numbers_of(table.model_dump()))),
            allowed=Allowed(
                properties={a.property_slug: a.property_name for a in table.properties},
                materials=materials,
                routes={f"/app/materiais/{i}": f"a ficha de {n}" for i, n in materials.items()},
            ),
            rules=tuple(rules[:3]),
            rule_summary="O que a tabela dos materiais comparados mostra.",
        )

    # --- Catálogo -------------------------------------------------------------

    def _catalogo(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.services.taxonomy_service import TaxonomyService

        context = _read(_CatalogoIn, raw, "catalogo")
        classes = sorted(
            TaxonomyService(self.db, self.user).list_classes(), key=lambda c: -c.material_count
        )
        class_names = {c.slug: c.name for c in classes}
        if context.classe and context.classe not in class_names:
            raise ValidationError(f"Classe desconhecida no contexto: '{context.classe}'.")
        page = self._materials_page(limit=10, search=context.busca or None)
        with_data = [p for p in self.properties() if p.value_count > 0]
        sort_keys = {"relevancia": "relevância", "nome": "nome", "classe": "classe"} | {
            p.slug: p.name for p in with_data
        }
        facts = [
            f"Busca: «{context.busca}»" if context.busca else "Busca: nenhuma",
            f"Filtro de classe: {class_names.get(context.classe, 'nenhum')}",
            f"Qualidade: {_QUALITY_LABELS.get(context.qualidade, 'todas')}",
            f"Ordenação: {sort_keys.get(context.ordenar, context.ordenar)}",
            f"Materiais encontrados: {page.total}",
            "Classes: " + "; ".join(f"{c.name} ({c.material_count})" for c in classes[:12]),
            "Primeiros: " + "; ".join(m.name for m in page.items[:8]),
        ]
        numbers = {float(page.total), *(float(c.material_count) for c in classes)}
        rules: list[dict] = []
        if not context.classe and classes:
            top = classes[0]
            rules.append(
                card(
                    f"Comece pela classe {top.name}",
                    f"{top.name} é a classe com mais materiais ({top.material_count}); filtrar "
                    "por ela deixa a lista mais fácil de ler.",
                    act("add_filter", "classe", top.slug),
                )
            )
        if context.ordenar == "relevancia" and with_data:
            prop = with_data[0]
            direction = "desc" if prop.better_direction.value == "max" else "asc"
            rules.append(
                card(
                    f"Ordene por {prop.name}",
                    f"{prop.name} é a propriedade com mais valores no catálogo; ordenar por ela "
                    "mostra primeiro os melhores nesse critério.",
                    act("sort", prop.slug, direction),
                )
            )
        if len(page.items) >= 2:
            ids = [m.id for m in page.items[:3]]
            rules.append(
                card(
                    "Compare os primeiros",
                    "Abra os primeiros resultados lado a lado para ver onde eles diferem.",
                    act("compare", ids=ids),
                )
            )
        elif context.qualidade != "complete":
            rules.append(
                card(
                    "Só materiais completos",
                    "Filtre os materiais com todos os valores para comparar sem lacunas.",
                    act("add_filter", "qualidade", "complete"),
                )
            )
        return SuggestContext(
            tool="catalogo",
            facts="\n".join(facts),
            numbers=frozenset(numbers),
            allowed=Allowed(
                filters={"classe": class_names, "qualidade": _QUALITY_LABELS, "demo": _DEMO_LABELS},
                filter_labels={
                    "classe": "classe",
                    "qualidade": "qualidade",
                    "demo": "demonstração",
                },
                sort_keys=sort_keys,
                materials={m.id: m.name for m in page.items},
                routes={f"/app/materiais/{m.id}": f"a ficha de {m.name}" for m in page.items},
            ),
            rules=tuple(rules[:3]),
            rule_summary="Formas de estreitar e ordenar o catálogo.",
        )

    # --- Ficha ------------------------------------------------------------------

    def _ficha(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.services.material_service import MaterialService

        context = _read(_FichaIn, raw, "ficha")
        detail = MaterialService(self.db, self.user).get_material_detail(context.material_id)
        values = [v for group in detail.property_groups for v in group.properties]
        present = [v for v in values if not v.is_missing]
        missing = [v for v in values if v.is_missing]
        lines = [
            f"Material: {detail.name} ({detail.class_name})",
            f"Valores registrados: {len(present)}; ausentes: {len(missing)}",
        ]
        for value in present[:_MAX_FACT_ROWS]:
            number = value.value_scalar if value.value_scalar is not None else value.value_typical
            if number is None and value.value_min is not None:
                text = f"{fmt(value.value_min)}–{fmt(value.value_max or value.value_min)}"
            else:
                text = fmt(number) if number is not None else "intervalo"
            lines.append(f"{value.property_name}: {text} {value.canonical_unit or ''}".rstrip())
        if missing:
            lines.append("Ausentes: " + ", ".join(v.property_name for v in missing[:10]))
        if detail.processes:
            lines.append("Processos: " + ", ".join(p.name for p in detail.processes[:8]))

        peers = [m for m in self._materials_page(limit=60).items if m.id != detail.id]
        same_class = [m for m in peers if m.class_slug == detail.class_slug] or peers
        similar = same_class[:2]
        materials = {detail.id: detail.name} | {m.id: m.name for m in similar}
        routes = {f"/app/materiais/{m.id}": f"a ficha de {m.name}" for m in similar}
        routes |= {f"/app/processos/{p.slug}": f"o processo {p.name}" for p in detail.processes}

        rules: list[dict] = []
        if similar:
            rules.append(
                card(
                    "Compare com materiais parecidos",
                    f"Veja {detail.name} ao lado de "
                    + " e ".join(m.name for m in similar)
                    + (
                        " — da mesma classe." if similar[0].class_slug == detail.class_slug else "."
                    ),
                    act("compare", ids=[detail.id, *(m.id for m in similar)]),
                )
            )
        if detail.processes:
            process = detail.processes[0]
            rules.append(
                card(
                    f"Como fabricar: {process.name}",
                    f"{process.name} é um dos processos registrados para {detail.name}.",
                    act("open_route", f"/app/processos/{process.slug}"),
                )
            )
        if missing:
            rules.append(
                card(
                    "Valores ausentes",
                    f"{len(missing)} propriedades não têm valor nesta ficha (ex.: "
                    f"{', '.join(v.property_name for v in missing[:3])}); a seleção exclui o "
                    "material quando um critério depende delas.",
                    act("open_route", "/app/painel"),
                )
            )
        numbers = expand_numbers(numbers_of([v.model_dump() for v in values]))
        numbers |= {float(len(present)), float(len(missing))}
        return SuggestContext(
            tool="ficha",
            facts="\n".join(lines),
            numbers=frozenset(numbers),
            allowed=Allowed(materials=materials, routes=routes),
            rules=tuple(rules[:3]),
            rule_summary=f"Próximos passos a partir da ficha de {detail.name}.",
        )

    # --- Processos ----------------------------------------------------------------

    def _processos(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.services.process_service import ProcessService

        context = _read(_ProcessosIn, raw, "processos")
        processes = ProcessService(self.db).list_processes()
        by_slug = {p.slug: p for p in processes}
        if context.slug and context.slug not in by_slug:
            raise NotFoundError(f"Processo não encontrado: {context.slug}")
        current = by_slug.get(context.slug or "")
        lines = []
        if current is not None:
            lines.append(
                f"Processo: {current.name} (família {current.class_name}); "
                f"materiais compatíveis: {current.material_count}"
            )
            if current.description:
                lines.append(clip(current.description, 400))
            pool = [
                p
                for p in processes
                if p.class_slug == current.class_slug and p.slug != current.slug
            ]
            pool = pool or [p for p in processes if p.slug != current.slug]
        else:
            pool = sorted(processes, key=lambda p: -p.material_count)
        lines.append("Processos: " + "; ".join(f"{p.name} ({p.material_count})" for p in pool[:12]))
        numbers = {float(p.material_count) for p in processes}
        if current is not None and current.description:
            numbers |= numbers_in(current.description)
        rules: list[dict] = []
        for process in pool[:2]:
            rules.append(
                card(
                    f"Veja também {process.name}",
                    f"{process.name}, da família {process.class_name}, atende "
                    f"{process.material_count} materiais do catálogo.",
                    act("open_route", f"/app/processos/{process.slug}"),
                )
            )
        family = current.class_name if current is not None else (pool[0].class_name if pool else "")
        if family:
            rules.append(
                card(
                    f"Família {family}",
                    f"Liste os processos da família {family} para comparar alternativas.",
                    act("search", value=family),
                )
            )
        return SuggestContext(
            tool="processos",
            facts="\n".join(lines),
            numbers=frozenset(numbers),
            allowed=Allowed(
                routes={f"/app/processos/{p.slug}": f"o processo {p.name}" for p in processes}
            ),
            rules=tuple(rules[:3]),
            rule_summary="Processos para explorar em seguida.",
        )

    # --- Glossário ------------------------------------------------------------------

    def _glossario(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.services.glossary_service import GlossaryService

        context = _read(_GlossarioIn, raw, "glossario")
        entries = GlossaryService().list_entries()
        by_slug = {e.slug: e for e in entries}
        if context.slug and context.slug not in by_slug:
            raise NotFoundError(f"Verbete não encontrado: {context.slug}")
        names = self.property_names()
        query = fold(context.q)
        if context.slug:
            matched = [by_slug[context.slug]]
        elif query:
            matched = [
                e
                for e in entries
                if query in fold(e.slug.replace("_", " ")) or query in fold(names.get(e.slug, ""))
            ] or [e for e in entries if query in fold(e.summary)]
        else:
            matched = []
        current = matched[0] if matched else None
        related = [
            e
            for e in entries
            if current is not None
            and e.slug != current.slug
            and fold(names.get(e.slug, e.slug)).split(" ")[0] in fold(current.definition)
        ][:2] or [e for e in entries if e not in matched][:2]
        shown = [*matched[:3], *related]
        lines = [f"Busca: «{context.q}»" if context.q else "Busca: nenhuma"]
        for entry in shown:
            lines.append(f"{names.get(entry.slug, entry.slug)}: {clip(entry.summary, 220)}")
        numbers: set[float] = set()
        for entry in shown:
            numbers |= numbers_in(entry.summary)
        rules = [
            card(
                f"Leia sobre {names.get(entry.slug, entry.slug)}",
                clip(entry.summary, 220),
                act("search", value=names.get(entry.slug, entry.slug)),
            )
            for entry in shown[:2]
        ]
        rules.append(
            card(
                "Verbetes por família",
                "As famílias agrupam os verbetes por assunto: mecânicas, térmicas, elétricas…",
                act("open_route", "/app/glossario/familias"),
            )
        )
        return SuggestContext(
            tool="glossario",
            facts="\n".join(lines),
            numbers=frozenset(numbers),
            allowed=Allowed(),
            rules=tuple(rules[:3]),
            rule_summary="Verbetes para ler a seguir.",
        )

    # --- Painel ------------------------------------------------------------------------

    def _painel(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.services.dashboard_service import DashboardService

        overview = DashboardService(self.db, self.viewer_id).overview()
        lines = [
            f"Materiais: {overview.materials} (demonstração: {overview.demo_materials}); "
            f"classes: {overview.classes}; propriedades: {overview.properties}",
            f"Cobertura geral: {fmt(_percent(overview.coverage))}% dos pares preenchidos",
            "Menos preenchidas: "
            + "; ".join(f"{g.name} ({fmt(_percent(g.coverage))}%)" for g in overview.gaps[:5]),
            "Por classe: "
            + "; ".join(
                f"{c.name} ({c.materials} materiais, {fmt(_percent(c.coverage))}%)"
                for c in overview.by_class[:8]
            ),
        ]
        routes = {
            f"/app/catalogo?classe={c.slug}": f"o catálogo filtrado por {c.name}"
            for c in overview.by_class
        }
        rules: list[dict] = []
        if overview.gaps:
            gap = overview.gaps[0]
            rules.append(
                card(
                    f"Cobertura baixa em {gap.name}",
                    f"{gap.name} tem {fmt(_percent(gap.coverage))}% dos pares material × propriedade "
                    "preenchidos; critérios com ela excluem muitos materiais.",
                    act("open_route", "/app/catalogo"),
                )
            )
        if overview.by_class:
            weakest = min(overview.by_class, key=lambda c: _percent(c.coverage))
            rules.append(
                card(
                    f"Revise a classe {weakest.name}",
                    f"{weakest.name} é a classe menos preenchida ({fmt(_percent(weakest.coverage))}%).",
                    act("open_route", f"/app/catalogo?classe={weakest.slug}"),
                )
            )
        numbers = expand_numbers(numbers_of(overview.model_dump()))
        numbers |= {float(_percent(overview.coverage))}
        numbers |= {float(_percent(g.coverage)) for g in overview.gaps}
        numbers |= {float(_percent(c.coverage)) for c in overview.by_class}
        return SuggestContext(
            tool="painel",
            facts="\n".join(lines),
            numbers=frozenset(numbers),
            allowed=Allowed(routes=routes),
            rules=tuple(rules[:3]),
            rule_summary="Onde o catálogo tem lacunas.",
        )

    # --- Meus registros --------------------------------------------------------------------

    def _registros(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.services.bookmark_service import BookmarkService

        if self.user is None:
            raise ValidationError("Meus registros pedem uma pessoa identificada.")
        records = BookmarkService(self.db, self.user).my_records()
        favorites = [b.material for b in records.favorites if b.material is not None]
        recents = [b.material for b in records.recents if b.material is not None]
        own = list(records.own_records)
        materials: dict[int, str] = {}
        for item in [*favorites, *recents, *own]:
            materials.setdefault(item.id, item.name)
        lines = [
            "Favoritos: " + (", ".join(m.name for m in favorites[:8]) or "nenhum"),
            "Abertos recentemente: " + (", ".join(m.name for m in recents[:8]) or "nenhum"),
            "Registros próprios: " + (", ".join(m.name for m in own[:8]) or "nenhum"),
        ]
        rules: list[dict] = []
        if len(favorites) >= 2:
            ids = [m.id for m in favorites[:5]]
            rules.append(
                card(
                    "Compare seus favoritos",
                    "Seus materiais favoritos lado a lado mostram onde cada um se destaca.",
                    act("compare", ids=ids),
                )
            )
        if recents:
            rules.append(
                card(
                    f"Volte a {recents[0].name}",
                    f"{recents[0].name} foi o último material que você abriu.",
                    act("open_route", f"/app/materiais/{recents[0].id}"),
                )
            )
        if not rules:
            rules.append(
                card(
                    "Comece pelo catálogo",
                    "Favorite materiais no catálogo para reuni-los aqui e compará-los depois.",
                    act("open_route", "/app/catalogo"),
                )
            )
        return SuggestContext(
            tool="registros",
            facts="\n".join(lines),
            numbers=frozenset(),
            allowed=Allowed(
                materials=materials,
                routes={f"/app/materiais/{i}": f"a ficha de {n}" for i, n in materials.items()},
            ),
            rules=tuple(rules[:3]),
            rule_summary="O que fazer com os seus registros.",
        )

    # --- Importar ------------------------------------------------------------------------------

    def _importar(self, raw: Mapping[str, Any]) -> SuggestContext:
        context = _read(_ImportarIn, raw, "importar")
        columns = tuple(dict.fromkeys(clip(c, 120) for c in context.columns if c.strip()))
        props = self.properties()
        mapped: list[tuple[str, str]] = []
        for column in columns:
            slug = _guess_property(column, props)
            if slug is not None and slug not in (s for _, s in mapped):
                mapped.append((column, slug))
        names = {p.slug: p.name for p in props}
        unmatched = [c for c in columns if c not in {col for col, _ in mapped}]
        lines = [
            "Colunas do arquivo: " + ", ".join(f"«{c}»" for c in columns[:40]),
            "Propriedades do catálogo: "
            + "; ".join(
                f"{p.slug} ({p.name}{', ' + p.symbol if p.symbol else ''}, {p.canonical_unit})"
                for p in props[:40]
            ),
        ]
        rules: list[dict] = []
        for start in range(0, min(len(mapped), 6), 3):
            chunk = mapped[start : start + 3]
            rules.append(
                card(
                    "Colunas reconhecidas",
                    "As colunas "
                    + ", ".join(f"«{c}»" for c, _ in chunk)
                    + " parecem corresponder a "
                    + ", ".join(names[s] for _, s in chunk)
                    + ". Confira as unidades antes de importar.",
                    *(act("map_column", c, s) for c, s in chunk),
                )
            )
        if unmatched:
            rules.append(
                card(
                    "Colunas sem par no catálogo",
                    "Não reconheci "
                    + ", ".join(f"«{c}»" for c in unmatched[:5])
                    + "; se forem propriedades novas, cadastre-as antes.",
                    act("open_route", "/app/admin/propriedades"),
                )
            )
        numbers: set[float] = set()
        for column in columns:
            numbers |= numbers_in(column)
        return SuggestContext(
            tool="importar",
            facts="\n".join(lines),
            numbers=frozenset(numbers),
            allowed=Allowed(properties=names, columns=columns),
            rules=tuple(rules[:3]),
            rule_summary="Como mapear as colunas do arquivo.",
        )

    # --- calculators: the result is recomputed here ---------------------------------------------

    def _calculator_request(self, raw: Mapping[str, Any], model: type[BaseModel], tool: str):
        context = _read(_CalculatorIn, raw, tool)
        try:
            return model.model_validate(context.request)
        except PydanticValidationError as exc:
            first = exc.errors()[0] if exc.errors() else {}
            where = ".".join(str(part) for part in first.get("loc", ())) or "pedido"
            raise ValidationError(
                f"Contexto inválido para a ferramenta {tool}: {where} — "
                f"{first.get('msg', 'inválido')}."
            ) from exc

    def _custo(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.schemas.part_cost import CostRequest
        from app.services.defaults_service import DefaultsService
        from app.services.part_cost_service import PartCostService

        request = self._calculator_request(raw, CostRequest, "custo")
        result = PartCostService(self.db, self.viewer_id).estimate(request)
        defaults = DefaultsService().get().custo
        labels = {
            "part_mass": "massa da peça",
            "batch_size": "tamanho do lote",
            "write_off_years": "anos de amortização",
            "load_factor": "fator de carga",
        }
        params = _params(
            request.model_dump(),
            {
                "batch_size": [defaults.batch_size],
                "write_off_years": [defaults.write_off_years],
                "load_factor": [defaults.load_factor],
            },
            labels,
        )
        costed = sorted(result.costed, key=lambda c: c.rank)
        lines = [
            f"Material: {result.material_name}; massa {fmt(result.part_mass)} kg; lote "
            f"{fmt(result.batch_size)}; amortização {fmt(result.write_off_years)} anos; fator de "
            f"carga {fmt(result.load_factor)}",
            "Custo por peça (calculado pelo servidor): "
            + "; ".join(f"{c.process_name}: {fmt(c.terms.total)}" for c in costed[:6]),
            result.monetary_unit_note,
        ]
        if result.uncosted:
            lines.append("Sem custo: " + "; ".join(u.process_name for u in result.uncosted[:6]))
        rules: list[dict] = []
        if costed:
            best = costed[0]
            rules.append(
                card(
                    f"Mais barato: {best.process_name}",
                    f"{best.process_name} dá o menor custo por peça neste lote "
                    f"({fmt(best.terms.total)}).",
                    act("open_route", f"/app/processos/{best.process_slug}"),
                )
            )
        rules.extend(_back_to_defaults(request.model_dump(), params, labels))
        if result.uncosted:
            rules.append(
                card(
                    "Processos sem custo",
                    f"{len(result.uncosted)} processos ficaram sem custo por falta de dados; a "
                    "ficha do material mostra o que falta.",
                    act("open_route", f"/app/materiais/{result.material_id}"),
                )
            )
        routes = {
            f"/app/processos/{c.process_slug}": f"o processo {c.process_name}" for c in costed
        }
        routes[f"/app/materiais/{result.material_id}"] = f"a ficha de {result.material_name}"
        return _calculator_context(
            "custo",
            lines,
            result,
            request,
            params,
            labels,
            routes,
            rules,
            "O que o custo por peça calculado mostra.",
        )

    def _eco(self, raw: Mapping[str, Any]) -> SuggestContext:
        if "comparison" in raw:
            return self._eco_compare(raw)
        from app.schemas.eco import EcoAuditRequest
        from app.services.defaults_service import DefaultsService
        from app.services.eco_service import EcoService

        request = self._calculator_request(raw, EcoAuditRequest, "eco")
        result = EcoService(self.db, self.viewer_id).run(request)
        defaults = DefaultsService().get().eco
        labels = {
            "part_mass": "massa da peça",
            "recycled_fraction": "fração reciclada",
            "transport_distance_km": "distância de transporte",
            "end_of_life": "fim de vida",
        }
        scenario = {
            "recycled_fraction": [defaults.recycled_fraction],
            "transport_distance_km": [defaults.transport_distance_km],
            "end_of_life": [defaults.end_of_life],
        }
        current = _eco_current(request)
        params = _params(current, scenario, labels)
        dominance = result.energy_dominance
        lines = [
            f"Material: {result.material_name or 'vários'}; massa na peça {fmt(result.mass_in_part)} kg",
            f"Energia total: {fmt(result.total_energy) if result.total_energy is not None else 'indefinida'} "
            f"{result.energy_unit}; carbono total: "
            f"{fmt(result.total_carbon) if result.total_carbon is not None else 'indefinido'} "
            f"{result.carbon_unit}",
            "Fases (energia): "
            + "; ".join(
                f"{p.label}: {fmt(p.energy) if p.energy is not None else 'indefinida'}"
                for p in result.phases
            ),
        ]
        if dominance.label and dominance.share is not None:
            lines.append(
                f"Fase dominante em energia: {dominance.label} ({fmt(round(dominance.share * 100, 1))}%)"
            )
        rules: list[dict] = []
        if dominance.label and dominance.share is not None:
            rules.append(
                card(
                    f"A fase {dominance.label} domina",
                    f"{dominance.label} responde por {fmt(round(dominance.share * 100, 1))}% da "
                    "energia do ciclo de vida: é onde uma mudança rende mais.",
                    act("open_route", "/app/eco"),
                )
            )
        rules.extend(_back_to_defaults(current, params, labels))
        if result.material_id is not None:
            rules.append(
                card(
                    "Confira os dados do material",
                    f"A energia e o carbono de {result.material_name} vêm da ficha do material.",
                    act("open_route", f"/app/materiais/{result.material_id}"),
                )
            )
        routes = (
            {f"/app/materiais/{result.material_id}": f"a ficha de {result.material_name}"}
            if result.material_id is not None
            else {}
        )
        return _calculator_context(
            "eco",
            lines,
            result,
            request,
            params,
            labels,
            routes,
            rules,
            "O que a auditoria ecológica calculada mostra.",
            ranges={"part_mass": _POSITIVE_MASS},
        )

    def _eco_compare(self, raw: Mapping[str, Any]) -> SuggestContext:
        """The A × B comparison (D-234): recomputed here from the brief, like the audit."""
        from app.schemas.eco import EcoComparisonRequest
        from app.services.defaults_service import DefaultsService
        from app.services.eco_service import EcoService

        context = _read(_EcoCompareIn, raw, "eco")
        try:
            request = EcoComparisonRequest.model_validate(context.comparison)
        except PydanticValidationError as exc:
            first = exc.errors()[0] if exc.errors() else {}
            where = ".".join(str(part) for part in first.get("loc", ())) or "comparação"
            raise ValidationError(
                f"Contexto inválido para a ferramenta eco: {where} — {first.get('msg', 'inválido')}."
            ) from exc
        result = EcoService(self.db, self.viewer_id).compare(request)
        defaults = DefaultsService().get().eco
        a, b = result.material_a, result.material_b
        name_a, name_b = a.material_name or "A", b.material_name or "B"
        labels = {
            "material_a.part_mass": f"massa da peça A ({name_a})",
            "material_b.part_mass": f"massa da peça B ({name_b})",
            "material_a.recycled_fraction": f"fração reciclada de A ({name_a})",
            "material_b.recycled_fraction": f"fração reciclada de B ({name_b})",
            "material_a.end_of_life": f"fim de vida de A ({name_a})",
            "material_b.end_of_life": f"fim de vida de B ({name_b})",
            "transport_distance_km": "distância de transporte",
        }
        scenario: dict[str, list[float | str]] = {
            "material_a.recycled_fraction": [defaults.recycled_fraction],
            "material_b.recycled_fraction": [defaults.recycled_fraction],
            "material_a.end_of_life": [defaults.end_of_life],
            "material_b.end_of_life": [defaults.end_of_life],
            "transport_distance_km": [defaults.transport_distance_km],
        }
        current = request.model_dump(exclude={"use"})
        params = _params(current, scenario, labels)

        def total(value: float | None, unit: str) -> str:
            return f"{fmt(value)} {unit}" if value is not None else "indefinida"

        lines = [
            f"A: {name_a}, processo {a.process_name}; massa {fmt(a.mass_in_part)} kg",
            f"B: {name_b}, processo {b.process_name}; massa {fmt(b.mass_in_part)} kg",
            f"Energia total: A {total(a.total_energy, a.energy_unit)}; "
            f"B {total(b.total_energy, b.energy_unit)}",
            f"Carbono total: A {total(a.total_carbon, a.carbon_unit)}; "
            f"B {total(b.total_carbon, b.carbon_unit)}",
        ]
        extra: list[float] = []
        rules: list[dict] = []
        verdicts = (
            ("energia", result.winner_energy, result.delta_energy_percent),
            ("carbono", result.winner_carbon, result.delta_carbon_percent),
        )
        for quantity, winner, percent in verdicts:
            if winner in ("material_a", "material_b") and percent is not None:
                better, worse = (name_a, name_b) if winner == "material_a" else (name_b, name_a)
                lines.append(
                    f"Menor {quantity}: {better} ({fmt(abs(percent))}% de diferença para {worse})"
                )
                extra.append(abs(percent))
        if result.winner_energy in ("material_a", "material_b") and (
            result.delta_energy_percent is not None
        ):
            better = name_a if result.winner_energy == "material_a" else name_b
            rules.append(
                card(
                    f"{better} usa menos energia",
                    f"Em energia, a diferença entre as duas alternativas é de "
                    f"{fmt(abs(result.delta_energy_percent))}% no ciclo de vida inteiro.",
                    act("open_route", "/app/eco"),
                )
            )
        deltas = [d for d in result.phase_deltas if d.delta_energy is not None]
        if deltas:
            biggest = max(deltas, key=lambda d: abs(d.delta_energy or 0.0))
            size = abs(biggest.delta_energy or 0.0)
            lines.append(
                f"Fase que mais separa as alternativas em energia: {biggest.label} "
                f"({fmt(size)} {a.energy_unit} de diferença)"
            )
            extra.append(size)
            rules.append(
                card(
                    f"A diferença está em {biggest.label}",
                    f"A fase {biggest.label} é a que mais separa A e B em energia "
                    f"({fmt(size)} {a.energy_unit}): é onde mudar rende mais.",
                    act("open_route", "/app/eco"),
                )
            )
        rules.extend(_back_to_defaults(current, params, labels))
        routes = {}
        for side in (a, b):
            if side.material_id is not None:
                routes[f"/app/materiais/{side.material_id}"] = f"a ficha de {side.material_name}"
        if a.material_id is not None:
            rules.append(
                card(
                    "Confira os dados dos materiais",
                    "A energia e o carbono de cada alternativa vêm da ficha do material.",
                    act("open_route", f"/app/materiais/{a.material_id}"),
                )
            )
        return _calculator_context(
            "eco",
            lines,
            result,
            request,
            params,
            labels,
            routes,
            rules,
            "O que a comparação A × B calculada mostra.",
            extra_numbers=extra,
            ranges={
                "material_a.part_mass": _POSITIVE_MASS,
                "material_b.part_mass": _POSITIVE_MASS,
            },
        )

    def _baterias(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.schemas.battery import BatteryComparisonRequest, PackDesignRequest
        from app.services.battery_service import BatteryService
        from app.services.defaults_service import DefaultsService

        request = self._calculator_request(raw, PackDesignRequest, "baterias")
        service = BatteryService(self.db, self.viewer_id)
        result = service.design(request)
        comparison = service.compare(
            BatteryComparisonRequest(**request.model_dump(exclude={"chemistry_slug"}))
        )
        chemistries = {c.slug: c.name for c in service.list_chemistries()}
        defaults = DefaultsService().get().baterias
        labels = {
            "chemistry_slug": "química",
            "target_voltage_v": "tensão alvo",
            "target_energy_kwh": "energia alvo",
            "target_power_kw": "potência alvo",
            "dod": "profundidade de descarga",
            "mass_packing_factor": "fator de empacotamento (massa)",
            "volume_packing_factor": "fator de empacotamento (volume)",
            "cost_packing_factor": "fator de empacotamento (custo)",
        }
        scenario: dict[str, list[float | str]] = {
            "target_voltage_v": [defaults.voltage_v],
            "target_energy_kwh": [defaults.energy_kwh],
            "target_power_kw": [defaults.power_kw],
            "dod": [defaults.dod],
            "mass_packing_factor": [defaults.mass_packing_factor],
            "volume_packing_factor": [defaults.volume_packing_factor],
            "cost_packing_factor": [defaults.cost_packing_factor],
            "chemistry_slug": list(chemistries),
        }
        params = _params(request.model_dump(), scenario, labels)
        lines = [
            f"Química: {result.chemistry.name}; {result.series_cells_ns}S{result.parallel_strings_np}P "
            f"({result.total_cells} células)",
            f"Energia útil: {fmt(result.usable_energy_kwh)} kWh; massa do pacote: "
            f"{fmt(result.pack_mass_kg)} kg; volume: {fmt(result.pack_volume_l)} L; custo: "
            f"{fmt(result.pack_cost_total_usd)} USD",
            f"Mais leve entre as químicas: {chemistries.get(comparison.lightest_slug, comparison.lightest_slug)}; "
            f"mais barata: {chemistries.get(comparison.lowest_upfront_cost_slug, comparison.lowest_upfront_cost_slug)}; "
            f"mais segura: {chemistries.get(comparison.safest_slug, comparison.safest_slug)}",
        ]
        rules: list[dict] = []
        for slug, why in (
            (comparison.lightest_slug, "o pacote mais leve"),
            (comparison.lowest_upfront_cost_slug, "o menor custo inicial"),
            (comparison.safest_slug, "a maior segurança térmica"),
        ):
            if slug != request.chemistry_slug and slug in chemistries and len(rules) < 2:
                rules.append(
                    card(
                        f"Experimente {chemistries[slug]}",
                        f"Com os mesmos requisitos, {chemistries[slug]} dá {why} entre as químicas.",
                        act("set_param", "chemistry_slug", slug),
                    )
                )
        rules.extend(_back_to_defaults(request.model_dump(), params, labels))
        if result.thermal_guidelines:
            rules.append(
                card(
                    "Cuidados térmicos",
                    clip(result.thermal_guidelines[0], 300),
                    act("open_route", "/app/baterias"),
                )
            )
        extra = [*numbers_of(comparison.model_dump())]
        for guideline in result.thermal_guidelines:
            extra.extend(numbers_in(guideline))
        return _calculator_context(
            "baterias",
            lines,
            result,
            request,
            params,
            labels,
            {},
            rules,
            "O que o dimensionamento do pacote mostra.",
            extra_numbers=extra,
            value_labels=chemistries,
        )

    def _dimensionar(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.schemas.solver import SolveRequest
        from app.services.solver_service import SolverService

        request = self._calculator_request(raw, SolveRequest, "dimensionar")
        result = SolverService(self.db, self.viewer_id).solve(request)
        labels: dict[str, str] = {"objective": "objetivo"}
        scenario: dict[str, list[float | str]] = {"objective": ["massa", "custo"]}
        for variable in result.case.variables:
            labels[f"inputs.{variable.key}"] = variable.label
            if variable.example is not None:
                scenario[f"inputs.{variable.key}"] = [variable.example]
        for support in result.case.supports:
            scenario.setdefault(f"inputs.{support.variable_key}", []).append(support.value)
        current = {"objective": request.objective} | {
            f"inputs.{k}": v for k, v in request.inputs.items()
        }
        params = _params(current, scenario, labels)
        solved = sorted(result.solved, key=lambda s: s.rank)
        lines = [
            f"Caso: {result.case.label}; objetivo: {result.objective_label} ({result.objective_unit})",
            "Entradas: "
            + "; ".join(
                f"{labels.get('inputs.' + k, k)} = {fmt(v)}" for k, v in request.inputs.items()
            ),
            "Melhores (calculado pelo servidor): "
            + "; ".join(f"{s.name}: {fmt(s.objective_value)}" for s in solved[:5]),
            f"Excluídos por falta de dados: {len(result.excluded)}",
        ]
        materials = {s.record_id: s.name for s in solved[:10]}
        rules: list[dict] = []
        if solved:
            best = solved[0]
            rules.append(
                card(
                    f"Melhor: {best.name}",
                    f"{best.name} lidera com {fmt(best.objective_value)} {result.objective_unit}.",
                    act("open_route", f"/app/materiais/{best.record_id}"),
                )
            )
        if len(solved) >= 2:
            rules.append(
                card(
                    "Compare os primeiros",
                    "Veja os primeiros colocados lado a lado, com todas as propriedades.",
                    act("compare", ids=[s.record_id for s in solved[:3]]),
                )
            )
        other = "custo" if request.objective == "massa" else "massa"
        rules.append(
            card(
                f"Otimize por {other}",
                f"O mesmo caso, com o objetivo de {other}, pode mudar o ranking.",
                act("set_param", "objective", other),
            )
        )
        routes = {f"/app/materiais/{i}": f"a ficha de {n}" for i, n in materials.items()}
        return _calculator_context(
            "dimensionar",
            lines,
            result,
            request,
            params,
            labels,
            routes,
            rules,
            "O que o dimensionamento calculado mostra.",
            materials=materials,
        )

    def _sintetizar(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.schemas.synthesis import SynthesisRequest
        from app.services.synthesis_service import SynthesisService

        request = self._calculator_request(raw, SynthesisRequest, "sintetizar")
        preview = SynthesisService(self.db, self.user).preview(request)
        labels = {
            "volume_fraction": "fração volumétrica",
            "relative_density": "densidade relativa",
            "face_thickness": "espessura da face",
            "core_thickness": "espessura do núcleo",
        }
        params = _params({k: v for k, v in request.model_dump().items() if k in labels}, {}, labels)
        lines = [
            f"Receita: {preview.kind_label}; pais: {', '.join(preview.parents)}",
            "Parâmetros: "
            + "; ".join(f"{labels.get(k, k)} = {fmt(v)}" for k, v in preview.parameters.items()),
            "Estimados (regra do servidor): "
            + "; ".join(
                f"{v.name}: {fmt(v.value) if v.value is not None else 'faixa'} {v.canonical_unit or ''}".rstrip()
                for v in preview.values[:_MAX_FACT_ROWS]
            ),
        ]
        if preview.skipped:
            lines.append(
                "Não estimados: " + "; ".join(f"{s.name} ({s.reason})" for s in preview.skipped[:6])
            )
        routes = {f"/app/materiais/{request.parent_a_id}": "a ficha do material-base"}
        rules: list[dict] = []
        if preview.skipped:
            rules.append(
                card(
                    "Propriedades sem estimativa",
                    f"{len(preview.skipped)} propriedades ficaram de fora porque falta valor nos "
                    "pais; completar a ficha do material-base amplia a prévia.",
                    act("open_route", f"/app/materiais/{request.parent_a_id}"),
                )
            )
        rules.append(
            card(
                "Veja o resultado no mapa",
                f"Depois de gravar, {request.name} aparece nos Mapas ao lado dos materiais de origem.",
                act("open_route", "/app/mapas"),
            )
        )
        extra: list[float] = []
        for skipped in preview.skipped:
            extra.extend(numbers_in(skipped.reason))
        return _calculator_context(
            "sintetizar",
            lines,
            preview,
            request,
            params,
            labels,
            routes,
            rules,
            "O que a prévia da síntese mostra.",
            extra_numbers=extra,
            ranges=_SYNTHESIS_RANGES,
        )

    # --- Admin ---------------------------------------------------------------------------------

    def _admin_classes(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.services.taxonomy_service import TaxonomyService

        context = _read(_AdminClassIn, raw, "admin_classes")
        classes = TaxonomyService(self.db, self.user).list_classes()
        wanted = fold(context.name)
        twin = next(
            (c for c in classes if fold(c.name) == wanted and c.slug != (context.slug or "")),
            None,
        )
        examples = [c for c in classes if c.description][:3]
        lines = [
            f"Nome proposto: {context.name}",
            f"Descrição atual: {context.description or 'vazia'}",
            "Classes existentes: " + ", ".join(c.name for c in classes[:30]),
        ]
        for example in examples:
            lines.append(f"Exemplo — {example.name}: {clip(example.description or '', 200)}")
        rules: list[dict] = []
        if twin is not None:
            rules.append(
                card(
                    f"Já existe a classe {twin.name}",
                    f"Há uma classe com o mesmo nome ({twin.name}); reutilize-a em vez de duplicar.",
                    act("open_route", f"/app/catalogo?classe={twin.slug}"),
                )
            )
        if not context.description:
            rules.append(
                card(
                    "Escreva a descrição",
                    "Uma descrição curta ajuda quem filtra o catálogo; ajuste o rascunho abaixo.",
                    act(
                        "fill_text",
                        "description",
                        f"{context.name}: materiais agrupados por composição e comportamento "
                        "semelhantes. Indique a composição típica, como são processados e onde "
                        "são usados.",
                    ),
                )
            )
        rules.append(
            card(
                "Confira as classes",
                "Veja como as classes existentes estão organizadas antes de gravar.",
                act("open_route", "/app/admin/classes"),
            )
        )
        numbers: set[float] = set()
        for example in examples:
            numbers |= numbers_in(example.description or "")
        return SuggestContext(
            tool="admin_classes",
            facts="\n".join(lines),
            numbers=frozenset(numbers),
            allowed=Allowed(
                text_fields={"description": "a descrição"},
                routes={
                    f"/app/catalogo?classe={c.slug}": f"o catálogo de {c.name}" for c in classes
                },
            ),
            rules=tuple(rules[:3]),
            rule_summary="Sugestões para a classe que você está editando.",
        )

    def _admin_propriedades(self, raw: Mapping[str, Any]) -> SuggestContext:
        from app.services.glossary_service import GlossaryService

        context = _read(_AdminPropertyIn, raw, "admin_propriedades")
        props = self.properties()
        wanted = fold(context.name)
        twin = next(
            (
                p
                for p in props
                if (fold(p.name) == wanted or (context.symbol and p.symbol == context.symbol))
                and p.slug != (context.slug or "")
            ),
            None,
        )
        glossary = {e.slug: e for e in GlossaryService().list_entries()}
        entry = glossary.get(context.slug or "") or (glossary.get(twin.slug) if twin else None)
        lines = [
            f"Nome proposto: {context.name}; símbolo: {context.symbol or 'nenhum'}; "
            f"unidade canônica: {context.canonical_unit or 'não informada'}",
            f"Descrição atual: {context.description or 'vazia'}",
            "Propriedades existentes: " + ", ".join(p.name for p in props[:40]),
        ]
        if entry is not None:
            lines.append(f"Verbete do glossário: {clip(entry.summary, 300)}")
        rules: list[dict] = []
        if twin is not None:
            rules.append(
                card(
                    f"Parecida com {twin.name}",
                    f"Já existe a propriedade {twin.name}"
                    + (f" ({twin.symbol})" if twin.symbol else "")
                    + "; confira se não é a mesma grandeza antes de criar outra.",
                    act("open_route", "/app/admin/propriedades"),
                )
            )
        if not context.description:
            text = (
                clip(entry.summary, 500)
                if entry is not None
                else (
                    f"{context.name}"
                    + (f" ({context.symbol})" if context.symbol else "")
                    + (f", expressa em {context.canonical_unit}" if context.canonical_unit else "")
                    + ". Diga como é medida e o que um valor alto ou baixo indica na seleção."
                )
            )
            rules.append(
                card(
                    "Rascunho da descrição",
                    "Um rascunho para a descrição"
                    + (
                        " a partir do verbete do glossário."
                        if entry is not None
                        else "; ajuste antes de gravar."
                    ),
                    act("fill_text", "description", text),
                )
            )
        rules.append(
            card(
                "Veja o glossário",
                "O glossário explica como cada propriedade é medida.",
                act("open_route", "/app/glossario"),
            )
        )
        numbers: set[float] = set()
        if entry is not None:
            numbers |= numbers_in(entry.summary)
        for text in (context.name, context.symbol or "", context.canonical_unit or ""):
            numbers |= numbers_in(text)
        return SuggestContext(
            tool="admin_propriedades",
            facts="\n".join(lines),
            numbers=frozenset(numbers),
            allowed=Allowed(text_fields={"description": "a descrição"}),
            rules=tuple(rules[:3]),
            rule_summary="Sugestões para a propriedade que você está editando.",
        )


# --- helpers ---------------------------------------------------------------------------------------


#: The ranges the calculators accept (their request validation), inside which a
#: model's own number is kept as a "Sugestão da IA, revise" (D-234). They say what
#: the calculator takes, never what is a good value.
_POSITIVE_MASS = NumberRange(low=0.0, high=1.0e6, open_low=True)
_SYNTHESIS_RANGES: dict[str, NumberRange] = {
    "volume_fraction": NumberRange(0.0, 1.0, open_low=True, open_high=True),
    "relative_density": NumberRange(0.0, 1.0, open_low=True, open_high=True),
    "face_thickness": NumberRange(low=0.0, open_low=True),
    "core_thickness": NumberRange(low=0.0, open_low=True),
}


def _same(values: Iterable[Any]) -> Any:
    """The one value every item shares, or None when they differ (or there are none)."""
    distinct = set(values)
    return distinct.pop() if len(distinct) == 1 else None


def _eco_current(request) -> dict[str, Any]:
    """The audit's parameters as the screen holds them, product shape included.

    The product has no ``part_mass`` of its own: it is offered only for a product
    of ONE component (its unit mass), and the other parameters are shared by every
    component or leg or not offered at all — a suggestion never leaves one line behind.
    """
    current = request.model_dump(exclude={"use", "components", "transport_legs"})
    components = request.components or []
    if components:
        current["part_mass"] = components[0].unit_mass if len(components) == 1 else None
        current["recycled_fraction"] = _same(c.recycled_fraction for c in components)
        current["end_of_life"] = _same(c.end_of_life for c in components)
    legs = request.transport_legs or []
    if legs:
        current["transport_distance_km"] = _same(leg.distance_km for leg in legs)
    return current


def _percent(coverage) -> float:
    """Filled share of a coverage, in percent with one decimal (computed here)."""
    slots = getattr(coverage, "slots", None)
    if slots is None:
        slots = coverage.filled + coverage.declared_missing + coverage.not_recorded
    return round(100.0 * coverage.filled / slots, 1) if slots else 0.0


def _flatten(payload: Mapping[str, Any], prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, value in payload.items():
        name = f"{prefix}{key}"
        if isinstance(value, Mapping):
            out |= _flatten(value, f"{name}.")
        else:
            out[name] = value
    return out


def _params(
    current: Mapping[str, Any],
    scenario: Mapping[str, Iterable[float | str]],
    labels: Mapping[str, str],
) -> dict[str, tuple[float | str, ...]]:
    """Each labelled parameter's allowed values: the one on screen and the ones
    a scenario or a default holds (D-224) — never a value a model picks."""
    flat = _flatten(current)
    params: dict[str, tuple[float | str, ...]] = {}
    for name in labels:
        values: list[float | str] = []
        here = flat.get(name)
        if isinstance(here, (int, float)) and not isinstance(here, bool):
            values.append(float(here))
        elif isinstance(here, str) and here:
            values.append(here)
        for option in scenario.get(name, ()):
            option = float(option) if isinstance(option, (int, float)) else option
            if option not in values:
                values.append(option)
        if values:
            params[name] = tuple(values)
    return params


def _back_to_defaults(
    current: Mapping[str, Any],
    params: Mapping[str, tuple[float | str, ...]],
    labels: Mapping[str, str],
) -> list[dict]:
    """A card for the first parameter that left its starting value (D-216)."""
    flat = _flatten(current)
    for name, options in params.items():
        here = flat.get(name)
        if here is None or len(options) < 2:
            continue
        default = options[1]
        if isinstance(default, str) or default == here:
            continue
        return [
            card(
                f"Volte {labels[name]} ao padrão",
                f"O valor de partida de {labels[name]} é {fmt(default)}; o atual é {fmt(here)}.",
                act("set_param", name, default),
            )
        ]
    return []


def _calculator_context(
    tool: str,
    lines: list[str],
    result: BaseModel,
    request: BaseModel,
    params: Mapping[str, tuple[float | str, ...]],
    labels: Mapping[str, str],
    routes: Mapping[str, str],
    rules: list[dict],
    summary: str,
    *,
    materials: Mapping[int, str] | None = None,
    extra_numbers: Iterable[float] = (),
    value_labels: Mapping[str, str] | None = None,
    ranges: Mapping[str, NumberRange] | None = None,
) -> SuggestContext:
    numbers = expand_numbers(
        [*numbers_of(result.model_dump()), *numbers_of(request.model_dump()), *extra_numbers]
    )
    for options in params.values():
        numbers |= expand_numbers(o for o in options if not isinstance(o, str))
    return SuggestContext(
        tool=tool,
        facts="\n".join(line for line in lines if line),
        numbers=frozenset(numbers),
        allowed=Allowed(
            params=dict(params),
            param_labels={k: v for k, v in labels.items() if k in params},
            # A range only for a parameter this screen really has (D-234).
            param_ranges={k: v for k, v in (ranges or {}).items() if k in params},
            value_labels=dict(value_labels or {}),
            routes=dict(routes),
            materials=dict(materials or {}),
        ),
        rules=tuple(rules[:3]),
        rule_summary=summary,
    )


_UNIT_TAIL = re.compile(r"[\(\[].*?[\)\]]")


def _guess_property(column: str, props: list) -> str | None:
    """A catalogue property a column header names, or None — by name, slug or
    symbol, after dropping a unit in brackets. Never a guess by value."""
    header = fold(_UNIT_TAIL.sub(" ", column)).strip()
    if not header:
        return None
    for prop in props:
        if header in {fold(prop.name), fold(prop.slug.replace("_", " ")), prop.slug}:
            return prop.slug
    for prop in props:
        if prop.symbol and column.strip().split(" ")[0] == prop.symbol:
            return prop.slug
    candidates = [p for p in props if fold(p.name) in header or header in fold(p.name)]
    if len(candidates) == 1:
        return candidates[0].slug
    return None
