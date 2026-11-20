import assert from "node:assert/strict";
import test from "node:test";
import { appIcon } from "../../lib/app-icon";

const fill = (svg: string) => /fill="(hsl[^"]+)"/.exec(svg)?.[1];

test("draws each app's own icon from its name", () => {
  assert.match(appIcon("email-dashboards"), />E<\/text>/);
  assert.match(appIcon("3d-viewer"), />3<\/text>/);
  assert.match(appIcon("--"), />A<\/text>/);
  assert.equal(appIcon("notes"), appIcon("notes"));
  assert.notEqual(fill(appIcon("notes")), fill(appIcon("email-dashboards")));
});
