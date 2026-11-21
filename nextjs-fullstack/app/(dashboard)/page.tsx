import { redirect } from "next/navigation";

// No marketing page in the starter: people land in the app itself, and the dashboard sends
// signed-out visitors to sign-in. Replace this with a page about the app if one is asked for.
export default function Home() {
  redirect("/dashboard");
}
