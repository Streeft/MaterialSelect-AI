"""Suggestions for every tool of the app (D-228): the pure half.

``POST /api/ai/suggest {tool, context}`` answers "what could I do next on this
screen?" with up to three cards, each with typed **actions** a screen can
apply on the person's click. This module holds what does not need a database:
the contract the model sees (prompt and JSON schema), the reading of its answer
and the guardrails every card passes before anyone sees it.

The guarantees are the layer's, the same as everywhere else in ``app/ai``:

* **Entities must exist.** An action names a property, index, preset, material,
  route, column or field the *server* listed for this screen
  (:class:`Allowed`); anything else is removed, with the reason in
  ``rejected``.
* **Numbers come from the context.** The prose may only cite figures the server
  read or computed for this context (D-224) — ``ungrounded_numbers`` decides —
  and a ``set_param`` value must be one the context or a scenario holds.
* **Actions of another screen are removed.** Each tool has its own list.
* **Nothing is applied here.** An action is a proposal the screen shows as a
  button; the person clicks it, or not.

The context itself — validated and enriched from the database or from the
backend's own calculation — is built in ``app/services/ai_suggest.py``.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field

from app.ai.guardrails import is_grounded, numbers_in, ungrounded_numbers

TOOLS: tuple[str, ...] = (
    "mapas",
    "comparar",
    "catalogo",
    "ficha",
    "processos",
    "glossario",
    "sintetizar",
    "painel",
    "registros",
    "importar",
    "dimensionar",
    "custo",
    "eco",
    "baterias",
    "admin_classes",
    "admin_propriedades",
)

TOOL_LABELS: dict[str, str] = {
    "mapas": "Mapas de propriedades",
    "comparar": "Comparar materiais",
    "catalogo": "Catálogo",
    "ficha": "Ficha do material",
    "processos": "Processos",
    "glossario": "Glossário",
    "sintetizar": "Sintetizar material",
    "painel": "Painel do catálogo",
    "registros": "Meus registros",
    "importar": "Importar dados",
    "dimensionar": "Dimensionar",
    "custo": "Custo da peça",
    "eco": "Auditoria ecológica",
    "baterias": "Baterias",
    "admin_classes": "Administração de classes",
    "admin_propriedades": "Administração de propriedades",
}

ACTION_TYPES: tuple[str, ...] = (
    "set_axes",
    "apply_preset",
    "set_index",
    "add_filter",
    "sort",
    "search",
    "open_route",
    "compare",
    "set_param",
    "map_column",
    "fill_text",
)

#: The actions each screen knows how to apply. A model action outside its
#: tool's list is removed, whatever it says.
ACTIONS_BY_TOOL: dict[str, tuple[str, ...]] = {
    "mapas": ("set_axes", "apply_preset", "set_index", "open_route"),
    "comparar": ("compare", "set_axes", "open_route"),
    "catalogo": ("add_filter", "sort", "search", "compare", "open_route"),
    "ficha": ("compare", "open_route"),
    "processos": ("search", "open_route"),
    "glossario": ("search", "open_route"),
    "sintetizar": ("set_param", "open_route"),
    "painel": ("open_route",),
    "registros": ("compare", "open_route"),
    "importar": ("map_column", "open_route"),
    "dimensionar": ("set_param", "compare", "open_route"),
    "custo": ("set_param", "open_route"),
    "eco": ("set_param", "open_route"),
    "baterias": ("set_param", "open_route"),
    "admin_classes": ("fill_text", "open_route"),
    "admin_propriedades": ("fill_text", "open_route"),
}

#: How the three model-side fields carry each action (the schema is flat so a
#: small model gets it right): ``target``, ``value`` and ``ids``.
ACTION_DOCS: dict[str, str] = {
    "set_axes": "target = slug do eixo X; value = slug do eixo Y",
    "apply_preset": "target = id do mapa clássico",
    "set_index": "target = slug do índice de desempenho",
    "add_filter": "target = campo do filtro; value = valor do filtro",
    "sort": "target = chave de ordenação; value = asc ou desc",
    "search": "value = texto curto a buscar",
    "open_route": "target = rota do app",
    "compare": "ids = ids dos materiais (2 a 5)",
    "set_param": "target = nome do parâmetro; value = um dos valores listados",
    "map_column": "target = nome da coluna do arquivo; value = slug da propriedade",
    "fill_text": "target = campo do formulário; value = texto proposto",
}

#: Every page an ``open_route`` may point at, with how a button names it. A
#: material's or a process's page is allowed only when the builder listed it.
STATIC_ROUTES: dict[str, str] = {
    "/app": "o Início",
    "/app/mapas": "os Mapas",
    "/app/comparar": "Comparar",
    "/app/catalogo": "o Catálogo",
    "/app/processos": "os Processos",
    "/app/glossario": "o Glossário",
    "/app/glossario/familias": "as famílias do Glossário",
    "/app/sintetizar": "Sintetizar",
    "/app/painel": "o Painel",
    "/app/meus-registros": "Meus registros",
    "/app/importar": "Importar",
    "/app/dimensionar": "Dimensionar",
    "/app/custo": "Custo",
    "/app/eco": "Eco",
    "/app/baterias": "Baterias",
    "/app/selecao": "a Seleção",
    "/app/cadernos": "os Cadernos",
    "/app/admin/classes": "as classes",
    "/app/admin/propriedades": "as propriedades",
}

MAX_SUGGESTIONS = 3
MAX_ACTIONS = 3
MAX_TITLE = 90
MAX_BODY = 420
MAX_TEXT = 600
MAX_QUERY = 80
#: Longest context text the prompt carries — the free quota counts tokens.
MAX_FACTS = 2500
#: How many allowed values of one kind the prompt lists (the check uses all).
MAX_LISTED = 30


@dataclass(frozen=True)
class Allowed:
    """What the actions of one screen may name — built by the server."""

    properties: Mapping[str, str] = field(default_factory=dict)
    indices: Mapping[str, str] = field(default_factory=dict)
    presets: Mapping[str, str] = field(default_factory=dict)
    materials: Mapping[int, str] = field(default_factory=dict)
    #: Extra routes (a material's sheet, a process page) → how a button names it.
    routes: Mapping[str, str] = field(default_factory=dict)
    #: Filter field → {value → label}.
    filters: Mapping[str, Mapping[str, str]] = field(default_factory=dict)
    filter_labels: Mapping[str, str] = field(default_factory=dict)
    sort_keys: Mapping[str, str] = field(default_factory=dict)
    #: Parameter → the values the context or a scenario holds (D-224).
    params: Mapping[str, tuple[float | str, ...]] = field(default_factory=dict)
    param_labels: Mapping[str, str] = field(default_factory=dict)
    #: How a button names a text value of a parameter (a chemistry's slug → name).
    value_labels: Mapping[str, str] = field(default_factory=dict)
    columns: tuple[str, ...] = ()
    text_fields: Mapping[str, str] = field(default_factory=dict)

    def canonical(self) -> dict:
        return {
            "properties": sorted(self.properties.items()),
            "indices": sorted(self.indices.items()),
            "presets": sorted(self.presets.items()),
            "materials": sorted(self.materials.items()),
            "routes": sorted(self.routes.items()),
            "filters": sorted((k, sorted(v.items())) for k, v in self.filters.items()),
            "sort_keys": sorted(self.sort_keys.items()),
            "params": sorted((k, [str(x) for x in v]) for k, v in self.params.items()),
            "columns": list(self.columns),
            "text_fields": sorted(self.text_fields.items()),
        }


@dataclass(frozen=True)
class SuggestContext:
    """One screen's state as the model may see it, and what it may name."""

    tool: str
    #: Compact PT-BR text: what the screen shows, read or computed by the server.
    facts: str
    #: Every figure the prose may cite: the facts' own numbers and the ones the
    #: backend read or computed for this context.
    numbers: frozenset[float]
    allowed: Allowed
    #: Deterministic suggestions from local rules, in the model's answer shape —
    #: what the simulated provider answers and what a failure degrades to.
    rules: tuple[dict, ...] = ()
    rule_summary: str = ""

    def fingerprint(self) -> str:
        material = json.dumps(
            [self.tool, self.facts, sorted(self.numbers), self.allowed.canonical()],
            ensure_ascii=False,
            sort_keys=True,
            default=str,
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def all_numbers(self) -> set[float]:
        return set(self.numbers) | numbers_in(self.facts)


# --- building blocks for the context builders and the rules -----------------


def act(type_: str, target: object = "", value: object = "", ids: Iterable[object] = ()) -> dict:
    """One action in the model's (flat) answer shape."""
    return {
        "type": type_,
        "target": "" if target is None else str(target),
        "value": "" if value is None else _plain(value),
        "ids": [str(i) for i in ids],
    }


def card(title: str, body: str, *actions: dict) -> dict:
    """One suggestion in the model's answer shape."""
    return {"title": title, "body": body, "actions": list(actions)}


def expand_numbers(values: Iterable[float | int | None]) -> set[float]:
    """The figures a backend number may be written as: itself, rounded to 0–4
    decimals or 1–4 significant figures, and a fraction as a percentage.

    Rounding a number the server computed is still the server's number; a
    figure no rounding of any context number reaches is an invention.
    """
    out: set[float] = set()
    for value in values:
        if value is None or isinstance(value, bool):
            continue
        number = float(value)
        if not math.isfinite(number):
            continue
        variants = [number]
        if abs(number) <= 1.0:
            variants.append(number * 100.0)
        for variant in variants:
            out.add(variant)
            for digits in range(5):
                out.add(round(variant, digits))
            for figures in range(1, 5):
                out.add(float(f"{variant:.{figures}g}"))
    return out


def numbers_of(payload: object) -> list[float]:
    """Every numeric leaf of a JSON-like structure."""
    found: list[float] = []

    def walk(node: object) -> None:
        if isinstance(node, bool):
            return
        if isinstance(node, (int, float)):
            found.append(float(node))
        elif isinstance(node, Mapping):
            for item in node.values():
                walk(item)
        elif isinstance(node, (list, tuple)):
            for item in node:
                walk(item)

    walk(payload)
    return found


def fmt(value: float | str) -> str:
    """A number as a person in Brazil reads it (decimal comma)."""
    if isinstance(value, str):
        return value
    text = f"{value:.6g}"
    return text.replace(".", ",") if "e" not in text else text


def clip(text: str, limit: int) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


# --- the contract the model sees --------------------------------------------

SUGGEST_RULES = """\
Você sugere próximos passos na ferramenta «{label}» do MaterialSelect AI, um app \
de ensino de seleção de materiais. Escreva em português do Brasil, curto e direto.
Regras:
1. No máximo 3 sugestões; título de até 8 palavras; texto de até 2 frases.
2. Números: cite apenas números que aparecem no CONTEXTO. Nunca estime nem invente \
valores de materiais, custos ou resultados.
3. Ações: só os tipos e identificadores listados em AÇÕES; campos que não se \
aplicam ficam vazios. Nada é aplicado sem o clique do usuário.
4. Sem sugestão útil, devolva "suggestions": []."""


def suggest_system(context: SuggestContext) -> str:
    return SUGGEST_RULES.format(label=TOOL_LABELS.get(context.tool, context.tool))


def suggest_user(context: SuggestContext) -> str:
    lines = ["CONTEXTO:", clip_block(context.facts, MAX_FACTS), "", "AÇÕES:"]
    for type_ in ACTIONS_BY_TOOL.get(context.tool, ()):
        options = _options_for(type_, context.allowed)
        line = f"- {type_}: {ACTION_DOCS[type_]}"
        if options:
            line += f". Opções: {options}"
        lines.append(line)
    return "\n".join(lines)


def clip_block(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _listed(items: Iterable[str]) -> str:
    items = list(items)
    shown = items[:MAX_LISTED]
    more = len(items) - len(shown)
    return ", ".join(shown) + (f" (+{more})" if more > 0 else "")


def _options_for(type_: str, allowed: Allowed) -> str:
    if type_ == "set_axes":
        return _listed(f"{slug} ({name})" for slug, name in allowed.properties.items())
    if type_ == "apply_preset":
        return _listed(f"{slug} ({name})" for slug, name in allowed.presets.items())
    if type_ == "set_index":
        return _listed(f"{slug} ({name})" for slug, name in allowed.indices.items())
    if type_ == "add_filter":
        return "; ".join(f"{name}: {_listed(values)}" for name, values in allowed.filters.items())
    if type_ == "sort":
        return _listed(allowed.sort_keys)
    if type_ == "open_route":
        return _listed([*allowed.routes, *STATIC_ROUTES])
    if type_ == "compare":
        return _listed(f"{i} ({name})" for i, name in allowed.materials.items())
    if type_ == "set_param":
        return "; ".join(
            f"{name} ∈ {{{', '.join(_plain(v) for v in values)}}}"
            for name, values in allowed.params.items()
        )
    if type_ == "map_column":
        columns = _listed(f"«{c}»" for c in allowed.columns)
        return f"colunas {columns}; propriedades {_listed(allowed.properties)}"
    if type_ == "fill_text":
        return _listed(allowed.text_fields)
    return ""


def suggest_schema(context: SuggestContext) -> dict:
    """The answer's shape. Flat actions (three fields) on purpose: a small free
    model fills a fixed shape far more reliably than a union of eleven."""
    types = list(ACTIONS_BY_TOOL.get(context.tool, ()))
    action = {
        "type": "object",
        "additionalProperties": False,
        "required": ["type", "target", "value", "ids"],
        "properties": {
            "type": {"type": "string", "enum": types},
            "target": {"type": "string"},
            "value": {"type": "string"},
            "ids": {"type": "array", "items": {"type": "string"}},
        },
    }
    suggestion = {
        "type": "object",
        "additionalProperties": False,
        "required": ["title", "body", "actions"],
        "properties": {
            "title": {"type": "string"},
            "body": {"type": "string"},
            "actions": {"type": "array", "items": action},
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["summary", "suggestions"],
        "properties": {
            "summary": {"type": "string"},
            "suggestions": {"type": "array", "items": suggestion},
        },
    }


# The diagnosis' probe: the smallest JSON answer that proves the path works.
PROBE_SYSTEM = "Teste de conexão do MaterialSelect AI. Responda somente com o JSON pedido."
PROBE_USER = 'Devolva exatamente {"ok": true, "palavra": "material"}.'
PROBE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["ok", "palavra"],
    "properties": {"ok": {"type": "boolean"}, "palavra": {"type": "string"}},
}


# --- reading the answer -------------------------------------------------------


def read_suggestions(raw: object) -> dict:
    """Coerce a model answer into the flat shape the guardrails check.

    Coercion only: nothing is judged here. A wrong slug passes through so the
    guardrail can reject it *and say so*.
    """
    data = raw if isinstance(raw, Mapping) else {}
    suggestions = []
    for item in _as_list(data.get("suggestions")):
        if not isinstance(item, Mapping):
            continue
        actions = []
        for action in _as_list(item.get("actions")):
            if not isinstance(action, Mapping):
                continue
            actions.append(
                {
                    "type": _text(action.get("type")),
                    "target": _text(action.get("target")),
                    "value": _plain(action.get("value")),
                    "ids": [_plain(i) for i in _as_list(action.get("ids"))],
                }
            )
        suggestions.append(
            {"title": _text(item.get("title")), "body": _text(item.get("body")), "actions": actions}
        )
    return {"summary": _text(data.get("summary")), "suggestions": suggestions}


# --- the guardrails -------------------------------------------------------------


@dataclass
class Checked:
    summary: str
    suggestions: list[dict]
    rejected: list[str]


def check_suggestions(raw: Mapping, context: SuggestContext) -> Checked:
    """Every card and every action against what the server listed.

    A card whose prose cites a number the context does not hold is dropped
    whole (its actions were argued with that number); an invalid action is
    removed and the card stays.
    """
    allowed_numbers = context.all_numbers()
    rejected: list[str] = []
    accepted: list[dict] = []
    for item in _as_list(raw.get("suggestions")):
        if not isinstance(item, Mapping):
            continue
        title = clip(_text(item.get("title")), MAX_TITLE)
        body = clip(_text(item.get("body")), MAX_BODY)
        if not title or not body:
            rejected.append("Sugestão descartada: sem título ou sem texto.")
            continue
        invented = ungrounded_numbers(f"{title}\n{body}", allowed_numbers)
        if invented:
            rejected.append(
                f"Sugestão «{title}» descartada: cita números que não estão no contexto "
                f"({', '.join(f'{v:g}' for v in invented)})."
            )
            continue
        actions: list[dict] = []
        for action in _as_list(item.get("actions")):
            if not isinstance(action, Mapping):
                continue
            typed, reason = check_action(action, context, allowed_numbers)
            if reason:
                rejected.append(reason)
            elif typed is not None and typed not in actions and len(actions) < MAX_ACTIONS:
                actions.append(typed)
        accepted.append({"title": title, "body": body, "actions": actions})
        if len(accepted) == MAX_SUGGESTIONS:
            break
    summary = clip(_text(raw.get("summary")), MAX_BODY)
    if summary and ungrounded_numbers(summary, allowed_numbers):
        rejected.append("O resumo citava números que não estão no contexto e foi trocado.")
        summary = ""
    return Checked(summary=summary, suggestions=accepted, rejected=rejected)


def check_action(
    action: Mapping, context: SuggestContext, numbers: set[float]
) -> tuple[dict | None, str | None]:
    """One action → its typed form (with the button's label), or the reason
    it was removed."""
    allowed = context.allowed
    type_ = _text(action.get("type"))
    target = _text(action.get("target"))
    value = _plain(action.get("value")).strip()
    tool_label = TOOL_LABELS.get(context.tool, context.tool)
    if type_ not in ACTION_TYPES:
        return None, f"Ação desconhecida removida: «{type_}»."
    if type_ not in ACTIONS_BY_TOOL.get(context.tool, ()):
        return None, f"Ação «{type_}» removida: não pertence à ferramenta {tool_label}."

    if type_ == "set_axes":
        for axis, slug in (("X", target), ("Y", value)):
            if slug not in allowed.properties:
                return None, f"Eixo {axis} removido: propriedade inexistente «{slug}»."
        if target == value:
            return None, "Eixos removidos: a mesma propriedade nos dois eixos."
        label = f"Eixos: {allowed.properties[target]} × {allowed.properties[value]}"
        return {"type": type_, "x": target, "y": value, "label": label}, None

    if type_ == "apply_preset":
        if target not in allowed.presets:
            return None, f"Mapa clássico removido: «{target}» não existe."
        label = f"Abrir o mapa {allowed.presets[target]}"
        return {"type": type_, "id": target, "label": label}, None

    if type_ == "set_index":
        if target not in allowed.indices:
            return None, f"Índice removido: «{target}» não existe no catálogo."
        label = f"Usar o índice {allowed.indices[target]}"
        return {"type": type_, "slug": target, "label": label}, None

    if type_ == "add_filter":
        values = allowed.filters.get(target)
        if values is None:
            return None, f"Filtro removido: o campo «{target}» não existe nesta tela."
        if value not in values:
            return None, f"Filtro removido: «{value}» não é um valor de «{target}»."
        label = f"Filtrar {allowed.filter_labels.get(target, target)}: {values[value]}"
        return {"type": type_, "field": target, "value": value, "label": label}, None

    if type_ == "sort":
        if target not in allowed.sort_keys:
            return None, f"Ordenação removida: «{target}» não é uma chave desta tela."
        direction = value.lower() or "asc"
        if direction not in ("asc", "desc"):
            return None, f"Ordenação removida: direção «{value}» inválida."
        order = "crescente" if direction == "asc" else "decrescente"
        label = f"Ordenar por {allowed.sort_keys[target]} ({order})"
        return {"type": type_, "prop": target, "dir": direction, "label": label}, None

    if type_ == "search":
        query = clip(value or target, MAX_QUERY)
        if not query:
            return None, "Busca removida: sem texto."
        if ungrounded_numbers(query, numbers):
            return None, f"Busca removida: «{query}» cita números fora do contexto."
        return {"type": type_, "q": query, "label": f"Buscar “{query}”"}, None

    if type_ == "open_route":
        path = target
        name = STATIC_ROUTES.get(path) or allowed.routes.get(path)
        if name is None:
            return None, f"Rota removida: «{path}» não é uma página conhecida do app."
        return {"type": type_, "path": path, "label": f"Abrir {name}"}, None

    if type_ == "compare":
        ids: list[int] = []
        for raw_id in _as_list(action.get("ids")):
            try:
                material_id = int(str(raw_id).strip())
            except ValueError:
                return None, f"Comparação removida: id inválido «{raw_id}»."
            if material_id not in allowed.materials:
                return None, f"Comparação removida: material {material_id} não está no contexto."
            if material_id not in ids:
                ids.append(material_id)
        if not 2 <= len(ids) <= 5:
            return None, "Comparação removida: precisa de 2 a 5 materiais."
        return {"type": type_, "ids": ids, "label": f"Comparar {len(ids)} materiais"}, None

    if type_ == "set_param":
        options = allowed.params.get(target)
        if options is None:
            return None, f"Parâmetro removido: «{target}» não existe nesta tela."
        chosen = _match_option(value, options)
        if chosen is None:
            return None, (
                f"Parâmetro «{target}» removido: o valor «{value}» não vem do contexto "
                "nem de um cenário."
            )
        shown = (
            allowed.value_labels.get(chosen, fmt(chosen))
            if isinstance(chosen, str)
            else fmt(chosen)
        )
        label = f"{allowed.param_labels.get(target, target)}: {shown}"
        return {"type": type_, "name": target, "value": chosen, "label": label}, None

    if type_ == "map_column":
        if target not in allowed.columns:
            return None, f"Mapeamento removido: a coluna «{target}» não está no arquivo."
        if value not in allowed.properties:
            return None, f"Mapeamento removido: propriedade inexistente «{value}»."
        label = f"Coluna “{target}” → {allowed.properties[value]}"
        return {"type": type_, "col": target, "prop": value, "label": label}, None

    # fill_text
    if target not in allowed.text_fields:
        return None, f"Texto removido: o campo «{target}» não existe neste formulário."
    text = clip(value, MAX_TEXT)
    if not text:
        return None, "Texto removido: vazio."
    if ungrounded_numbers(text, numbers):
        return None, f"Texto para «{target}» removido: cita números fora do contexto."
    label = f"Preencher {allowed.text_fields[target]}"
    return {"type": type_, "field": target, "text": text, "label": label}, None


def _match_option(value: str, options: tuple[float | str, ...]) -> float | str | None:
    numeric = _to_float(value)
    for option in options:
        if isinstance(option, str):
            if option == value:
                return option
        elif numeric is not None and is_grounded(numeric, {float(option)}):
            return float(option)
    return None


# --- coercions ----------------------------------------------------------------


def _as_list(value: object) -> list:
    return list(value) if isinstance(value, (list, tuple)) else []


def _text(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def _plain(value: object) -> str:
    """A value as text: a number without float noise, anything else stripped."""
    if value is None or isinstance(value, bool):
        return "" if value is None else str(value).lower()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    if isinstance(value, (int, float)):
        return repr(value)
    return str(value).strip()


def _to_float(text: str) -> float | None:
    cleaned = text.strip().replace(" ", "")
    if cleaned.count(",") == 1 and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        number = float(cleaned)
    except ValueError:
        return None
    return number if math.isfinite(number) else None
