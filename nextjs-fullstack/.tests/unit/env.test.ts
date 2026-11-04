import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file: string) => JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"));

test("declares only the platform-generated signing key", () => {
  const { variables } = read(".symposia/env.json");
  assert.deepEqual(variables.map((v: { key: string }) => v.key), ["SESSION_SIGNING_KEY"]);
});

test("keeps data in the platform helpers, not its own database", () => {
  const pkg = read("package.json");
  assert.equal(pkg.imports["#sandbox/*"], "./.symposia/sandbox/*.mjs");
  const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  for (const name of ["pg", "postgres", "drizzle-orm", "@google-cloud/firestore", "@azure/storage-blob"])
    assert.ok(!declared.includes(name), `${name} must not be a dependency`);
  assert.doesNotMatch(pkg.scripts.start, /migrat/);
});
