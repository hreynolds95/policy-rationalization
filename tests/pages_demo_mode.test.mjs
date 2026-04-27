import test from "node:test";
import assert from "node:assert/strict";

import { buildDemoBannerContent } from "../docs/app.mjs";
import { SAMPLE_LIBRARIES } from "../docs/sample-data.mjs";

test("buildDemoBannerContent emphasizes illustrative data in results mode", () => {
  const banner = buildDemoBannerContent(4, "results");

  assert.equal(banner.title, "Demo mode");
  assert.match(banner.body, /illustrative demo content/i);
  assert.match(banner.body, /not policy decisions/i);
  assert.match(banner.detail, /4 documents/);
});

test("buildDemoBannerContent distinguishes real extracted starter content", () => {
  const banner = buildDemoBannerContent(
    SAMPLE_LIBRARIES.real.documents.length,
    "workspace",
    "real"
  );

  assert.equal(banner.title, "Real starter set");
  assert.match(banner.body, /real policy starter set/i);
  assert.match(banner.body, /published policy library/i);
  assert.match(banner.detail, /4 documents/);
});
