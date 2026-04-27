import test from "node:test";
import assert from "node:assert/strict";

import { buildAnalysisProgressView } from "../docs/app.mjs";

test("buildAnalysisProgressView reports active URL fetch progress and skipped file stage", () => {
  const view = buildAnalysisProgressView({
    phase: "urls",
    sampleCount: 3,
    manualCount: 1,
    fileCount: 0,
    urlCount: 2,
    filesProcessed: 0,
    urlsProcessed: 1,
    currentFileName: "",
    currentUrlLabel: "https://example.com/policy-b",
    loadedDocumentCount: 4,
  });

  assert.match(view.headline, /Fetching URL content/);
  assert.match(view.detail, /Fetching URL 2 of 2/);
  assert.equal(view.steps[1].state, "skipped");
  assert.equal(view.steps[2].state, "active");
  assert.match(view.steps[0].detail, /3 starter docs, 1 pasted doc, 2 URLs/);
});
