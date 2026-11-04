import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // .symposia/sandbox is the platform's helper code, replaced on every preview and publish.
  globalIgnores([".next/**", "coverage/**", "next-env.d.ts", ".symposia/**"]),
]);
