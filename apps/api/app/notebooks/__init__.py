"""Cadernos (D-90): a student's private notebooks — sources, chat, notes.

The NotebookLM shape, on top of pieces this codebase already had: the
Cérebro's readers, chunker, BM25 and embeddings do the text work; the AI
layer's guardrails check every number an answer writes. What is new is the
owner: every passage here belongs to one notebook of one student, and
retrieval only ever ranks the passages it is handed from that notebook.
"""
