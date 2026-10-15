import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { comparePassword, hashPassword } from "@/lib/auth/password";
import { requestUserContext } from "@/lib/server/auth";
import { db } from "@/lib/server/db/client";
import {
  ActivityType,
  activityLogs,
  users,
} from "@/lib/server/db/schema";
import { formRedirect, parseFormRequest } from "@/lib/server/responses";
import { setSessionCookie } from "@/lib/server/session";
import { passwordChangeSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const form = await parseFormRequest(request);
  if (!form.ok) return form.response;
  const context = await requestUserContext(request);
  if (!context) return formRedirect("/sign-in");

  const parsed = passwordChangeSchema.safeParse(form.data);
  if (!parsed.success)
    return formRedirect("/dashboard/security", {
      error: parsed.error.issues[0]?.message || "Invalid password details",
    });

  const [stored] = await db()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, context.user.id))
    .limit(1);
  if (
    !stored ||
    !(await comparePassword(parsed.data.currentPassword, stored.passwordHash))
  )
    return formRedirect("/dashboard/security", {
      error: "Current password is incorrect",
    });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const nextSessionVersion = context.user.sessionVersion + 1;
  const [updated] = await db().transaction(async (tx) => {
    const changed = await tx
      .update(users)
      .set({
        passwordHash,
        sessionVersion: nextSessionVersion,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(users.id, context.user.id),
          eq(users.sessionVersion, context.user.sessionVersion),
        ),
      )
      .returning({ id: users.id });
    if (!changed.length) return [];
    await tx.insert(activityLogs).values({
      teamId: context.membership.teamId,
      userId: context.user.id,
      action: ActivityType.UPDATE_PASSWORD,
    });
    return changed;
  });
  if (!updated)
    return formRedirect("/sign-in", {
      error: "Your session changed; sign in again",
    });

  const response = formRedirect("/dashboard/security", {
    success: "Password updated",
  });
  await setSessionCookie(response, {
    userId: context.user.id,
    sessionVersion: nextSessionVersion,
  });
  return response;
}
