from __future__ import annotations

import csv
from pathlib import Path

from .models import Document

SUPPORTED_EXTENSIONS = {".txt", ".md", ".markdown"}


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")


def _is_google_auth_page(text: str) -> bool:
    lower = text.lower()
    return (
        "<!doctype html>" in lower
        and "sign in to your google account" in lower
        and "docs.google.com" in lower
    )


def load_documents(root: Path) -> list[Document]:
    docs: list[Document] = []
    candidates = sorted(
        p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    for idx, path in enumerate(candidates):
        text = _read_text(path).strip()
        if not text:
            continue
        if _is_google_auth_page(text):
            continue
        docs.append(Document(id=idx, path=path, title=path.stem, text=text))

    return docs


def _select_text_column(fieldnames: list[str]) -> str | None:
    preferred = (
        "content",
        "document_text",
        "text",
        "policy_text",
        "body",
        "summary",
        "description",
    )
    lowered = {name.lower(): name for name in fieldnames}
    for key in preferred:
        if key in lowered:
            return lowered[key]
    return None


def _select_title_column(fieldnames: list[str]) -> str | None:
    preferred = (
        "title",
        "document_name",
        "policy_name",
        "policy",
        "name",
        "id",
    )
    lowered = {name.lower(): name for name in fieldnames}
    for key in preferred:
        if key in lowered:
            return lowered[key]
    return None


def load_documents_from_policy_csv(csv_path: Path) -> list[Document]:
    raw = _read_text(csv_path).strip()
    if not raw:
        return []
    if _is_google_auth_page(raw):
        raise ValueError(
            "CSV export appears to be a Google sign-in page, not data. "
            "Share the sheet for link-view access or provide a downloaded CSV."
        )

    with csv_path.open("r", encoding="utf-8", errors="ignore", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            return []

        text_col = _select_text_column(reader.fieldnames)
        if text_col is None:
            raise ValueError(
                "Could not infer policy text column in CSV. "
                "Expected one of: content, document_text, text, policy_text, body, summary, description."
            )
        title_col = _select_title_column(reader.fieldnames)

        docs: list[Document] = []
        for idx, row in enumerate(reader):
            text = (row.get(text_col) or "").strip()
            if not text:
                continue
            title = (row.get(title_col) or f"row_{idx+1}").strip() if title_col else f"row_{idx+1}"
            docs.append(
                Document(
                    id=idx,
                    path=Path(f"{csv_path.name}#row-{idx+1}"),
                    title=title,
                    text=text,
                )
            )
        return docs
