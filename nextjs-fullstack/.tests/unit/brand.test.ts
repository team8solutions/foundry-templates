import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");
const pages = (readdirSync(new URL("app", root), { recursive: true }) as string[])
  .filter((file) => file.endsWith(".tsx"))
  .map((file) => `app/${file}`);

test("every page takes its colour from the brand palette, so one change re-themes the app", () => {
  assert.match(read("app/globals.css"), /--color-brand-600:/);
  for (const file of pages) assert.doesNotMatch(read(file), /\borange-\d{3}\b/, file);
  assert.ok(pages.some((file) => /\bbrand-\d{3}\b/.test(read(file))));
});

test("there is no starter home page: / goes to the app", () => {
  const home = read("app/(dashboard)/page.tsx");
  assert.match(home, /redirect\("\/dashboard"\)/);
  for (const file of pages) assert.doesNotMatch(read(file), /AIT Starter|full-stack starter/i, file);
});
