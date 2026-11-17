export type Channel = "email" | "text" | "push";
export type MessageStatus = "sent" | "failed" | "not_sent";

export type Contact = {
  /** "student" or the parent's id. */
  key: string;
  role: "student" | "parent";
  parentId: string | null;
  name: string;
  first: string;
  email: string | null;
  phone: string | null;
};

export type RepertoireLine = {
  title: string;
  activity: string;
  /** In how many of the last two lessons (1 or 2). */
  lessons: number;
  /** In the most recent lesson. */
  latest: boolean;
};

export type MessageRow = {
  id: string;
  student_id: string;
  parent_id: string | null;
  recipient_name: string;
  recipient_role: "student" | "parent";
  channel: Channel;
  to_address: string | null;
  subject: string | null;
  body: string;
  status: MessageStatus;
  error: string | null;
  created_at: string;
};

export type OverviewData = {
  /** False until student-overview.sql has run. */
  ready: boolean;
  playingSince: number | null;
  contacts: Contact[];
  balanceCents: number | null;
  balanceNote: string | null;
  balanceUpdatedAt: string | null;
  repertoire: RepertoireLine[];
  messages: MessageRow[];
};

export const CHANNEL_LABEL: Record<Channel, string> = { email: "Email", text: "Text", push: "Push" };

export const ACTIVITY_WORD: Record<string, string> = {
  started: "new",
  worked_on: "working",
  polished: "polishing",
  reviewed: "review",
  performed: "performed",
};

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
