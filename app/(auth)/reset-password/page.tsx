import Link from "next/link";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SetupRequired } from "@/components/setup-required";
import { hasSupabaseConfig } from "@/lib/env";

export default function ResetPasswordPage() {
  if (!hasSupabaseConfig()) return <SetupRequired />;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f4f4] p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
          <p className="mt-1 text-sm text-neutral-500">
            Enter the new password you want to use for Companyji CRM.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResetPasswordForm />
          <Link href="/login" className="block text-center text-sm font-bold text-[#6a912f]">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
