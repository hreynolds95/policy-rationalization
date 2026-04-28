import test from "node:test";
import assert from "node:assert/strict";

import { buildGroupPrimaryAction, buildWorkflowStepStates } from "../docs/app.mjs";

test("buildWorkflowStepStates marks past, current, and future review steps clearly", () => {
  const states = buildWorkflowStepStates("documentsSection");

  assert.equal(states.levelSection, "complete");
  assert.equal(states.groupsSection, "complete");
  assert.equal(states.documentsSection, "current");
  assert.equal(states.pairsSection, "upcoming");
  assert.equal(states.issuesSection, "upcoming");
});

test("buildGroupPrimaryAction emphasizes the next action for each review state", () => {
  const result = {
    requirements: [
      {
        requirementId: "req-1",
        sourceDocumentTitle: "Global Sanctions Compliance Policy",
      },
    ],
  };
  const group = {
    recommendedPrimaryRequirementId: "req-1",
    requirementIds: ["req-1", "req-2"],
  };
  const groupKey = "req-1::req-2";

  assert.equal(buildGroupPrimaryAction(group, result, {})?.action, "open-redline");
  assert.equal(
    buildGroupPrimaryAction(group, result, {
      [groupKey]: { note: "Need to confirm the baseline wording." },
    })?.action,
    "focus-decision"
  );
  assert.equal(
    buildGroupPrimaryAction(group, result, {
      [groupKey]: { decision: "accept", note: "Looks good." },
    })?.action,
    "view-support"
  );
});
