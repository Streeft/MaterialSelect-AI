"""Deterministic calculation layer.

Everything numeric that the system produces lives here (or in ``domain``): unit
conversion, dimensional validation, and — in later phases — performance indices
and ranking. The AI layer must never compute these values.
"""
