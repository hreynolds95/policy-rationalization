from __future__ import annotations

import csv
import json
from pathlib import Path

from .models import Document, DuplicateGroup, SimilarityEdge
from .rules import evaluate_group_constraints


def write_similarity_csv(path: Path, edges: list[SimilarityEdge], docs_by_id: dict[int, Document]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["left_path", "right_path", "similarity"])
        for e in edges:
            writer.writerow([docs_by_id[e.left_id].path, docs_by_id[e.right_id].path, e.score])


def write_groups_json(path: Path, groups: list[DuplicateGroup], docs_by_id: dict[int, Document]) -> None:
    payload = []
    for group in groups:
        payload.append(
            {
                "documents": [str(docs_by_id[doc_id].path) for doc_id in group.document_ids],
                "avg_internal_similarity": group.avg_internal_similarity,
                "recommended_primary": str(docs_by_id[group.recommended_primary_id].path),
                "constraints": evaluate_group_constraints(group, docs_by_id),
            }
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_markdown_report(
    path: Path,
    groups: list[DuplicateGroup],
    edges: list[SimilarityEdge],
    docs_by_id: dict[int, Document],
    initial_recommendations_text: str | None = None,
) -> None:
    lines = [
        "# Compliance Rationalization Report",
        "",
        "## Guardrails Applied",
        "- Keep existing document structure and required language unchanged.",
        "- Keep roles/responsibilities materially consistent (e.g., CPC/CCO); allow only additive specificity.",
        "- Do not introduce procedural/process-step content into policies.",
        "- Validate brand scope and regulatory reflection before consolidation.",
        "",
        "## Duplicate Group Candidates",
    ]

    if not groups:
        lines.extend(["", "No duplicate groups found at current threshold."])
    else:
        for idx, group in enumerate(groups, start=1):
            primary = docs_by_id[group.recommended_primary_id]
            checks = evaluate_group_constraints(group, docs_by_id)
            lines.extend(
                [
                    "",
                    f"### Group {idx}",
                    f"- Average internal similarity: `{group.avg_internal_similarity}`",
                    f"- Recommended canonical document: `{primary.path}`",
                    "- Constraint checks:",
                    f"  - Business practice alignment: `{checks['business_practice_alignment']}`",
                    f"  - Brand scope coverage: `{checks['brand_scope_coverage']}`",
                    f"  - Regulatory reflection: `{checks['regulatory_reflection']}`",
                    f"  - Procedural content detected: `{checks['procedural_content_detected']}`",
                    f"  - Roles section detected: `{checks['roles_section_detected']}`",
                    "- Documents:",
                ]
            )
            for doc_id in group.document_ids:
                lines.append(f"  - `{docs_by_id[doc_id].path}`")

    lines.extend(["", "## High-Similarity Pairs"])
    if not edges:
        lines.extend(["", "No pairwise similarities met threshold."])
    else:
        for edge in edges[:50]:
            left = docs_by_id[edge.left_id].path
            right = docs_by_id[edge.right_id].path
            lines.append(f"- `{edge.score}`: `{left}` <> `{right}`")

    if initial_recommendations_text:
        lines.extend(
            [
                "",
                "## Existing Consolidation Recommendations (Input Snapshot)",
                "",
                "```text",
                initial_recommendations_text[:4000],
                "```",
            ]
        )

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
