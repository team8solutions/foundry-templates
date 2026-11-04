import { NextRequest } from "next/server";
import { FieldValue, runTransaction } from "#sandbox/db";
import { comparePassword, hashPassword } from "@/lib/auth/password";
import { activityEntry, requestUserContext } from "@/lib/server/auth";
import { ActivityType, activity, user } from "@/lib/server/data";
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

  const account = user(context.user.id);
  const stored = (await account.get()).get("password_hash");
  if (
    typeof stored !== "string" ||
    !(await comparePassword(parsed.data.currentPassword, stored))
  )
    return formRedirect("/dashboard/security", {
      error: "Current password is incorrect",
    });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  const nextSessionVersion = context.user.sessionVersion + 1;
  // Raising the session version ends every other session of this account.
  const updated = await runTransaction(async (tx) => {
    const current = await tx.get(account);
    if (current.get("session_version") !== context.user.sessionVersion) return false;
    tx.update(account, {
      password_hash: passwordHash,
      session_version: nextSessionVersion,
      updated_at: FieldValue.serverTimestamp(),
    });
    tx.create(activity(context.user.id).doc(), activityEntry(context.membership.teamId, ActivityType.UPDATE_PASSWORD));
    return true;
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
