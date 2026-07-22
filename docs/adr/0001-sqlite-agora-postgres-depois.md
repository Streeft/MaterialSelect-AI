# ADR 0001 — SQLite em desenvolvimento, PostgreSQL como alvo de produção

- **Status:** aceito
- **Data:** 2026-07 (Fase 1)

## Contexto

O ambiente de desenvolvimento atual não possui Docker nem PostgreSQL instalados,
e o objetivo imediato é uma fatia vertical executável com o mínimo de atrito. Ao
mesmo tempo, o produto final deve rodar em PostgreSQL.

## Decisão

Usar **SQLite** como banco de desenvolvimento/testes e manter **PostgreSQL** como
alvo de produção, com acesso via **SQLAlchemy** (ORM) e migrations por
**Alembic**. O tipo `JSON` do SQLAlchemy é usado para listas (keywords,
accepted_units), pois é portável entre os dois bancos. As migrations usam
`render_as_batch` quando em SQLite (necessário para `ALTER`).

O `DATABASE_URL` é configurável por variável de ambiente; trocar para PostgreSQL
não exige mudança de código, apenas de configuração e execução das migrations.

## Consequências

- **Positivas:** atrito zero para iniciar; testes rápidos (SQLite em memória);
  caminho de produção preservado.
- **Negativas / riscos:** diferenças de comportamento entre SQLite e PostgreSQL
  (tipos, constraints, concorrência). Mitigação: usar apenas recursos portáveis
  do SQLAlchemy e validar em PostgreSQL antes de produção. Um `docker-compose.yml`
  com PostgreSQL já está incluído como scaffold para essa validação.
