import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requestUserContext } from "@/lib/server/auth";
import { db } from "@/lib/server/db/client";
import { ActivityType, activityLogs, users } from "@/lib/server/db/schema";
import { formRedirect, parseFormRequest } from "@/lib/server/responses";
import { profileSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const form = await parseFormRequest(request);
  if (!form.ok) return form.response;
  const context = await requestUserContext(request);
  if (!context) return formRedirect("/sign-in");

  const parsed = profileSchema.safeParse(form.data);
  if (!parsed.success)
    return formRedirect("/dashboard/general", {
      error: parsed.error.issues[0]?.message || "Invalid profile details",
    });

  try {
    await db().transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          name: parsed.data.name,
          email: parsed.data.email,
          updatedAt: new Date(),
        })
        .where(eq(users.id, context.user.id));
      await tx.insert(activityLogs).values({
        teamId: context.membership.teamId,
        userId: context.user.id,
        action: ActivityType.UPDATE_ACCOUNT,
      });
    });
  } catch {
    return formRedirect("/dashboard/general", {
      error: "Unable to update the profile",
    });
  }
  return formRedirect("/dashboard/general", {
    success: "Profile updated",
  });
}
