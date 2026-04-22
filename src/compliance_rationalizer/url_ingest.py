from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from .models import Document


class _HTMLTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            stripped = data.strip()
            if stripped:
                self._chunks.append(stripped)

    def text(self) -> str:
        return "\n".join(self._chunks)


def _is_google_auth_page(text: str) -> bool:
    lower = text.lower()
    return (
        "<!doctype html>" in lower
        and "sign in to your google account" in lower
        and "docs.google.com" in lower
    )


def _google_export_url(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path
    if "docs.google.com" not in host:
        return url

    doc_match = re.search(r"/document/d/([^/]+)", path)
    if doc_match:
        doc_id = doc_match.group(1)
        return f"https://docs.google.com/document/d/{doc_id}/export?format=txt"

    sheet_match = re.search(r"/spreadsheets/d/([^/]+)", path)
    if sheet_match:
        sheet_id = sheet_match.group(1)
        query = parse_qs(parsed.query)
        gid = query.get("gid", ["0"])[0]
        return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"

    return url


def _extract_text(url: str, body: str, content_type: str) -> str:
    lower_type = content_type.lower()
    if "text/html" in lower_type:
        parser = _HTMLTextExtractor()
        parser.feed(body)
        parser.close()
        return parser.text()
    return body


def load_documents_from_urls(urls: list[str], timeout_seconds: int = 20) -> tuple[list[Document], list[str]]:
    docs: list[Document] = []
    errors: list[str] = []

    for idx, original_url in enumerate(urls):
        target_url = _google_export_url(original_url.strip())
        if not target_url:
            continue
        try:
            req = Request(
                target_url,
                headers={
                    "User-Agent": "compliance-rationalizer/0.1 (+local-web-ui)",
                    "Accept": "text/plain,text/csv,text/html;q=0.9,*/*;q=0.8",
                },
            )
            with urlopen(req, timeout=timeout_seconds) as response:
                content_type = response.headers.get("Content-Type", "")
                body = response.read().decode("utf-8", errors="ignore")
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{original_url}: fetch failed ({exc})")
            continue

        if _is_google_auth_page(body):
            errors.append(
                f"{original_url}: Google authentication required (share publicly or provide exported file)"
            )
            continue

        text = _extract_text(original_url, body, content_type).strip()
        if not text:
            errors.append(f"{original_url}: no text content extracted")
            continue

        parsed = urlparse(original_url)
        title = Path(parsed.path.rstrip("/")).name or f"doc_{idx+1}"
        docs.append(Document(id=idx, path=Path(original_url), title=title, text=text))

    return docs, errors
