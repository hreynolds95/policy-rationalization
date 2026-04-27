import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeDocuments,
  evaluateDocumentLevel,
  extractRequirementsFromDocument,
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

test("extractRequirementsFromDocument splits bullet and sentence requirements with anchors", () => {
  const requirements = extractRequirementsFromDocument(
    {
      id: "policy-1",
      title: "Access Policy",
      text: [
        "Access Requirements",
        "",
        "- Access must be approved by a manager.",
        "- Access must be reviewed quarterly.",
        "",
        "Logging Requirements",
        "",
        "Logs must be retained for one year. Logs must be available for compliance review.",
      ].join("\n"),
    },
    "policy"
  );

  assert.equal(requirements.length, 4);
  assert.equal(requirements[0].sourceLocation.section, "Access Requirements");
  assert.equal(requirements[0].sourceLocation.itemIndex, 1);
  assert.match(requirements[3].requirementText, /compliance review/);
  assert.equal(requirements[3].requirementType, "policy-level requirement");
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

test("analyzeDocuments supports reviewer document type overrides", () => {
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
        text: "data retention procedure workflow for records retention. step 1 identify records. step 2 archive records.",
      },
    ],
    0.05,
    { b: "policy" }
  );

  const overridden = result.documents.find((document) => document.id === "b");
  assert.equal(overridden.documentLevel.autoInferredType, "procedure");
  assert.equal(overridden.documentLevel.inferredType, "policy");
  assert.equal(overridden.documentLevel.overrideType, "policy");
  assert.equal(result.groups[0].checks.documentLevelConsistency, "consistent");
});

test("analyzeDocuments buckets consolidation recommendations into quick wins and material changes", () => {
  const result = analyzeDocuments(
    [
      {
        id: "a",
        title: "Records Retention Policy",
        source: "manual://a",
        text: "records retention policy records retention policy records retention requirements legal regulatory brand entities roles and responsibilities",
      },
      {
        id: "b",
        title: "Records Retention Policy Copy",
        source: "manual://b",
        text: "records retention policy records retention policy records retention requirements legal regulatory brand entities roles and responsibilities",
      },
      {
        id: "c",
        title: "Access Review Policy",
        source: "manual://c",
        text: "customer complaint policy customer complaint governance customer complaint evidence customer complaint review across brands and legal entities",
      },
      {
        id: "d",
        title: "Access Review Procedure",
        source: "manual://d",
        text: "customer complaint procedure customer complaint workflow customer complaint evidence. step 1 collect complaint evidence. step 2 validate complaint approvals. step 3 archive complaint records.",
      },
    ],
    0.2
  );

  assert.equal(result.groups.length, 2);
  assert.ok(result.groups.some((group) => group.recommendationBucket === "quick-win"));
  assert.ok(result.groups.some((group) => group.recommendationBucket === "material-change"));
});

test("analyzeDocuments exposes extracted requirement inventory per document", () => {
  const result = analyzeDocuments(
    [
      {
        id: "a",
        title: "Records Retention Policy",
        source: "manual://a",
        text: "Retention Requirements\n\nRecords must be retained for seven years.\nRecords must be available for legal review.",
      },
    ],
    0.45
  );

  assert.equal(result.requirements.length, 2);
  assert.equal(result.documents[0].requirementCount, 2);
  assert.equal(result.documents[0].requirements[0].sourceLocation.section, "Retention Requirements");
});
