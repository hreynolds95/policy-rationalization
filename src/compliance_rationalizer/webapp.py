from __future__ import annotations

import argparse
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

from .grouping import build_groups
from .rules import evaluate_group_constraints
from .sample_data import load_sample_documents, sample_urls_text
from .similarity import pairwise_similarity
from .url_ingest import load_documents_from_urls


def _parse_urls(raw: str) -> list[str]:
    lines = [line.strip() for line in raw.splitlines()]
    return [line for line in lines if line and not line.startswith("#")]


def _render_form(
    default_threshold: float = 0.45,
    urls_text: str = "",
    error: str = "",
    use_sample: bool = False,
) -> str:
    error_html = f"<p class='error'>{html.escape(error)}</p>" if error else ""
    sample_checked = "checked" if use_sample else ""
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Compliance Rationalizer</title>
  <style>
    :root {{
      --bg: #f2f4ee;
      --ink: #112018;
      --accent: #1f6f5f;
      --accent-2: #a8d5ba;
      --warn: #8a2d1b;
      --card: #ffffff;
      --line: #d8e2d6;
    }}
    body {{
      margin: 0;
      color: var(--ink);
      font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
      background: radial-gradient(circle at 20% 10%, #d7ebde 0%, var(--bg) 55%);
    }}
    main {{
      max-width: 980px;
      margin: 24px auto;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 20px;
      box-shadow: 0 6px 20px rgba(17, 32, 24, 0.08);
    }}
    h1 {{ margin: 0 0 12px; }}
    p {{ line-height: 1.45; }}
    textarea {{
      width: 100%;
      min-height: 220px;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      font-size: 14px;
      font-family: "IBM Plex Mono", "Menlo", monospace;
      box-sizing: border-box;
    }}
    input[type='number'] {{
      width: 120px;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid var(--line);
    }}
    button {{
      margin-top: 12px;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 10px;
      padding: 10px 16px;
      font-weight: 600;
      cursor: pointer;
    }}
    .error {{
      color: var(--warn);
      font-weight: 600;
    }}
    .hint {{
      background: #eff8f4;
      border-left: 4px solid var(--accent-2);
      padding: 10px 12px;
      border-radius: 6px;
      margin: 12px 0;
    }}
  </style>
</head>
<body>
  <main>
    <h1>Compliance Rationalizer</h1>
    <p>Paste multiple policy/standard URLs and run one-pass redundancy analysis with consolidation recommendations.</p>
    <div class="hint">
      Keep required language and structure unchanged. Roles and responsibilities should remain consistent (CPC/CCO), with only additive specificity.
    </div>
    {error_html}
    <form method="post" action="/analyze">
      <p>
        <label>
          <input type="checkbox" name="use_sample" value="1" {sample_checked}>
          Use built-in sample dataset (recommended for demos and team walkthroughs)
        </label>
      </p>
      <p>
        <button type="submit" name="prefill_sample_urls" value="1">Load Sample URLs Into Text Box</button>
      </p>
      <label for="urls"><strong>Document URLs</strong> (one per line)</label>
      <textarea id="urls" name="urls" placeholder="https://...">{html.escape(urls_text)}</textarea>
      <p>
        <label for="threshold"><strong>Similarity threshold</strong></label><br>
        <input id="threshold" name="threshold" type="number" min="0" max="1" step="0.01" value="{default_threshold}">
      </p>
      <button type="submit">Run Rationalization Analysis</button>
    </form>
  </main>
</body>
</html>
"""


def _render_results(
    urls: list[str],
    threshold: float,
    errors: list[str],
    docs_count: int,
    edges_count: int,
    groups: list[dict[str, str]],
    top_pairs: list[tuple[float, str, str]],
) -> str:
    error_list = "".join(f"<li>{html.escape(err)}</li>" for err in errors) or "<li>None</li>"
    group_html = ""
    if not groups:
        group_html = "<p>No duplicate groups found at this threshold.</p>"
    else:
        blocks = []
        for idx, g in enumerate(groups, start=1):
            doc_items = "".join(f"<li>{html.escape(doc)}</li>" for doc in g["documents"])
            checks = "".join(
                f"<li><strong>{html.escape(k)}</strong>: {html.escape(v)}</li>"
                for k, v in g["checks"].items()
            )
            blocks.append(
                f"""
<section class="card">
  <h3>Group {idx}</h3>
  <p><strong>Avg similarity:</strong> {g["avg"]}</p>
  <p><strong>Recommended canonical:</strong> {html.escape(g["primary"])}</p>
  <p><strong>Consolidation recommendation:</strong> {html.escape(g["recommendation"])}</p>
  <p><strong>Constraint checks:</strong></p>
  <ul>{checks}</ul>
  <p><strong>Documents:</strong></p>
  <ul>{doc_items}</ul>
</section>
"""
            )
        group_html = "".join(blocks)

    pairs_html = "".join(
        f"<li>{score:.4f}: {html.escape(left)} ↔ {html.escape(right)}</li>"
        for score, left, right in top_pairs
    ) or "<li>None above threshold</li>"

    url_items = "".join(f"<li>{html.escape(u)}</li>" for u in urls)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rationalization Results</title>
  <style>
    :root {{
      --bg: #f5f7f3;
      --ink: #152018;
      --accent: #1f6f5f;
      --card: #ffffff;
      --line: #dbe4d8;
      --warn: #8a2d1b;
    }}
    body {{ margin: 0; background: var(--bg); color: var(--ink); font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif; }}
    main {{ max-width: 1100px; margin: 20px auto; padding: 0 14px 24px; }}
    h1, h2 {{ margin-bottom: 8px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }}
    .card {{
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0 4px 12px rgba(21, 32, 24, 0.06);
      margin-bottom: 12px;
    }}
    .error {{ color: var(--warn); }}
    a.button {{
      display: inline-block; margin: 6px 0 12px; text-decoration: none;
      color: white; background: var(--accent); padding: 8px 12px; border-radius: 8px;
    }}
    ul {{ margin-top: 6px; }}
    code {{ background: #ecf2ec; padding: 1px 4px; border-radius: 4px; }}
  </style>
</head>
<body>
  <main>
    <h1>Rationalization Results</h1>
    <a class="button" href="/">Analyze Another Set</a>
    <div class="grid">
      <section class="card">
        <h2>Summary</h2>
        <ul>
          <li>Input URLs: {len(urls)}</li>
          <li>Analyzed documents: {docs_count}</li>
          <li>High-similarity pairs: {edges_count}</li>
          <li>Duplicate groups: {len(groups)}</li>
          <li>Threshold: <code>{threshold:.2f}</code></li>
        </ul>
      </section>
      <section class="card">
        <h2>Input URLs</h2>
        <ul>{url_items}</ul>
      </section>
      <section class="card">
        <h2>Fetch/Parse Issues</h2>
        <ul class="error">{error_list}</ul>
      </section>
    </div>

    <h2>Consolidation Candidates</h2>
    {group_html}

    <section class="card">
      <h2>Top Similarity Pairs</h2>
      <ul>{pairs_html}</ul>
    </section>
  </main>
</body>
</html>
"""


class RationalizerHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path not in {"/", "/index.html"}:
            self.send_error(404, "Not found")
            return
        body = _render_form(urls_text=sample_urls_text()).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/analyze":
            self.send_error(404, "Not found")
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8", errors="ignore")
        params = parse_qs(raw)
        urls_text = params.get("urls", [""])[0]
        threshold_raw = params.get("threshold", ["0.45"])[0]
        use_sample = params.get("use_sample", ["0"])[0] == "1"
        prefill_sample_urls = params.get("prefill_sample_urls", ["0"])[0] == "1"

        try:
            threshold = float(threshold_raw)
        except ValueError:
            threshold = 0.45
        threshold = max(0.0, min(1.0, threshold))

        if prefill_sample_urls:
            body = _render_form(
                default_threshold=threshold,
                urls_text=sample_urls_text(),
                use_sample=use_sample,
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        urls = _parse_urls(urls_text)
        if not use_sample and len(urls) < 2:
            body = _render_form(
                default_threshold=threshold,
                urls_text=urls_text,
                error="Please provide at least two URLs.",
                use_sample=use_sample,
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if use_sample:
            docs = load_sample_documents()
            errors = []
            urls = [str(doc.path) for doc in docs]
        else:
            docs, errors = load_documents_from_urls(urls)
        if len(docs) < 2:
            body = _render_form(
                default_threshold=threshold,
                urls_text=urls_text,
                error="Could not extract at least two documents. Check URL access permissions.",
                use_sample=use_sample,
            ).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        edges = pairwise_similarity(docs, threshold=threshold)
        groups = build_groups(docs, edges)
        docs_by_id = {d.id: d for d in docs}

        group_payload: list[dict[str, str]] = []
        for group in groups:
            checks = evaluate_group_constraints(group, docs_by_id)
            primary = str(docs_by_id[group.recommended_primary_id].path)
            others = [
                str(docs_by_id[doc_id].path)
                for doc_id in group.document_ids
                if doc_id != group.recommended_primary_id
            ]
            recommendation = (
                f"Retain {primary} as canonical; consider consolidating {len(others)} related documents "
                "after manual legal/compliance review for structure, required language, brand scope, and regulatory fit."
            )
            group_payload.append(
                {
                    "avg": f"{group.avg_internal_similarity:.4f}",
                    "primary": primary,
                    "documents": [str(docs_by_id[d].path) for d in group.document_ids],
                    "checks": checks,
                    "recommendation": recommendation,
                }
            )

        top_pairs = [
            (
                edge.score,
                str(docs_by_id[edge.left_id].path),
                str(docs_by_id[edge.right_id].path),
            )
            for edge in edges[:20]
        ]
        body = _render_results(
            urls=urls,
            threshold=threshold,
            errors=errors,
            docs_count=len(docs),
            edges_count=len(edges),
            groups=group_payload,
            top_pairs=top_pairs,
        ).encode("utf-8")

        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run local web UI for URL-based compliance rationalization analysis."
    )
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind")
    parser.add_argument("--port", type=int, default=8080, help="Port to bind")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    server = ThreadingHTTPServer((args.host, args.port), RationalizerHandler)
    print(f"Compliance Rationalizer UI running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
