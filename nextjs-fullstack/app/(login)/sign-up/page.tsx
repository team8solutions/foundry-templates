import { Login } from "../login";
import { safeMessage } from "@/lib/http";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <Login mode="signup" error={safeMessage(error || null)} />;
}
