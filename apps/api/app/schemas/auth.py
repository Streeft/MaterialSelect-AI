"""Contracts for the auth endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class UserOut(BaseModel):
    """The logged-in user and the project their studies live in."""

    id: int
    email: str
    name: str
    avatar_url: str | None
    project_id: int
