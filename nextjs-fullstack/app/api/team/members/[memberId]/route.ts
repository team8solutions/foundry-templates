import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { requestUserContext } from "@/lib/server/auth";
import { db } from "@/lib/server/db/client";
import {
  ActivityType,
  activityLogs,
  teamMembers,
} from "@/lib/server/db/schema";
import { formRedirect, parseFormRequest } from "@/lib/server/responses";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const form = await parseFormRequest(request);
  if (!form.ok) return form.response;
  const context = await requestUserContext(request);
  if (!context) return formRedirect("/sign-in");
  if (context.membership.role !== "owner")
    return formRedirect("/dashboard", { error: "Only owners can remove members" });

  const memberId = Number((await params).memberId);
  if (!Number.isSafeInteger(memberId) || memberId <= 0)
    return formRedirect("/dashboard", { error: "Member not found" });
  if (memberId === context.membership.id)
    return formRedirect("/dashboard", {
      error: "Owners cannot remove their own membership",
    });

  const [removed] = await db().transaction(async (tx) => {
    const rows = await tx
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.id, memberId),
          eq(teamMembers.teamId, context.membership.teamId),
        ),
      )
      .returning({ id: teamMembers.id });
    if (!rows.length) return [];
    await tx.insert(activityLogs).values({
      teamId: context.membership.teamId,
      userId: context.user.id,
      action: ActivityType.REMOVE_TEAM_MEMBER,
    });
    return rows;
  });
  if (!removed)
    return formRedirect("/dashboard", { error: "Member not found" });
  return formRedirect("/dashboard", { success: "Member removed" });
}
