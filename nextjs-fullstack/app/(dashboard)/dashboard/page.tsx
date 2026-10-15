import { requirePageUser, teamForUser } from "@/lib/server/auth";
import { safeMessage } from "@/lib/http";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const context = await requirePageUser();
  const team = await teamForUser(context);
  const messages = await searchParams;
  const error = safeMessage(messages.error || null);
  const success = safeMessage(messages.success || null);

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-sm font-medium text-orange-700">Team</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-950">{team.name}</h1>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5 py-4">
          <h2 className="font-semibold text-gray-950">Members</h2>
          <p className="mt-1 text-sm text-gray-600">Only team owners can remove another member.</p>
        </div>
        {error ? <p className="mx-5 mt-4 text-sm text-red-700" role="alert">{error}</p> : null}
        {success ? <p className="mx-5 mt-4 text-sm text-green-700">{success}</p> : null}
        <ul className="divide-y divide-gray-100">
          {team.members.map((member) => (
            <li key={member.membershipId} className="flex items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-950">{member.name || member.email}</p>
                <p className="truncate text-sm text-gray-600">{member.email} · {member.role}</p>
              </div>
              {context.membership.role === "owner" && member.membershipId !== context.membership.id ? (
                <form method="post" action={`/api/team/members/${member.membershipId}`}>
                  <button type="submit" className="rounded-full border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-100">
                    Remove
                  </button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
