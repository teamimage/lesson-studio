"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createMailerClient } from "@/lib/supabase/mailer";
import { INVITE_TOKEN, ROLE_COOKIE } from "@/lib/role";

function tokenOf(fd: FormData): string {
  const token = String(fd.get("token") ?? "");
  if (!INVITE_TOKEN.test(token)) redirect("/login");
  return token;
}

/** Signed out: remember the email on the invite and send it a sign-in code. */
export async function sendJoinCode(fd: FormData) {
  const token = tokenOf(fd);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const page = `/join/${token}`;
  if (!email.includes("@")) redirect(`${page}?error=email`);

  const supabase = await createClient();
  const { data: started } = await supabase.rpc("family_invite_start", { p_token: token, p_email: email });
  if (!started) redirect(`${page}?error=invite`);

  const origin = (await headers()).get("origin") ?? "";
  const { error } = await createMailerClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/login` },
  });
  if (error) redirect(`${page}?error=send&for=${encodeURIComponent(email)}`);
  redirect(`${page}?email=${encodeURIComponent(email)}`);
}

/** Signed out, has a password already: sign in and join. */
export async function joinWithPassword(fd: FormData) {
  const token = tokenOf(fd);
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const page = `/join/${token}`;
  if (!email.includes("@") || !password) redirect(`${page}?error=password&for=${encodeURIComponent(email)}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`${page}?error=password&for=${encodeURIComponent(email)}`);
  await finish(token, String(fd.get("name") ?? ""));
}

/** Typed the 6-digit code from the email: sign in and join. */
export async function verifyJoinCode(fd: FormData) {
  const token = tokenOf(fd);
  const email = String(fd.get("email") ?? "").trim();
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  const back = `/join/${token}?email=${encodeURIComponent(email)}`;
  if (!code) redirect(`${back}&error=code`);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) redirect(`${back}&error=code`);
  await finish(token, String(fd.get("name") ?? ""));
}

/** Already signed in: join. */
export async function acceptInvite(fd: FormData) {
  const token = tokenOf(fd);
  await finish(token, String(fd.get("name") ?? ""));
}

// Links the signed-in user to the invite's student and opens their page.
async function finish(token: string, name: string): Promise<never> {
  const supabase = await createClient();
  const { data: studentId, error } = await supabase.rpc("accept_family_invite", {
    p_token: token,
    p_name: name.trim().slice(0, 120),
  });
  if (error || !studentId) {
    const known = ["signin", "invalid", "used", "revoked", "expired"];
    const code = known.find((k) => error?.message?.includes(k)) ?? "join";
    redirect(`/join/${token}?error=${code}`);
  }
  // Pick the side of the app now, rather than on the next request.
  const { data: claims } = await supabase.auth.getClaims();
  const { data: role } = await supabase.rpc("my_role");
  const jar = await cookies();
  if (claims?.claims?.sub && (role === "family" || role === "teacher")) {
    jar.set(ROLE_COOKIE, `${role}.${claims.claims.sub}`, { path: "/", maxAge: 31536000, sameSite: "lax" });
  }
  redirect(`/family/${studentId}?welcome=1`);
}
