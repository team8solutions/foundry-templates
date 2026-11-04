import "server-only";

import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { FieldValue } from "#sandbox/db";
import {
  activity,
  team,
  teamMember,
  user,
  type ActivityType,
} from "@/lib/server/data";
import {
  sessionFromCookies,
  sessionFromRequest,
} from "@/lib/server/session";
import type { SessionClaims } from "@/lib/auth/session-core";

export type UserContext = {
  user: {
    id: string;
    name: string | null;
    email: string;
    sessionVersion: number;
  };
  membership: {
    id: string;
    teamId: string;
    role: string;
  };
  team: {
    id: string;
    name: string;
  };
};

async function contextForClaims(claims: SessionClaims | null): Promise<UserContext | null> {
  if (!claims) return null;
  const account = await user(claims.userId).get();
  const data = account.data();
  if (!data || data.session_version !== claims.sessionVersion) return null;
  const teamId = String(data.team_id || "");
  if (!teamId) return null;
  const [membership, teamDoc] = await Promise.all([
    teamMember(teamId, account.id).get(),
    team(teamId).get(),
  ]);
  if (!membership.exists || !teamDoc.exists) return null;
  return {
    user: {
      id: account.id,
      name: data.name ?? null,
      email: data.email,
      sessionVersion: data.session_version,
    },
    // A membership's id is its user's id: a user belongs to one team.
    membership: { id: account.id, teamId, role: membership.get("role") },
    team: { id: teamId, name: teamDoc.get("name") },
  };
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

export function activityEntry(teamId: string, action: ActivityType) {
  return { team_id: teamId, action, created_at: FieldValue.serverTimestamp() };
}

export async function logActivity(userId: string, teamId: string, action: ActivityType) {
  await activity(userId).add(activityEntry(teamId, action));
}

export async function activityForUser(context: UserContext) {
  const { docs } = await activity(context.user.id)
    .orderBy("created_at", "desc")
    .limit(20)
    .get();
  return docs
    .filter((doc) => doc.get("team_id") === context.membership.teamId)
    .map((doc) => ({
      id: doc.id,
      action: String(doc.get("action")),
      createdAt: doc.get("created_at").toDate() as Date,
    }));
}

export async function teamForUser(context: UserContext) {
  const { docs } = await team(context.membership.teamId)
    .collection("members")
    .orderBy("joined_at")
    .get();
  const accounts = await Promise.all(docs.map((doc) => user(doc.id).get()));
  const members = docs.flatMap((doc, index) => {
    const account = accounts[index].data();
    if (!account) return [];
    return [{
      membershipId: doc.id,
      role: String(doc.get("role")),
      userId: doc.id,
      name: (account.name ?? null) as string | null,
      email: String(account.email),
    }];
  });
  return { ...context.team, members };
}
