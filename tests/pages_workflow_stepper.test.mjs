import test from "node:test";
import assert from "node:assert/strict";

import { buildWorkflowStepStates } from "../docs/app.mjs";

test("buildWorkflowStepStates marks past, current, and future review steps clearly", () => {
  const states = buildWorkflowStepStates("documentsSection");

  assert.equal(states.levelSection, "complete");
  assert.equal(states.groupsSection, "complete");
  assert.equal(states.documentsSection, "current");
  assert.equal(states.pairsSection, "upcoming");
  assert.equal(states.issuesSection, "upcoming");
});
