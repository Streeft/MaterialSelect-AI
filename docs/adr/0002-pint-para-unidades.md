# ADR 0002 — Pint para conversão e validação de unidades

- **Status:** aceito
- **Data:** 2026-07 (Fase 1)

## Contexto

A metodologia exige tratamento rigoroso de unidades: converter valores para uma
unidade canônica, validar dimensionalmente, rejeitar unidades incompatíveis e
preservar o rastro da conversão. Implementar isso à mão é propenso a erros
(especialmente conversões com deslocamento, como °C→K, e prefixos SI).

## Decisão

Adotar **Pint** como biblioteca de unidades no backend, encapsulada em
`app/calculations/units.py`. Um único `UnitRegistry` é compartilhado no processo.
As propriedades declaram `canonical_unit` e `physical_dimension` (string Pint), e
todo valor é convertido no momento da escrita, gravando `normalized_value`,
`canonical_unit` e `conversion_method`.

## Alternativas consideradas

- **Conversão manual com fatores tabelados:** rejeitada — frágil, não valida
  dimensões e não trata deslocamentos corretamente.
- **`unyt` / `quantities`:** alternativas válidas, mas Pint tem adoção ampla,
  boa documentação e suporte a dimensionalidade explícita.

## Consequências

- **Positivas:** conversões corretas e testáveis; rejeição de unidades
  incompatíveis; rastreabilidade; reaproveitamento no importador e na validação
  de índices (Fase 4).
- **Negativas:** dependência adicional; algumas unidades de domínio (ex.: dureza
  Vickers, custo por massa) são tratadas como adimensionais nesta fase — uma
  simplificação consciente, documentada no seed.
