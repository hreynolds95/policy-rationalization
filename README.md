# Compliance Rationalizer

Compliance Rationalizer helps review a policy and standards library for duplication, consolidation opportunities, and policy-level review flags before edits are made.

## Primary experience

The deployable app now lives in [`docs/`](/Users/hreynolds/Documents/Rationalization/docs). It is a static GitHub Pages site, so it can be shared without the local Python server.

What the Pages app supports:
- Built-in sample library for demos and stakeholder walkthroughs
- Public URL imports for CORS-friendly `.txt`, `.md`, `.html`, or exported Google Docs/Sheets links
- File uploads for `.txt`, `.md`, `.markdown`, and `.csv`
- Manual paste mode for ad hoc side-by-side comparisons
- Browser-side duplicate grouping and consolidation recommendations

What the analysis checks:
- Preserve required structure and required language
- Keep roles and responsibilities materially consistent, including CPC and CCO references
- Flag missing brand scope coverage
- Flag missing regulatory language coverage
- Flag procedural content that belongs in standards or procedures rather than policies

## GitHub Pages deployment

This repo is set up to publish from the `docs/` folder on the default branch. Once the repository exists on GitHub, enable Pages with source `main` and path `/docs`, or use the GitHub Pages API to do the same.

## Local preview

If you want a quick local preview before or after deploy, any static file server will work. For example:

```bash
cd /Users/hreynolds/Documents/Rationalization
python3 -m http.server 8000
```

Then open [http://127.0.0.1:8000/docs/](http://127.0.0.1:8000/docs/).

## Legacy CLI

The original Python pipeline still exists under [`src/compliance_rationalizer`](/Users/hreynolds/Documents/Rationalization/src/compliance_rationalizer) for local batch analysis and report generation.

## Tests

Python tests:

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py'
```

Pages analysis tests:

```bash
node --test tests/pages_analysis.test.mjs
```
