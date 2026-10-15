import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/server/db/client";
import {
  activityLogs,
  teamMembers,
  teams,
  users,
  type ActivityType,
} from "@/lib/server/db/schema";
import {
  sessionFromCookies,
  sessionFromRequest,
} from "@/lib/server/session";
import type { SessionClaims } from "@/lib/auth/session-core";

export type UserContext = {
  user: {
    id: number;
    name: string | null;
    email: string;
    sessionVersion: number;
  };
  membership: {
    id: number;
    teamId: number;
    role: string;
  };
  team: {
    id: number;
    name: string;
  };
};

async function contextForClaims(claims: SessionClaims | null) {
  if (!claims) return null;
  const [row] = await db()
    .select({
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
        sessionVersion: users.sessionVersion,
      },
      membership: {
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        role: teamMembers.role,
      },
      team: {
        id: teams.id,
        name: teams.name,
      },
    })
    .from(users)
    .innerJoin(teamMembers, eq(teamMembers.userId, users.id))
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(
      and(
        eq(users.id, claims.userId),
        eq(users.sessionVersion, claims.sessionVersion),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  return row || null;
}

export async function currentUserContext() {
  return contextForClaims(await sessionFromCookies());
}

export async function requestUserContext(request: NextRequest) {
  return contextForClaims(await sessionFromRequest(request));
}

export async function requirePageUser() {
  const context = await currentUserContext();
  if (!context) redirect("/sign-in");
  return context;
}

export async function logActivity(
  context: Pick<UserContext, "user" | "membership">,
  action: ActivityType,
) {
  await db().insert(activityLogs).values({
    teamId: context.membership.teamId,
    userId: context.user.id,
    action,
  });
}

export async function activityForUser(context: UserContext) {
  return db()
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      createdAt: activityLogs.createdAt,
    })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.teamId, context.membership.teamId),
        eq(activityLogs.userId, context.user.id),
      ),
    )
    .orderBy(desc(activityLogs.createdAt))
    .limit(20);
}

export async function teamForUser(context: UserContext) {
  const members = await db()
    .select({
      membershipId: teamMembers.id,
      role: teamMembers.role,
      userId: users.id,
      name: users.name,
      email: users.email,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(
      and(
        eq(teamMembers.teamId, context.membership.teamId),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(teamMembers.id);
  return { ...context.team, members };
}
