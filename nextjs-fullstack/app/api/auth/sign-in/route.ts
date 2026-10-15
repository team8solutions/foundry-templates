import { and, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { comparePassword, hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/server/db/client";
import {
  ActivityType,
  activityLogs,
  teamMembers,
  users,
} from "@/lib/server/db/schema";
import { validateRuntimeEnv } from "@/lib/server/env";
import { formRedirect, parseFormRequest } from "@/lib/server/responses";
import { setSessionCookie } from "@/lib/server/session";
import { signInSchema } from "@/lib/validation";

const invalidCredentials = "Invalid email or password";

export async function POST(request: NextRequest) {
  const form = await parseFormRequest(request);
  if (!form.ok) return form.response;
  const parsed = signInSchema.safeParse(form.data);
  if (!parsed.success)
    return formRedirect("/sign-in", { error: invalidCredentials });

  try {
    validateRuntimeEnv();
  } catch {
    return formRedirect("/sign-in", {
      error: "Application sign-in is not configured",
    });
  }

  const [account] = await db()
    .select({ user: users, membership: teamMembers })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .where(and(eq(users.email, parsed.data.email), isNull(users.deletedAt)))
    .limit(1);

  if (!account) {
    await hashPassword(parsed.data.password);
    return formRedirect("/sign-in", { error: invalidCredentials });
  }
  if (!(await comparePassword(parsed.data.password, account.user.passwordHash)))
    return formRedirect("/sign-in", { error: invalidCredentials });

  await db().insert(activityLogs).values({
    teamId: account.membership.teamId,
    userId: account.user.id,
    action: ActivityType.SIGN_IN,
  });
  const response = formRedirect("/dashboard");
  await setSessionCookie(response, {
    userId: account.user.id,
    sessionVersion: account.user.sessionVersion,
  });
  return response;
}
