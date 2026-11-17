import "server-only";

// Sending email and texts from inside the app, so every message is kept on
// the student's record. Each channel needs a provider account and keys in
// the Vercel environment; until those are there, nothing is sent and the
// message is saved as "not sent" (never shown as sent).
//
//   Email (Resend):  RESEND_API_KEY, MESSAGES_FROM_EMAIL
//                    e.g. MESSAGES_FROM_EMAIL="Maaike Kahn <studio@yourdomain.com>"
//   Text (Twilio):   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
//   Push:            not wired yet; needs the installed app.

export type SendResult = { status: "sent" | "failed" | "not_sent"; error?: string; providerId?: string };

export function channelReady() {
  return {
    email: !!(process.env.RESEND_API_KEY && process.env.MESSAGES_FROM_EMAIL),
    text: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
    push: false,
  };
}

export async function sendEmail(to: string, subject: string, body: string, replyTo?: string | null): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MESSAGES_FROM_EMAIL;
  if (!key || !from) return { status: "not_sent", error: "Email sending isn't set up yet." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text: body, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { status: "failed", error: json.message ?? `Email provider said ${res.status}.` };
    return { status: "sent", providerId: json.id };
  } catch {
    return { status: "failed", error: "Couldn't reach the email provider." };
  }
}

/** US numbers typed as (555) 123-4567 become +15551234567. */
export function toE164(phone: string): string | null {
  const t = phone.trim();
  const digits = t.replace(/\D/g, "");
  if (t.startsWith("+") && digits.length >= 8) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function sendText(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return { status: "not_sent", error: "Text sending isn't set up yet." };
  const number = toE164(to);
  if (!number) return { status: "failed", error: "That phone number doesn't look right." };
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: number, From: from, Body: body }),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
    if (!res.ok) return { status: "failed", error: json.message ?? `Text provider said ${res.status}.` };
    return { status: "sent", providerId: json.sid };
  } catch {
    return { status: "failed", error: "Couldn't reach the text provider." };
  }
}
