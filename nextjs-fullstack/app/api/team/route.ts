import { NextRequest } from "next/server";
import { requestUserContext, teamForUser } from "@/lib/server/auth";
import { privateJson } from "@/lib/server/responses";

export async function GET(request: NextRequest) {
  const context = await requestUserContext(request);
  if (!context) return privateJson({ error: "Unauthorized" }, { status: 401 });
  return privateJson(await teamForUser(context));
}
