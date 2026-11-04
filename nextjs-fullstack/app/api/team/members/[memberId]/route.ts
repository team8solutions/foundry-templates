import { NextRequest } from "next/server";
import { runTransaction } from "#sandbox/db";
import { isUserId } from "@/lib/auth/session-core";
import { activityEntry, requestUserContext } from "@/lib/server/auth";
import { ActivityType, activity, teamMember } from "@/lib/server/data";
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

  const { memberId } = await params;
  if (!isUserId(memberId))
    return formRedirect("/dashboard", { error: "Member not found" });
  if (memberId === context.membership.id)
    return formRedirect("/dashboard", {
      error: "Owners cannot remove their own membership",
    });

  // Only a membership of the owner's own team can be found, so no other team is reachable.
  const membership = teamMember(context.membership.teamId, memberId);
  const removed = await runTransaction(async (tx) => {
    if (!(await tx.get(membership)).exists) return false;
    tx.delete(membership);
    tx.create(activity(context.user.id).doc(), activityEntry(context.membership.teamId, ActivityType.REMOVE_TEAM_MEMBER));
    return true;
  });
  if (!removed)
    return formRedirect("/dashboard", { error: "Member not found" });
  return formRedirect("/dashboard", { success: "Member removed" });
}
