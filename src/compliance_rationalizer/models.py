from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Document:
    id: int
    path: Path
    title: str
    text: str


@dataclass(frozen=True)
class SimilarityEdge:
    left_id: int
    right_id: int
    score: float


@dataclass(frozen=True)
class DuplicateGroup:
    document_ids: tuple[int, ...]
    avg_internal_similarity: float
    recommended_primary_id: int
