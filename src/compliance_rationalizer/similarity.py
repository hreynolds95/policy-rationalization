from __future__ import annotations

import math
import re
from collections import Counter

from .models import Document, SimilarityEdge

TOKEN_RE = re.compile(r"[a-zA-Z][a-zA-Z0-9_\-]+")


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in TOKEN_RE.findall(text)]


def _tf(tokens: list[str]) -> Counter[str]:
    return Counter(tokens)


def _idf(tokenized_docs: list[list[str]]) -> dict[str, float]:
    n_docs = len(tokenized_docs)
    doc_freq: Counter[str] = Counter()
    for tokens in tokenized_docs:
        doc_freq.update(set(tokens))

    return {
        term: math.log((1 + n_docs) / (1 + df)) + 1.0
        for term, df in doc_freq.items()
    }


def _vectorize(tf: Counter[str], idf: dict[str, float]) -> dict[str, float]:
    return {term: freq * idf.get(term, 0.0) for term, freq in tf.items()}


def _cosine_similarity(v1: dict[str, float], v2: dict[str, float]) -> float:
    if not v1 or not v2:
        return 0.0

    dot = 0.0
    if len(v1) > len(v2):
        v1, v2 = v2, v1
    for term, value in v1.items():
        dot += value * v2.get(term, 0.0)

    norm1 = math.sqrt(sum(v * v for v in v1.values()))
    norm2 = math.sqrt(sum(v * v for v in v2.values()))
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0

    return dot / (norm1 * norm2)


def pairwise_similarity(documents: list[Document], threshold: float = 0.5) -> list[SimilarityEdge]:
    tokenized = [tokenize(d.text) for d in documents]
    idf = _idf(tokenized)
    vectors = [_vectorize(_tf(tokens), idf) for tokens in tokenized]

    edges: list[SimilarityEdge] = []
    for i in range(len(documents)):
        for j in range(i + 1, len(documents)):
            score = _cosine_similarity(vectors[i], vectors[j])
            if score >= threshold:
                edges.append(
                    SimilarityEdge(
                        left_id=documents[i].id,
                        right_id=documents[j].id,
                        score=round(score, 4),
                    )
                )

    return sorted(edges, key=lambda e: e.score, reverse=True)
