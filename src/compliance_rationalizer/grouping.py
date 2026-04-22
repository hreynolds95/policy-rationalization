from __future__ import annotations

from collections import defaultdict

from .models import Document, DuplicateGroup, SimilarityEdge


class DisjointSet:
    def __init__(self) -> None:
        self.parent: dict[int, int] = {}

    def find(self, x: int) -> int:
        if x not in self.parent:
            self.parent[x] = x
        if self.parent[x] != x:
            self.parent[x] = self.find(self.parent[x])
        return self.parent[x]

    def union(self, a: int, b: int) -> None:
        root_a = self.find(a)
        root_b = self.find(b)
        if root_a != root_b:
            self.parent[root_b] = root_a


def build_groups(documents: list[Document], edges: list[SimilarityEdge]) -> list[DuplicateGroup]:
    dsu = DisjointSet()
    for doc in documents:
        dsu.find(doc.id)

    edge_lookup: dict[tuple[int, int], float] = {}
    for edge in edges:
        dsu.union(edge.left_id, edge.right_id)
        key = tuple(sorted((edge.left_id, edge.right_id)))
        edge_lookup[key] = edge.score

    components: dict[int, list[int]] = defaultdict(list)
    for doc in documents:
        components[dsu.find(doc.id)].append(doc.id)

    doc_by_id = {d.id: d for d in documents}
    groups: list[DuplicateGroup] = []
    for ids in components.values():
        if len(ids) < 2:
            continue
        ids_sorted = sorted(ids)

        pair_scores: list[float] = []
        for i in range(len(ids_sorted)):
            for j in range(i + 1, len(ids_sorted)):
                score = edge_lookup.get((ids_sorted[i], ids_sorted[j]))
                if score is not None:
                    pair_scores.append(score)

        avg_score = sum(pair_scores) / len(pair_scores) if pair_scores else 0.0
        # Prefer shorter path depth and larger file length as "primary" canonical source.
        primary = min(
            ids_sorted,
            key=lambda doc_id: (
                len(doc_by_id[doc_id].path.parts),
                -len(doc_by_id[doc_id].text),
                str(doc_by_id[doc_id].path),
            ),
        )
        groups.append(
            DuplicateGroup(
                document_ids=tuple(ids_sorted),
                avg_internal_similarity=round(avg_score, 4),
                recommended_primary_id=primary,
            )
        )

    return sorted(groups, key=lambda g: (g.avg_internal_similarity, len(g.document_ids)), reverse=True)
