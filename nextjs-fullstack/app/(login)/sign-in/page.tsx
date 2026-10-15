import { Login } from "../login";
import { safeMessage } from "@/lib/http";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <Login mode="signin" error={safeMessage(error || null)} />;
}
