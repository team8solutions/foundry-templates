import { requirePageUser } from "@/lib/server/auth";
import { safeMessage } from "@/lib/http";

export default async function GeneralPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const context = await requirePageUser();
  const messages = await searchParams;
  const error = safeMessage(messages.error || null);
  const success = safeMessage(messages.success || null);

  return (
    <section className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-semibold text-gray-950">Profile</h1>
      <form method="post" action="/api/account/profile" className="mt-6 max-w-2xl space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-gray-800">
          Name
          <input name="name" defaultValue={context.user.name || ""} required maxLength={100} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950" />
        </label>
        <label className="block text-sm font-medium text-gray-800">
          Email
          <input name="email" type="email" autoComplete="email" defaultValue={context.user.email} required maxLength={255} className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950" />
        </label>
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        {success ? <p className="text-sm text-green-700">{success}</p> : null}
        <button type="submit" className="rounded-full bg-orange-600 px-5 py-2.5 font-semibold text-white hover:bg-orange-700">Save changes</button>
      </form>
    </section>
  );
}
