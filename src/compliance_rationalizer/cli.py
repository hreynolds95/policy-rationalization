from __future__ import annotations

import argparse
from pathlib import Path

from .grouping import build_groups
from .ingest import load_documents, load_documents_from_policy_csv
from .reporting import write_groups_json, write_markdown_report, write_similarity_csv
from .similarity import pairwise_similarity


def _is_google_auth_page(text: str) -> bool:
    lower = text.lower()
    return (
        "<!doctype html>" in lower
        and "sign in to your google account" in lower
        and "docs.google.com" in lower
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Evaluate compliance policy/standard libraries for redundant documents "
            "that are candidates for consolidation."
        )
    )
    parser.add_argument("--docs-dir", type=Path, help="Root folder containing policy documents")
    parser.add_argument(
        "--policy-library-csv",
        type=Path,
        help="CSV export of policy library (must include a content/text-like column)",
    )
    parser.add_argument(
        "--initial-recommendations-file",
        type=Path,
        help="Path to initial consolidation recommendations text file for report context",
    )
    parser.add_argument("--output-dir", type=Path, default=Path("output"), help="Directory for reports")
    parser.add_argument(
        "--similarity-threshold",
        type=float,
        default=0.5,
        help="Minimum cosine similarity score to treat two documents as related",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    docs = load_documents(args.docs_dir) if args.docs_dir else []
    if args.policy_library_csv:
        docs = load_documents_from_policy_csv(args.policy_library_csv)
    if not args.docs_dir and not args.policy_library_csv:
        raise SystemExit("Provide either --docs-dir or --policy-library-csv.")
    if len(docs) < 2:
        raise SystemExit("Need at least two non-empty documents to compare.")

    edges = pairwise_similarity(docs, threshold=args.similarity_threshold)
    groups = build_groups(docs, edges)
    docs_by_id = {d.id: d for d in docs}
    initial_recommendations_text = None
    if args.initial_recommendations_file:
        candidate = args.initial_recommendations_file.read_text(
            encoding="utf-8", errors="ignore"
        ).strip()
        if _is_google_auth_page(candidate):
            print(
                "Warning: initial recommendations file appears to be Google sign-in HTML; skipping snapshot embed."
            )
        else:
            initial_recommendations_text = candidate

    output_dir = args.output_dir
    write_similarity_csv(output_dir / "similarity_pairs.csv", edges, docs_by_id)
    write_groups_json(output_dir / "duplicate_groups.json", groups, docs_by_id)
    write_markdown_report(
        output_dir / "rationalization_report.md",
        groups,
        edges,
        docs_by_id,
        initial_recommendations_text=initial_recommendations_text,
    )

    print(f"Analyzed {len(docs)} documents")
    print(f"Found {len(edges)} high-similarity pairs and {len(groups)} duplicate groups")
    print(f"Report written to: {output_dir / 'rationalization_report.md'}")


if __name__ == "__main__":
    main()
