"""Synthesizer: o lado do catálogo de ``app.calculations.synthesis`` (P3).

Aqui se lê os pais, se roda a lei e se grava o registro derivado. **Nenhuma
decisão de método mora neste arquivo**: qual propriedade tem regra, qual lei
roda, o que acontece quando falta dado e como a qualidade se propaga estão todos
na camada de cálculo. Este serviço encontra números, nomeia propriedades e
persiste.

Três coisas que ele decide, e que são de catálogo e não de método:

**Um registro derivado é sempre de alguém.** Nunca entra no catálogo
compartilhado, porque é hipótese e não entrada de catálogo — e um número
calculado no catálogo de todo mundo pareceria medido para quem não escolheu a
receita. A garantia existe também no banco (``CheckConstraint``), mas é recusada
aqui primeiro, com o motivo escrito, para quem chama a API receber uma frase e
não um erro de integridade.

**Os pais passam pelo mesmo filtro de visibilidade de todo o resto** (P1-4), o
que significa que um registro derivado pode ter como pai outro registro derivado
do mesmo usuário. Isso é deliberado: uma espuma de um compósito é uma pergunta
legítima, e a receita gravada continua reconstruindo a cadeia inteira.

**A classe é exigida e não herdada.** A ferramenta não sabe se uma espuma de
alumínio é "metal" ou "espuma metálica" para quem a está catalogando, e tudo que
lê por classe precisa que alguém tenha decidido.
"""

from __future__ import annotations

from app.calculations.expressions import (
    ExpressionError,
    result_dimension,
    safe_variable,
    validate_names,
)
from app.calculations.family_sweep import sweep_family
from app.calculations.synthesis import (
    BASIS_LABELS,
    COMPOSITO,
    ESPUMA,
    KIND_LABELS,
    KIND_NOTES,
    KINDS,
    PAINEL,
    ParentValue,
    Rule,
    SynthesisError,
    SynthesisResult,
    reasons_for,
    rules_for,
    synthesize_composite,
    synthesize_foam,
    synthesize_sandwich,
)
from app.domain.data_quality import build_interval_value, build_scalar_value
from app.domain.display_units import reading_for
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.models.enums import AuditAction, AuditEntityType
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.models.material_synthesis import MaterialSynthesis
from app.models.property_definition import PropertyDefinition
from app.repositories.audit_repository import AuditRepository
from app.repositories.material_repository import MaterialRepository
from app.schemas.synthesis import (
    KindOut,
    RuleOut,
    SkippedPropertyOut,
    SweepIndexOut,
    SweepOut,
    SweepPropertyOut,
    SweepRequest,
    SweepSkippedStepOut,
    SweepStepOut,
    SweepValueOut,
    SynthesisPreview,
    SynthesisRequest,
    SynthesisResultOut,
    SynthesizedValueOut,
)
from app.services.audit_service import record_change


def _reading_fields(
    definition: PropertyDefinition | None, value: object
) -> dict[str, float | str | None]:
    """Os campos `display_*` de um valor sintetizado (D-70).

    Um sintetizado nasce canônico — a regra de mistura opera sobre os canônicos
    dos pais —, então a conversão sai direto da canônica e não da original: aqui
    não existe "o que a fonte disse", porque não houve fonte. A proveniência
    deste número é a lei que o produziu, e ela não é uma unidade.

    Sem definição no catálogo não há canônica e não há o que converter; os
    campos saem `None`, que é ausência e nunca zero (D-24).
    """
    if definition is None or not definition.canonical_unit:
        return {
            "display_unit": None,
            "display_value": None,
            "display_min": None,
            "display_max": None,
        }
    reading = reading_for(
        canonical_unit=definition.canonical_unit,
        display_unit=definition.display_unit,
        accepted_units=definition.accepted_units or [],
        requested=None,
    )
    return {
        "display_unit": reading.unit,
        "display_value": reading.value(getattr(value, "value", None)),
        "display_min": reading.value(getattr(value, "value_min", None)),
        "display_max": reading.value(getattr(value, "value_max", None)),
    }


class SynthesisService:
    """Cria registros derivados a partir de materiais catalogados."""

    def __init__(self, db, user=None) -> None:
        self.db = db
        self.user = user
        self.viewer_id = user.id if user else None
        self.repo = MaterialRepository(db, self.viewer_id)
        self.audit_repo = AuditRepository(db)

    # --- o catálogo de leis ------------------------------------------------

    def list_kinds(self) -> list[KindOut]:
        """Os tipos de síntese, cada um com as leis e as ausências declaradas."""
        names = self._property_names()
        return [
            KindOut(
                kind=kind,
                label=KIND_LABELS[kind],
                note=KIND_NOTES[kind],
                rules={
                    slug: _rule_out(rule) for slug, rule in rules_for(kind).items() if slug in names
                },
                without_rule={
                    slug: reason for slug, reason in reasons_for(kind).items() if slug in names
                },
            )
            for kind in KINDS
        ]

    # --- a síntese ----------------------------------------------------------

    def preview(self, request: SynthesisRequest) -> SynthesisPreview:
        """O que a receita produziria, sem gravar nada."""
        result, parents = self._run(request)
        return self._preview_out(result, parents)

    def create(self, request: SynthesisRequest) -> SynthesisResultOut:
        """Roda a receita e grava o registro derivado."""
        if self.viewer_id is None:
            raise ValidationError(
                "Um registro sintetizado pertence a quem o criou, e nenhum "
                "usuário foi identificado."
            )
        if self.repo.get_class(request.class_id) is None:
            raise NotFoundError(f"Classe não encontrada: {request.class_id}")
        if self.repo.name_exists(request.name):
            raise ConflictError(f"Já existe um material com o nome: {request.name}")

        result, parents = self._run(request)
        if not result.values:
            # Um registro sem valor nenhum não é material: seria um nome com uma
            # receita e nada dentro. Os motivos já vêm escritos, então a recusa
            # pode dizer exatamente o que faltou.
            raise ValidationError(
                "A receita não produziu valor nenhum: nenhum dos constituintes "
                "tem propriedade que este tipo de síntese saiba combinar."
            )

        material = Material(
            name=request.name.strip(),
            class_id=request.class_id,
            description=request.description,
            keywords=[],
            is_demo=False,
            is_active=True,
            is_synthesized=True,
            owner_id=self.viewer_id,
        )
        self.repo.add(material)
        self.repo.flush()

        definitions = self._definitions()
        for value in result.values:
            definition = definitions[value.slug]
            self.repo.add(self._build_row(material.id, definition, value))

        self.repo.add(
            MaterialSynthesis(
                material_id=material.id,
                kind=result.kind,
                parent_a_id=request.parent_a_id,
                parent_b_id=request.parent_b_id,
                parameters=dict(result.parameters),
            )
        )
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.MATERIAL,
            entity_id=material.id,
            entity_label=material.name,
            action=AuditAction.CRIADO,
        )
        self.repo.commit()

        preview = self._preview_out(result, parents)
        return SynthesisResultOut(
            **preview.model_dump(),
            material_id=material.id,
            material_name=material.name,
        )

    # --- a varredura de família (D-144) ---------------------------------------

    def sweep(self, request: SweepRequest) -> SweepOut:
        """Um índice ao longo de uma família de receitas, sem gravar nada.

        O catálogo é lido **uma vez**: os dois pais, as definições e a
        validação do índice. Cada passo é só a lei pura rodando sobre os mesmos
        valores — nenhuma consulta por passo.
        """
        _refuse_same_parent(request.kind, request.parent_a_id, request.parent_b_id)
        first = self._parent(request.parent_a_id)
        second = self._parent(request.parent_b_id)
        definitions = self._definitions()
        expression = request.index.expression
        dimension = self._validate_index(expression, definitions)

        try:
            result = sweep_family(
                kind=request.kind,
                start=request.start,
                stop=request.stop,
                steps=request.steps,
                spacing=request.spacing,
                first=self._values(first),
                second=self._values(second),
                expression=expression,
                labels={slug: definition.name for slug, definition in definitions.items()},
            )
        except SynthesisError as exc:
            raise ValidationError(str(exc)) from exc

        def name(slug: str) -> str:
            definition = definitions.get(slug)
            return definition.name if definition else slug

        rules: dict[str, Rule] = {}
        for step in result.steps:
            for value in step.synthesis.values:
                rules.setdefault(value.slug, value.rule)

        return SweepOut(
            kind=result.kind,
            kind_label=result.kind_label,
            kind_note=KIND_NOTES[result.kind],
            parents=[first.name, second.name],
            variable=result.variable,
            variable_label=result.variable_label,
            spacing=result.spacing,
            grid=list(result.grid),
            note=result.note,
            index=SweepIndexOut(
                name=request.index.name,
                expression=expression,
                goal=request.index.goal,
                dimension=dimension,
            ),
            properties=[
                SweepPropertyOut(
                    slug=slug,
                    name=name(slug),
                    canonical_unit=definitions[slug].canonical_unit,
                    display_unit=_reading_fields(definitions[slug], None)["display_unit"],
                    rule=_rule_out(rule),
                )
                for slug, rule in sorted(rules.items())
                if slug in definitions
            ],
            steps=[
                SweepStepOut(
                    position=step.position,
                    parameter=step.parameter,
                    parameters=dict(step.parameters),
                    index_value=step.index_value,
                    index_min=step.index_min,
                    index_max=step.index_max,
                    quality=step.quality.value,
                    values=[
                        SweepValueOut(
                            slug=value.slug,
                            value=value.value,
                            value_min=value.value_min,
                            value_max=value.value_max,
                            quality=value.quality.value,
                            **{
                                key: field
                                for key, field in _reading_fields(
                                    definitions.get(value.slug), value
                                ).items()
                                if key != "display_unit"
                            },
                        )
                        for value in step.synthesis.values
                        if value.slug in definitions
                    ],
                )
                for step in result.steps
            ],
            skipped=[
                SweepSkippedStepOut(
                    position=item.position,
                    parameter=item.parameter,
                    parameters=dict(item.parameters),
                    reason=item.reason,
                )
                for item in result.skipped
            ],
            absent=[
                SkippedPropertyOut(slug=item.slug, name=name(item.slug), reason=item.reason)
                for item in result.absent
                if item.slug in definitions
            ],
        )

    def _validate_index(self, expression: str, definitions: dict[str, PropertyDefinition]) -> str:
        """Valida o índice contra o catálogo e devolve a dimensão dele.

        A mesma validação dos mapas e do comparador (nome conhecido, dimensão
        coerente): um índice que não passa ali não passa aqui.
        """
        var_to_slug = {safe_variable(slug): slug for slug in definitions}
        try:
            used = validate_names(expression, set(var_to_slug))
            return result_dimension(
                expression,
                {var: definitions[var_to_slug[var]].canonical_unit for var in used},
            )
        except ExpressionError as exc:
            raise ValidationError(str(exc)) from exc

    # --- interno ------------------------------------------------------------

    def _run(self, request: SynthesisRequest) -> tuple[SynthesisResult, list[Material]]:
        """Valida a receita, lê os pais e roda a lei."""
        first = self._parent(request.parent_a_id)
        if request.kind == COMPOSITO:
            if request.parent_b_id is None:
                raise ValidationError("Um compósito precisa de dois constituintes.")
            if request.relative_density is not None:
                raise ValidationError(
                    "Densidade relativa é campo de espuma e não entra num compósito."
                )
            if request.face_thickness is not None or request.core_thickness is not None:
                raise ValidationError("Espessura é campo de painel e não entra num compósito.")
            if request.volume_fraction is None:
                raise ValidationError("Informe a fração volumétrica do primeiro constituinte.")
            _refuse_same_parent(COMPOSITO, request.parent_a_id, request.parent_b_id)
            second = self._parent(request.parent_b_id)
            try:
                result = synthesize_composite(
                    fraction=request.volume_fraction,
                    first=self._values(first),
                    second=self._values(second),
                )
            except SynthesisError as exc:
                raise ValidationError(str(exc)) from exc
            return result, [first, second]

        if request.kind == PAINEL:
            if request.parent_b_id is None:
                raise ValidationError("Um painel sanduíche precisa de uma face e de um núcleo.")
            if request.volume_fraction is not None:
                raise ValidationError(
                    "Fração volumétrica é campo de compósito: num painel quem decide "
                    "as frações é a razão entre as espessuras."
                )
            if request.relative_density is not None:
                raise ValidationError(
                    "Densidade relativa é campo de espuma e não entra num painel."
                )
            if request.face_thickness is None or request.core_thickness is None:
                raise ValidationError("Informe a espessura da face e a do núcleo.")
            _refuse_same_parent(PAINEL, request.parent_a_id, request.parent_b_id)
            second = self._parent(request.parent_b_id)
            try:
                result = synthesize_sandwich(
                    face_thickness=request.face_thickness,
                    core_thickness=request.core_thickness,
                    face=self._values(first),
                    core=self._values(second),
                )
            except SynthesisError as exc:
                raise ValidationError(str(exc)) from exc
            return result, [first, second]

        if request.parent_b_id is not None:
            raise ValidationError("Uma espuma tem um sólido só.")
        if request.volume_fraction is not None:
            raise ValidationError(
                "Fração volumétrica é campo de compósito e não entra numa espuma."
            )
        if request.face_thickness is not None or request.core_thickness is not None:
            raise ValidationError("Espessura é campo de painel e não entra numa espuma.")
        if request.relative_density is None:
            raise ValidationError("Informe a densidade relativa da espuma.")
        try:
            result = synthesize_foam(
                relative_density=request.relative_density, solid=self._values(first)
            )
        except SynthesisError as exc:
            raise ValidationError(str(exc)) from exc
        return result, [first]

    def _parent(self, material_id: int) -> Material:
        material = self.repo.get_material(material_id)
        if material is None:
            # O mesmo 404 que um registro escondido recebe, pela mesma razão de
            # sempre: outra resposta diria se ele existe.
            raise NotFoundError(f"Material não encontrado: {material_id}")
        return material

    @staticmethod
    def _values(material: Material) -> dict[str, ParentValue]:
        """Os valores utilizáveis de um pai, por slug.

        Linha marcada ausente, linha sem valor normalizado e slug sem linha
        nenhuma dão no mesmo aqui: a lei não tem o que ler (princípio 3).
        """
        values: dict[str, ParentValue] = {}
        for value in material.property_values:
            if value.is_missing or value.normalized_value is None:
                continue
            values[value.property_definition.slug] = ParentValue(
                value=float(value.normalized_value), quality=value.data_quality
            )
        return values

    def _definitions(self) -> dict[str, PropertyDefinition]:
        return {definition.slug: definition for definition in self.repo.list_properties()}

    def _property_names(self) -> dict[str, str]:
        return {slug: definition.name for slug, definition in self._definitions().items()}

    @staticmethod
    def _build_row(
        material_id: int, definition: PropertyDefinition, value
    ) -> MaterialPropertyValue:
        """Uma linha de valor derivado, com a lei gravada na proveniência.

        O valor já vem em unidade canônica — ele foi calculado a partir de
        valores normalizados —, então a "conversão" é a identidade e o que o
        trilho de proveniência carrega de útil é a **lei**, escrita em
        ``notes``. É ela que faz deste número um valor calculado e não um valor
        inventado.
        """
        unit = definition.canonical_unit
        if value.value is None:
            normalized = build_interval_value(value.value_min, value.value_max, unit, unit)
        else:
            normalized = build_scalar_value(value.value, unit, unit)
        return MaterialPropertyValue(
            material_id=material_id,
            property_id=definition.id,
            value_scalar=normalized.value_scalar,
            value_min=normalized.value_min,
            value_max=normalized.value_max,
            value_typical=normalized.value_typical,
            original_unit=normalized.original_unit,
            normalized_value=normalized.normalized_value,
            canonical_unit=normalized.canonical_unit,
            conversion_method=normalized.conversion_method,
            notes=value.note,
            data_quality=value.quality,
            is_missing=False,
        )

    def _preview_out(self, result: SynthesisResult, parents: list[Material]) -> SynthesisPreview:
        definitions = self._definitions()

        def name(slug: str) -> str:
            definition = definitions.get(slug)
            return definition.name if definition else slug

        return SynthesisPreview(
            kind=result.kind,
            kind_label=result.kind_label,
            kind_note=KIND_NOTES[result.kind],
            parents=[parent.name for parent in parents],
            parameters=dict(result.parameters),
            values=[
                SynthesizedValueOut(
                    slug=value.slug,
                    name=name(value.slug),
                    canonical_unit=(
                        definitions[value.slug].canonical_unit
                        if value.slug in definitions
                        else None
                    ),
                    value=value.value,
                    value_min=value.value_min,
                    value_max=value.value_max,
                    rule=_rule_out(value.rule),
                    quality=value.quality.value,
                    **_reading_fields(definitions.get(value.slug), value),
                )
                for value in result.values
                if value.slug in definitions
            ],
            skipped=[
                SkippedPropertyOut(slug=item.slug, name=name(item.slug), reason=item.reason)
                for item in result.skipped
                if item.slug in definitions
            ],
        )


def _refuse_same_parent(kind: str, parent_a_id: int, parent_b_id: int | None) -> None:
    """Dois pais iguais não fazem compósito nem painel — o resultado seria ele.

    Compartilhado pela prévia e pela varredura, para as duas recusarem a mesma
    receita com a mesma frase.
    """
    if parent_a_id != parent_b_id:
        return
    if kind == PAINEL:
        raise ValidationError(
            "A face e o núcleo são o mesmo material; o painel seria uma placa maciça dele."
        )
    raise ValidationError("Os dois constituintes são o mesmo material; o resultado seria ele.")


def _rule_out(rule: Rule) -> RuleOut:
    return RuleOut(
        key=rule.key,
        label=rule.label,
        formula=rule.formula,
        basis=rule.basis,
        basis_label=BASIS_LABELS[rule.basis],
    )


__all__ = ["SynthesisService", "COMPOSITO", "ESPUMA", "PAINEL"]
