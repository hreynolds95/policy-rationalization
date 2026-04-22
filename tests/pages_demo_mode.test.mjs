import test from "node:test";
import assert from "node:assert/strict";

import { buildDemoBannerContent } from "../docs/app.mjs";

test("buildDemoBannerContent emphasizes illustrative data in results mode", () => {
  const banner = buildDemoBannerContent(4, "results");

  assert.equal(banner.title, "Demo mode");
  assert.match(banner.body, /illustrative demo content/i);
  assert.match(banner.body, /not policy decisions/i);
  assert.match(banner.detail, /4 sample documents/);
});
