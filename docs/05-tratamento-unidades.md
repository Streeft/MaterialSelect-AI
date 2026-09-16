# Tratamento de unidades e rastreabilidade

A biblioteca [Pint](https://pint.readthedocs.io/) é usada no backend para
conversão e validação dimensional. A implementação está em
`apps/api/app/calculations/units.py`.

## Rastro de conversão

Para cada valor, armazenamos:

| Campo | Significado |
|---|---|
| `value_scalar` / `value_min` / `value_max` / `value_typical` | valor(es) **original(is)** informado(s) |
| `original_unit` | unidade original de entrada |
| `normalized_value` | valor convertido para a unidade canônica |
| `canonical_unit` | unidade canônica da propriedade (definida em `PropertyDefinition`) |
| `conversion_method` | rastro reproduzível, ex.: `pint:GPa->Pa` ou `identity:MPa` |

A conversão ocorre **no momento da escrita** (seed agora; importador depois). A
leitura nunca recalcula, garantindo reprodutibilidade.

## Funções

- `to_canonical(value, from_unit, canonical_unit) -> (normalized_value, method)`
  — converte e devolve o rastro. Unidades idênticas retornam o valor inalterado
  com método `identity:*`.
- `validate_dimension(unit, expected_dimension) -> bool` — verifica se a unidade
  tem a dimensão física esperada (string Pint, ex.:
  `"[mass] / [length] / [time] ** 2"`). Dimensão vazia = sem restrição.
- `parse_decimal_comma(raw) -> float` — interpreta números com **vírgula
  decimal** (`"69,5"` → `69.5`), separador de milhar por espaço e **notação
  científica** (`"1,2e3"` → `1200`). Reaproveitado pelo importador futuro.

## Erros tratados

- **Unidade desconhecida** → `UnitError`.
- **Unidades incompatíveis** (ex.: comprimento → pressão) → `UnitError`
  (não há coerção silenciosa).
- **Intervalo invertido** (`min > max`) → `ValueError` na camada de domínio.
- **Escala logarítmica com valor ≤ 0** → o frontend omite o ponto e avisa
  (log não é definido para valores não positivos).

## Casos cobertos por teste

`apps/api/app/tests/test_units.py` e `test_data_quality.py` cobrem: `GPa→Pa`,
`g/cm³→kg/m³`, `°C→K` (deslocamento, não escala), vírgula decimal, notação
científica, unidade incompatível, intervalo invertido e a garantia de que **dado
ausente permanece ausente** (nunca convertido em zero).
