import { NextRequest } from "next/server";
import { comparePassword, hashPassword } from "@/lib/auth/password";
import { logActivity } from "@/lib/server/auth";
import { ActivityType, teamMember, user, userEmail } from "@/lib/server/data";
import { formRedirect, parseFormRequest } from "@/lib/server/responses";
import { setSessionCookie } from "@/lib/server/session";
import { signInSchema } from "@/lib/validation";

const invalidCredentials = "Invalid email or password";

async function accountFor(email: string) {
  const owner = await userEmail(email).get();
  const userId = owner.get("user_id");
  if (typeof userId !== "string") return null;
  const account = await user(userId).get();
  const data = account.data();
  if (!data || typeof data.team_id !== "string") return null;
  const membership = await teamMember(data.team_id, account.id).get();
  if (!membership.exists) return null;
  return { id: account.id, teamId: data.team_id, passwordHash: String(data.password_hash), sessionVersion: data.session_version };
}

export async function POST(request: NextRequest) {
  const form = await parseFormRequest(request);
  if (!form.ok) return form.response;
  const parsed = signInSchema.safeParse(form.data);
  if (!parsed.success)
    return formRedirect("/sign-in", { error: invalidCredentials });

  const account = await accountFor(parsed.data.email);
  if (!account) {
    // Spend the same time as a real check, so response times do not reveal which emails exist.
    await hashPassword(parsed.data.password);
    return formRedirect("/sign-in", { error: invalidCredentials });
  }
  if (!(await comparePassword(parsed.data.password, account.passwordHash)))
    return formRedirect("/sign-in", { error: invalidCredentials });

  await logActivity(account.id, account.teamId, ActivityType.SIGN_IN);
  const response = formRedirect("/dashboard");
  await setSessionCookie(response, {
    userId: account.id,
    sessionVersion: account.sessionVersion,
  });
  return response;
}
