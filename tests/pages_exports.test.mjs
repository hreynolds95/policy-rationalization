import test from "node:test";
import assert from "node:assert/strict";

import { analyzeDocuments } from "../docs/analysis.mjs";
import { buildCsvExport, buildExportPayload, buildMarkdownExport } from "../docs/app.mjs";

test("buildCsvExport includes requirement-level mapping review fields", () => {
  const result = analyzeDocuments(
    [
      {
        id: "a",
        title: "Records Retention Policy",
        source: "manual://a",
        text: "policy purpose scope must retain records across brands and legal entities",
      },
      {
        id: "b",
        title: "Records Retention Procedure",
        source: "manual://b",
        text: "procedure workflow for records retention. step 1 identify records. step 2 archive records.",
      },
    ],
    0.05,
    { b: "policy" }
  );

  const payload = buildExportPayload(result, [], "", "all", 0.05);
  const csv = buildCsvExport(payload);

  assert.match(csv, /document_title,source,requirement_id,section,anchor,document_type,requirement_type,hierarchy_alignment/);
  assert.match(csv, /group_bucket,group_review_status,canonical_document,canonical_requirement_text,requirement_text/);
  assert.match(csv, /Records Retention Procedure/);
  assert.match(csv, /procedure-like content/);
  assert.match(csv, /policy/);
  assert.match(csv, /material-change/);
});

test("buildMarkdownExport summarizes the current visible analysis view", () => {
  const result = analyzeDocuments(
    [
      {
        id: "a",
        title: "Data Classification Policy",
        source: "manual://a",
        text: "policy purpose scope applies must classify records across brands and entities",
      },
      {
        id: "b",
        title: "Data Classification Standard",
        source: "manual://b",
        text: "standard baseline control requirements for classification legal regulatory requirements",
      },
    ],
    0.05
  );

  const payload = buildExportPayload(result, ["sample import issue"], "", "all", 0.05);
  const markdown = buildMarkdownExport(payload);

  assert.match(markdown, /# Policy Rationalization Analysis/);
  assert.match(markdown, /## Policy-On-Policies Hierarchy/);
  assert.match(markdown, /## Quick Wins/);
  assert.match(markdown, /## Material Changes/);
  assert.match(markdown, /## Document Coverage/);
  assert.match(markdown, /## Requirement Inventory/);
  assert.match(markdown, /## Requirement Pair Review/);
  assert.match(markdown, /sample import issue/);
});
