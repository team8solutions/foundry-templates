import { NextRequest } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/server/db/client";
import {
  ActivityType,
  activityLogs,
  teamMembers,
  teams,
  users,
} from "@/lib/server/db/schema";
import { validateRuntimeEnv } from "@/lib/server/env";
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

  try {
    validateRuntimeEnv();
  } catch {
    return formRedirect("/sign-up", {
      error: "Application sign-in is not configured",
    });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  try {
    const account = await db().transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: parsed.data.email, passwordHash })
        .returning();
      const [team] = await tx
        .insert(teams)
        .values({ name: `${parsed.data.email.slice(0, 93)}'s team` })
        .returning();
      await tx
        .insert(teamMembers)
        .values({ userId: user.id, teamId: team.id, role: "owner" });
      await tx.insert(activityLogs).values({
        teamId: team.id,
        userId: user.id,
        action: ActivityType.SIGN_UP,
      });
      return { user };
    });

    const response = formRedirect("/dashboard");
    await setSessionCookie(response, {
      userId: account.user.id,
      sessionVersion: account.user.sessionVersion,
    });
    return response;
  } catch {
    return formRedirect("/sign-up", {
      error: "Unable to create that account",
    });
  }
}
