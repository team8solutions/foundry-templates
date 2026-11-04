import { NextRequest } from "next/server";
import { batch, FieldValue } from "#sandbox/db";
import { hashPassword } from "@/lib/auth/password";
import { activityEntry } from "@/lib/server/auth";
import {
  ActivityType,
  activity,
  teamMember,
  teams,
  userEmail,
  users,
} from "@/lib/server/data";
import { formRedirect, parseFormRequest } from "@/lib/server/responses";
import { setSessionCookie } from "@/lib/server/session";
import { signUpSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const form = await parseFormRequest(request);
  if (!form.ok) return form.response;
  const parsed = signUpSchema.safeParse(form.data);
  if (!parsed.success)
    return formRedirect("/sign-up", {
      error: parsed.error.issues[0]?.message || "Invalid signup details",
    });

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const now = FieldValue.serverTimestamp();
    const account = users().doc();
    const team = teams().doc();
    // All or nothing; the email document already existing (AlreadyExists) fails the whole batch.
    await batch()
      .create(userEmail(parsed.data.email), { user_id: account.id })
      .create(account, {
        email: parsed.data.email,
        name: null,
        password_hash: passwordHash,
        session_version: 1,
        team_id: team.id,
        created_at: now,
        updated_at: now,
      })
      .create(team, {
        name: `${parsed.data.email.slice(0, 93)}'s team`,
        created_at: now,
        updated_at: now,
      })
      .create(teamMember(team.id, account.id), { role: "owner", joined_at: now })
      .create(activity(account.id).doc(), activityEntry(team.id, ActivityType.SIGN_UP))
      .commit();

    const response = formRedirect("/dashboard");
    await setSessionCookie(response, { userId: account.id, sessionVersion: 1 });
    return response;
  } catch {
    return formRedirect("/sign-up", {
      error: "Unable to create that account",
    });
  }
}
