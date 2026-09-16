"""Service layer: orchestrates repositories and domain rules.

Routers call services; services own business logic and never expose ORM objects
directly. This keeps controllers thin and the logic testable in isolation.
"""
