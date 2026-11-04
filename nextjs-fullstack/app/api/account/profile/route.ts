import { NextRequest } from "next/server";
import { FieldValue, runTransaction } from "#sandbox/db";
import { activityEntry, requestUserContext } from "@/lib/server/auth";
import { ActivityType, activity, user, userEmail } from "@/lib/server/data";
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

  const { name, email } = parsed.data;
  const userId = context.user.id;
  try {
    await runTransaction(async (tx) => {
      const account = await tx.get(user(userId));
      const previous = String(account.get("email"));
      if (email !== previous) {
        // Move the email's claim, unless another account holds the new one.
        if ((await tx.get(userEmail(email))).exists) throw new Error("Email is taken");
        tx.delete(userEmail(previous));
        tx.create(userEmail(email), { user_id: userId });
      }
      tx.update(user(userId), { name, email, updated_at: FieldValue.serverTimestamp() });
      tx.create(activity(userId).doc(), activityEntry(context.membership.teamId, ActivityType.UPDATE_ACCOUNT));
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
