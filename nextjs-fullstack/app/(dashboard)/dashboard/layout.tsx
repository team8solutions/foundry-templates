import Link from "next/link";
import { Activity, Home, Settings, Shield } from "lucide-react";
import { requirePageUser } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

const navigation = [
  { href: "/dashboard", label: "Team", icon: Home },
  { href: "/dashboard/general", label: "Profile", icon: Settings },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/security", label: "Security", icon: Shield },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requirePageUser();
  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="font-semibold text-gray-950">Dashboard</Link>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span className="hidden sm:inline">{context.user.email}</span>
            <form method="post" action="/api/auth/sign-out">
              <button className="rounded-full border border-gray-300 px-4 py-2 font-medium text-gray-800 hover:bg-gray-100" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[15rem_1fr]">
        <nav className="flex gap-2 overflow-x-auto border-b border-gray-200 bg-white p-3 lg:min-h-[calc(100dvh-73px)] lg:flex-col lg:border-b-0 lg:border-r lg:bg-gray-50 lg:p-4">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
