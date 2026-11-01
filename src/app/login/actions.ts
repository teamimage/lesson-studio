"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createMailerClient } from "@/lib/supabase/mailer";

// Sends a sign-in email. It always has a link (handled by EmailLinkHandler
// on /login); it also shows a 6-digit code if the Supabase template has {{ .Token }}.
export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?error=email");

  const origin = (await headers()).get("origin") ?? "";
  const { error } = await createMailerClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/login` },
  });

  if (error) redirect("/login?error=send");
  redirect(`/login?email=${encodeURIComponent(email)}`);
}

export async function verifyCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const token = String(formData.get("code") ?? "").replace(/\s/g, "");
  const back = `/login?email=${encodeURIComponent(email)}`;
  if (!email) redirect("/login?error=email");
  if (!token) redirect(`${back}&error=code`);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error) redirect(`${back}&error=code`);
  redirect("/");
}

// Email + password sign-in. Accounts are still created by the email code;
// a password is added later in Settings or with "Forgot password".
export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email) redirect("/login?error=email");
  if (!password) redirect(`/login?error=nopassword&for=${encodeURIComponent(email)}`);

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=password&for=${encodeURIComponent(email)}`);
  redirect("/");
}

// Emails a link that signs the user in and opens Settings to choose a
// new password (see EmailLinkHandler).
export async function sendPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) redirect("/login?mode=reset&error=email");

  const origin = (await headers()).get("origin") ?? "";
  // Works for accounts that never had a password too: the link signs them
  // in and opens Settings, where they choose one.
  const { error } = await createMailerClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/login`,
  });

  if (error) redirect(`/login?mode=reset&error=send&for=${encodeURIComponent(email)}`);
  redirect(`/login?mode=reset&sent=${encodeURIComponent(email)}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
