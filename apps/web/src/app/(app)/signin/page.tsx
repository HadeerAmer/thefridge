import { env } from "@/env";
import { SignInScreen } from "@/components/screens/signin-screen";

export const metadata = { title: "Sign in" };

export default function SignInPage() {
  return <SignInScreen demoMode={env.DEMO_MODE} />;
}
