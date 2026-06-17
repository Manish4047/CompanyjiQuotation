import Link from "next/link";
import { sendPasswordResetEmail } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SetupRequired } from "@/components/setup-required";
import { hasSupabaseConfig } from "@/lib/env";

export default async function ForgotPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ message?: string; success?: string }>;
}) {
  if (!hasSupabaseConfig()) return <SetupRequired />;

  const params = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f4f4] p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <p className="mt-1 text-sm text-neutral-500">
            Enter your email. Supabase will send a secure link to set a new password.
          </p>
          {params.message ? (
            <Notice tone="red" className="mt-4 p-3">
              {params.message}
            </Notice>
          ) : null}
          {params.success ? (
            <Notice tone="green" className="mt-4 p-3">
              {params.success}
            </Notice>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={sendPasswordResetEmail} className="space-y-4">
            <Field label="Email">
              <Input
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                placeholder="name@companyji.com"
              />
            </Field>
            <Button className="w-full" type="submit">
              Send reset link
            </Button>
          </form>
          <Link href="/login" className="block text-center text-sm font-bold text-[#6a912f]">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
