import { NextRequest } from "next/server";
import { requestUserContext, logActivity } from "@/lib/server/auth";
import { ActivityType } from "@/lib/server/db/schema";
import { formRedirect, parseFormRequest } from "@/lib/server/responses";
import { clearSessionCookie } from "@/lib/server/session";

export async function POST(request: NextRequest) {
  const form = await parseFormRequest(request);
  if (!form.ok) return form.response;

  try {
    const context = await requestUserContext(request);
    if (context) await logActivity(context, ActivityType.SIGN_OUT);
  } catch {
    // Clearing the browser cookie must not depend on database availability.
  }
  const response = formRedirect("/");
  clearSessionCookie(response);
  return response;
}
