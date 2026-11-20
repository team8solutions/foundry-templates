import { createHash } from "node:crypto";

// The app's own favicon: the first letter of its name on a colour taken from the name, so apps built
// from this starter do not all share one icon. Served by app/app-icon.svg/route.ts until the app
// gets an app/icon.svg of its own (see STARTER.md).
export function appIcon(name: string): string {
  const letter = (/[a-z0-9]/i.exec(name)?.[0] ?? "a").toUpperCase();
  const hue = createHash("sha256").update(name).digest().readUInt16BE(0) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="hsl(${hue} 60% 40%)"/><text x="32" y="45" text-anchor="middle" font-family="system-ui, sans-serif" font-size="36" font-weight="700" fill="#fff">${letter}</text></svg>`;
}
