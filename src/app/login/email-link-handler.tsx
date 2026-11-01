"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

const noSubscribe = () => () => {};

// Email links (sign-in, confirm, password reset) arrive here as
// /login#access_token=...&refresh_token=...&type=...
// The fragment never reaches the server, so this saves the session as cookies
// and then moves on: password resets go to Settings, everything else home.
// location.replace swaps out the history entry, so the tokens don't linger.
export function EmailLinkHandler({ children }: { children: React.ReactNode }) {
  const hash = useSyncExternalStore(
    noSubscribe,
    () => window.location.hash,
    () => "",
  );
  const [sessionError, setSessionError] = useState<string | null>(null);

  const params = new URLSearchParams(hash.slice(1));
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  const type = params.get("type");
  const linkError = params.get("error_description");

  useEffect(() => {
    if (!access_token || !refresh_token) return;
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) setSessionError(error.message);
        else window.location.replace(type === "recovery" ? "/settings?password=reset" : "/");
      });
  }, [access_token, refresh_token, type]);

  const failed = linkError ?? sessionError;
  if (access_token && !failed) {
    return <p className="text-[15px]">Signing you in…</p>;
  }
  return (
    <>
      {failed && (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-ink">
          That email link didn&apos;t work ({failed.replace(/\+/g, " ")}). Links expire after an hour and work once.
          Send a new one below.
        </div>
      )}
      {children}
    </>
  );
}
