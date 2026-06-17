"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function recoverHashSession() {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        window.history.replaceState(null, "", window.location.pathname);

        if (error) {
          setMessage("This reset link could not be used. Please request a new one.");
        }
      }

      setReady(true);
    }

    void recoverHashSession();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setMessage(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      setSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      setSubmitting(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage(error.message);
      setSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login?message=Password updated. Please sign in with your new password.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {message ? (
        <Notice tone="red" className="p-3">
          {message}
        </Notice>
      ) : null}
      <Field
        label="New password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. Use a mix of letters and numbers.`}
      >
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          disabled={!ready || submitting}
        />
      </Field>
      <Field label="Confirm password">
        <Input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          disabled={!ready || submitting}
        />
      </Field>
      <Button className="w-full" type="submit" disabled={!ready || submitting}>
        {submitting ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}
