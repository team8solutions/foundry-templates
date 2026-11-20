import { appIcon } from "@/lib/app-icon";

// The platform sets SYMPOSIA_APP (the project's name) when the app runs, not while it builds.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(appIcon(process.env.SYMPOSIA_APP || "app"), {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
