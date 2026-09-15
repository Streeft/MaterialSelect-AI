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

from app.calculations.synthesis import (
    BASIS_LABELS,
    COMPOSITO,
    ESPUMA,
    KIND_LABELS,
    KIND_NOTES,
    KINDS,
    ParentValue,
    Rule,
    SynthesisError,
    SynthesisResult,
    reasons_for,
    rules_for,
    synthesize_composite,
    synthesize_foam,
)
from app.domain.data_quality import build_interval_value, build_scalar_value
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
    SynthesisPreview,
    SynthesisRequest,
    SynthesisResultOut,
    SynthesizedValueOut,
)
from app.services.audit_service import record_change


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
            if request.volume_fraction is None:
                raise ValidationError("Informe a fração volumétrica do primeiro constituinte.")
            if request.parent_b_id == request.parent_a_id:
                raise ValidationError(
                    "Os dois constituintes são o mesmo material; o resultado seria ele."
                )
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

        if request.parent_b_id is not None:
            raise ValidationError("Uma espuma tem um sólido só.")
        if request.volume_fraction is not None:
            raise ValidationError(
                "Fração volumétrica é campo de compósito e não entra numa espuma."
            )
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


def _rule_out(rule: Rule) -> RuleOut:
    return RuleOut(
        key=rule.key,
        label=rule.label,
        formula=rule.formula,
        basis=rule.basis,
        basis_label=BASIS_LABELS[rule.basis],
    )


__all__ = ["SynthesisService", "COMPOSITO", "ESPUMA"]
