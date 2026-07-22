"""Repositories: the only layer that talks to the database directly.

All queries use SQLAlchemy's parameterised query builder — never raw string
concatenation — to avoid SQL injection.
"""
