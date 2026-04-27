import test from "node:test";
import assert from "node:assert/strict";

import { analyzeDocuments } from "../docs/analysis.mjs";
import {
  buildConsolidatedRedlineReportHtml,
  buildCsvExport,
  buildExportPayload,
  buildMarkdownExport,
  buildRequirementRedlineModel,
} from "../docs/app.mjs";

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
  assert.match(csv, /group_bucket,group_review_status,reviewer_decision,reviewer_note,canonical_document,canonical_requirement_text,redline_status,proposed_requirement_text,requirement_text/);
  assert.match(csv, /Records Retention Procedure/);
  assert.match(csv, /procedure-like content/);
  assert.match(csv, /policy/);
  assert.match(csv, /material-change/);
});

test("exports carry reviewer decisions and notes", () => {
  const result = analyzeDocuments(
    [
      {
        id: "a",
        title: "Records Retention Policy",
        source: "manual://a",
        text: "Retention Requirements\n\nRecords must be retained for seven years.",
      },
      {
        id: "b",
        title: "Records Retention Policy Copy",
        source: "manual://b",
        text: "Retention Requirements\n\nRecords must be retained for seven years across all entities.",
      },
    ],
    0.2
  );

  const group = result.requirementGroups[0];
  const groupKey = [...group.requirementIds].sort().join("::");
  const payload = buildExportPayload(result, [], "", "all", 0.2, {
    groupDecisions: {
      [groupKey]: {
        decision: "revise",
        note: "Need policy owner wording review before accepting.",
        updatedAt: "2026-04-27T22:00:00.000Z",
      },
    },
  });

  const csv = buildCsvExport(payload);
  const markdown = buildMarkdownExport(payload);
  const html = buildConsolidatedRedlineReportHtml(payload);

  assert.match(csv, /reviewer_decision,reviewer_note/);
  assert.match(csv, /revise/);
  assert.match(csv, /Need policy owner wording review before accepting/);
  assert.match(markdown, /Reviewer decision: revise/);
  assert.match(markdown, /Reviewer note: Need policy owner wording review before accepting/);
  assert.match(html, /Reviewer decision:<\/strong> revise/);
  assert.match(html, /Reviewer note:<\/strong> Need policy owner wording review before accepting/);
});

test("buildMarkdownExport summarizes the current visible analysis view", () => {
  const result = analyzeDocuments(
    [
      {
        id: "a",
        title: "Data Classification Policy",
        source: "manual://a",
        text: "Classification Requirements\n\nCustomer data must be classified before storage.",
      },
      {
        id: "b",
        title: "Data Classification Standard",
        source: "manual://b",
        text: "Classification Requirements\n\nCustomer data must be classified before storage using the approved internal label set.",
      },
    ],
    0.2
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
  assert.match(markdown, /Proposed consolidated text/);
  assert.match(markdown, /sample import issue/);
});

test("buildRequirementRedlineModel distinguishes ready and blocked redlines", () => {
  const quickWinResult = analyzeDocuments(
    [
      {
        id: "a",
        title: "Records Retention Policy",
        source: "manual://a",
        text: "Retention Requirements\n\nRecords must be retained for seven years.",
      },
      {
        id: "b",
        title: "Records Retention Policy Copy",
        source: "manual://b",
        text: "Retention Requirements\n\nRecords must be retained for seven years across all entities.",
      },
    ],
    0.2
  );

  const quickWinGroup = quickWinResult.requirementGroups[0];
  const quickWinRedline = buildRequirementRedlineModel(quickWinResult, quickWinGroup);
  assert.equal(quickWinRedline.autoRedlineStatus, "ready");
  assert.match(quickWinRedline.standaloneUrl, /version-compare/);

  const blockedResult = analyzeDocuments(
    [
      {
        id: "c",
        title: "Complaint Escalation Policy",
        source: "manual://c",
        text: "Complaint Escalation\n\nCustomer complaints must be escalated to Compliance within one business day.",
      },
      {
        id: "d",
        title: "Complaint Escalation Procedure",
        source: "manual://d",
        text: "Complaint Escalation Workflow\n\nStep 1 escalate customer complaints to Compliance within one business day. Step 2 archive the escalation record.",
      },
    ],
    0.35
  );

  const blockedGroup = blockedResult.requirementGroups[0];
  const blockedRedline = buildRequirementRedlineModel(blockedResult, blockedGroup);
  assert.equal(blockedRedline.autoRedlineStatus, "blocked");
});

test("buildConsolidatedRedlineReportHtml renders grouped requirement redlines", () => {
  const result = analyzeDocuments(
    [
      {
        id: "a",
        title: "Records Retention Policy",
        source: "manual://a",
        text: "Retention Requirements\n\nRecords must be retained for seven years.",
      },
      {
        id: "b",
        title: "Records Retention Policy Copy",
        source: "manual://b",
        text: "Retention Requirements\n\nRecords must be retained for seven years across all entities.",
      },
      {
        id: "c",
        title: "Complaint Escalation Policy",
        source: "manual://c",
        text: "Complaint Escalation\n\nCustomer complaints must be escalated to Compliance within one business day.",
      },
      {
        id: "d",
        title: "Complaint Escalation Procedure",
        source: "manual://d",
        text: "Complaint Escalation Workflow\n\nStep 1 escalate customer complaints to Compliance within one business day. Step 2 archive the escalation record.",
      },
    ],
    0.35
  );

  const payload = buildExportPayload(result, [], "", "all", 0.35);
  const html = buildConsolidatedRedlineReportHtml(payload);

  assert.match(html, /Consolidated Redline Report/);
  assert.match(html, /Requirement Group 1/);
  assert.match(html, /Current canonical text/);
  assert.match(html, /Proposed consolidated text/);
  assert.match(html, /Legacy-preserving redline/);
  assert.match(html, /proposed replace with|proposed add|proposed remove/);
  assert.match(html, /Side-by-side diff/);
  assert.match(html, /Mapped requirements/);
});
