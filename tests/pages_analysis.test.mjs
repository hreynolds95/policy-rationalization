import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeDocuments,
  evaluateDocumentLevel,
  normalizeGoogleExportUrl,
  parseCsv,
  tokenize,
} from "../docs/analysis.mjs";

test("tokenize normalizes simple policy text", () => {
  assert.deepEqual(tokenize("Roles and Responsibilities for CPC/CCO"), [
    "roles",
    "and",
    "responsibilities",
    "for",
    "cpc",
    "cco",
  ]);
});

test("normalizeGoogleExportUrl rewrites docs and sheets links", () => {
  assert.equal(
    normalizeGoogleExportUrl("https://docs.google.com/document/d/abc123/edit?tab=t.0"),
    "https://docs.google.com/document/d/abc123/export?format=txt"
  );
  assert.equal(
    normalizeGoogleExportUrl("https://docs.google.com/spreadsheets/d/sheet123/edit?gid=77#gid=77"),
    "https://docs.google.com/spreadsheets/d/sheet123/export?format=csv&gid=77"
  );
});

test("parseCsv extracts documents from an inferred content column", () => {
  const documents = parseCsv(
    'policy_name,content\n"Policy A","retain records under regulatory requirements"\n"Policy B","vendor oversight"\n',
    "library.csv"
  );

  assert.equal(documents.length, 2);
  assert.equal(documents[0].title, "Policy A");
  assert.match(documents[0].source, /library\.csv#row-1/);
});

test("analyzeDocuments groups related retention documents", () => {
  const result = analyzeDocuments(
    [
      {
        id: "a",
        title: "Data Retention Policy",
        source: "manual://a",
        text: "retention requirements brands subsidiaries roles and responsibilities cpc cco regulatory legal hold",
      },
      {
        id: "b",
        title: "Records Retention Standard",
        source: "manual://b",
        text: "retention obligations brands affiliates roles and responsibilities cpc cco regulatory legal requirements",
      },
      {
        id: "c",
        title: "Vendor Risk Policy",
        source: "manual://c",
        text: "third party vendor onboarding risk tiers compliance oversight",
      },
    ],
    0.25
  );

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].documentIds.length, 2);
  assert.equal(result.groups[0].checks.rolesSectionDetected, "yes");
});

test("evaluateDocumentLevel flags procedural content inside a policy", () => {
  const level = evaluateDocumentLevel({
    title: "Access Control Policy",
    text: "Purpose scope and governance statements. Step 1 submit the form. Step 2 get manager approval.",
  });

  assert.equal(level.inferredType, "policy");
  assert.equal(level.levelFit, "misaligned");
  assert.ok(level.levelIssues.some((issue) => issue.includes("procedural")));
});

test("analyzeDocuments exposes mixed-level groups for review", () => {
  const result = analyzeDocuments(
    [
      {
        id: "a",
        title: "Data Retention Policy",
        source: "manual://a",
        text: "policy purpose scope applies must retain records across brands and legal entities",
      },
      {
        id: "b",
        title: "Data Retention Procedure",
        source: "manual://b",
        text: "data retention procedure workflow for records retention. step 1 identify records. step 2 archive records. step 3 confirm retention completion.",
      },
    ],
    0.05
  );

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].checks.documentLevelConsistency, "mixed-level");
  assert.equal(result.groups[0].checks.documentLevelFit, "review-needed");
});
