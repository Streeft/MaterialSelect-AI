---
paths:
  - "apps/api/app/catalog/**"
---

# Catálogo oficial licenciado (D-102)

(Movido do `CLAUDE.md` da raiz sem alteração de texto; carrega só ao tocar nesta área.)

**Catálogo oficial licenciado (D-102).** O corpus externo nunca entra no Git nem em
`seed.py`. `app/catalog/` verifica bundle/manifest/hashes, preserva identidade
externa e só grava depois de `excluir_demo`. Valores não representáveis pelo
modelo numérico atual são preservados em estruturas suplementares e não usados
em cálculo até existir regra determinística. Operação e cutover:
[`docs/18-catalogo-oficial-granta.md`](docs/18-catalogo-oficial-granta.md).

