import { Activity, KeyRound, LogIn, LogOut, Settings, UserPlus, UserMinus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { activityForUser, requirePageUser } from "@/lib/server/auth";
import { ActivityType, type ActivityType as ActivityName } from "@/lib/server/db/schema";

const activityDetails: Record<ActivityName, { label: string; icon: LucideIcon }> = {
  [ActivityType.SIGN_UP]: { label: "Created the account", icon: UserPlus },
  [ActivityType.SIGN_IN]: { label: "Signed in", icon: LogIn },
  [ActivityType.SIGN_OUT]: { label: "Signed out", icon: LogOut },
  [ActivityType.UPDATE_PASSWORD]: { label: "Changed the password", icon: KeyRound },
  [ActivityType.UPDATE_ACCOUNT]: { label: "Updated the profile", icon: Settings },
  [ActivityType.REMOVE_TEAM_MEMBER]: { label: "Removed a team member", icon: UserMinus },
};

export default async function ActivityPage() {
  const context = await requirePageUser();
  const logs = await activityForUser(context);

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold text-gray-950">Activity</h1>
      <div className="mt-6 max-w-3xl rounded-2xl border border-gray-200 bg-white shadow-sm">
        {logs.length ? (
          <ul className="divide-y divide-gray-100">
            {logs.map((log) => {
              const detail = activityDetails[log.action as ActivityName];
              const Icon = detail?.icon || Activity;
              return (
                <li key={log.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="rounded-full bg-orange-100 p-2 text-orange-700"><Icon className="size-5" aria-hidden="true" /></span>
                  <div>
                    <p className="font-medium text-gray-950">{detail?.label || "Account activity"}</p>
                    <time className="text-sm text-gray-600" dateTime={log.createdAt.toISOString()}>{log.createdAt.toLocaleString()}</time>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-gray-600">No activity has been recorded yet.</p>
        )}
      </div>
    </section>
  );
}
