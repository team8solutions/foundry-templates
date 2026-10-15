import Link from "next/link";
import { Activity, CircleIcon, Database, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: ShieldCheck,
    title: "Application accounts",
    text: "Email and password sign-in with signed, HTTP-only sessions and server-side authorization.",
  },
  {
    icon: Database,
    title: "Real persistence",
    text: "PostgreSQL, Drizzle schema, and committed migrations replace mock data from the start.",
  },
  {
    icon: Activity,
    title: "Account workflow",
    text: "A protected dashboard includes profile, password, team, and activity views.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center font-semibold text-gray-950">
            <CircleIcon className="mr-2 size-6 text-orange-600" />
            AIT Starter
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link href="/sign-in" className="text-gray-700 hover:text-gray-950">Sign in</Link>
            <Link href="/sign-up" className="rounded-full bg-orange-600 px-4 py-2 text-white hover:bg-orange-700">Create account</Link>
          </div>
        </div>
      </header>
      <main className="flex-1">
      <section className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28">
        <div>
          <p className="mb-4 text-sm font-semibold uppercase tracking-wider text-orange-700">
            Next.js full-stack starter
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-gray-950 sm:text-6xl">
            Start with a working product foundation.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-gray-600">
            Build the requested workflow on top of a responsive application with authentication,
            PostgreSQL persistence, and secure server boundaries already in place.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="rounded-full bg-orange-600 px-6 py-3 font-semibold text-white hover:bg-orange-700"
            >
              Create an account
            </Link>
            <Link
              href="/sign-in"
              className="rounded-full border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-900 hover:bg-gray-100"
            >
              Sign in
            </Link>
          </div>
        </div>
        <div className="grid gap-4">
          {features.map(({ icon: Icon, title, text }) => (
            <article key={title} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <Icon className="size-7 text-orange-600" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-semibold text-gray-950">{title}</h2>
              <p className="mt-2 leading-7 text-gray-600">{text}</p>
            </article>
          ))}
        </div>
      </section>
      </main>
    </div>
  );
}
