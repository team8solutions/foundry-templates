// Shared by the #sandbox helpers: they run only in server code on Node.js, and load their database
// and storage packages from the app's own node_modules at run time.

// A bundler that put these helpers into browser code (or an Edge runtime) gets a clear error here.
if (typeof window !== "undefined" || typeof globalThis.process?.getBuiltinModule !== "function")
  throw new Error("The #sandbox helpers run only in server code on Node.js (route handlers, server actions, " +
    "server components, an Express server), never in browser code.");

export const node = (name) => process.getBuiltinModule("node:" + name);

// Loaded by name from the app's folder, so a bundler neither pulls these packages into the build nor
// fails when the ones this app does not use are absent. The platform installs the ones it needs.
export function appRequire(name) {
  const { createRequire } = node("module");
  try {
    return createRequire(node("path").join(process.cwd(), "package.json"))(name);
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") throw error;
    throw new Error(`${name} is not installed: the platform adds it when it builds the app for preview or ` +
      "publishing, so run the app through the platform", { cause: error });
  }
}
