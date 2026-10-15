import Link from "next/link";
import { CircleIcon } from "lucide-react";

export function Login({
  mode,
  error,
}: {
  mode: "signin" | "signup";
  error?: string;
}) {
  const signingIn = mode === "signin";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <CircleIcon className="mx-auto size-12 text-orange-600" aria-hidden="true" />
        <h1 className="mt-6 text-center text-3xl font-bold text-gray-950">
          {signingIn ? "Sign in to your account" : "Create your account"}
        </h1>
        <form
          method="post"
          action={signingIn ? "/api/auth/sign-in" : "/api/auth/sign-up"}
          className="mt-8 space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-gray-800">
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={255}
              className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950"
            />
          </label>
          <label className="block text-sm font-medium text-gray-800">
            Password
            <input
              name="password"
              type="password"
              autoComplete={signingIn ? "current-password" : "new-password"}
              required
              minLength={8}
              maxLength={100}
              className="mt-2 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-950"
            />
          </label>
          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          <button
            type="submit"
            className="w-full rounded-full bg-orange-600 px-4 py-2.5 font-semibold text-white hover:bg-orange-700"
          >
            {signingIn ? "Sign in" : "Sign up"}
          </button>
        </form>
        <p className="mt-6 text-center text-sm text-gray-600">
          {signingIn ? "Need an account?" : "Already have an account?"}{" "}
          <Link
            href={signingIn ? "/sign-up" : "/sign-in"}
            className="font-semibold text-orange-700 hover:text-orange-800"
          >
            {signingIn ? "Sign up" : "Sign in"}
          </Link>
        </p>
      </div>
    </main>
  );
}
