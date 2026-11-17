"use client";

import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";
import { Button, Input, Textarea, cx } from "@/components/ui";
import { useBackToClose } from "@/lib/use-back-to-close";
import {
  saveBalance,
  saveContact,
  saveYearsPlaying,
  sendMessage,
  type OverviewState,
} from "@/app/students/overview-actions";
import { CHANNEL_LABEL, type Channel, type Contact, type MessageRow } from "@/lib/overview/types";

// The interactive pieces of the student overview box: the small inline edits
// (years playing, balance), the Contact buttons with their small popup, the
// larger message box, and the communication history.

function Said({ state }: { state: OverviewState }) {
  if (!state?.error && !state?.ok) return null;
  return <p className={cx("text-sm", state.error ? "text-danger" : "text-sage")}>{state.error ?? state.ok}</p>;
}

const linkClass = "text-sm text-accent-ink underline underline-offset-2";

/** A line of text with a small "Edit" link that swaps it for a one-line form. */
function InlineEdit({
  view,
  disabled,
  children,
  action,
}: {
  view: ReactNode;
  disabled?: boolean;
  children: ReactNode;
  action: (s: OverviewState, fd: FormData) => Promise<OverviewState>;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(async (s: OverviewState, fd: FormData) => {
    const r = await action(s, fd);
    if (r?.ok) setEditing(false);
    return r;
  }, null);
  if (!editing) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2">
        {view}
        {!disabled && (
          <button type="button" className={linkClass} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {state?.ok && <span className="text-sm text-sage">{state.ok}</span>}
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <div className="flex items-center gap-2">
        <Button disabled={pending} className="min-h-10 px-4 text-sm">
          {pending ? "Saving…" : "Save"}
        </Button>
        <button type="button" className={linkClass} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
      <Said state={state} />
    </form>
  );
}

export function YearsEdit({ studentId, years, since, disabled }: { studentId: string; years: number | null; since: number | null; disabled?: boolean }) {
  return (
    <InlineEdit
      action={saveYearsPlaying}
      disabled={disabled}
      view={
        <span className="text-[16px]">
          {years === null ? (
            <span className="text-muted">Years playing not set</span>
          ) : (
            <>
              Playing {years === 0 ? "less than a year" : `${years} year${years === 1 ? "" : "s"}`}
              {since !== null && <span className="text-muted"> · since {since}</span>}
            </>
          )}
        </span>
      }
    >
      <input type="hidden" name="student_id" value={studentId} />
      <label className="flex items-center gap-2 text-[16px]">
        Years playing
        <Input name="years" type="number" inputMode="numeric" min={0} max={90} defaultValue={years ?? ""} className="w-24" autoFocus />
      </label>
    </InlineEdit>
  );
}

export function BalanceEdit({
  studentId,
  amount,
  view,
  note,
  disabled,
}: {
  studentId: string;
  amount: string;
  view: ReactNode;
  note: string | null;
  disabled?: boolean;
}) {
  return (
    <InlineEdit action={saveBalance} disabled={disabled} view={view}>
      <input type="hidden" name="student_id" value={studentId} />
      <label className="flex items-center gap-2 text-[16px]">
        Balance $
        <Input name="amount" inputMode="decimal" defaultValue={amount} placeholder="0.00" className="w-28" autoFocus />
      </label>
      <Input name="note" defaultValue={note ?? ""} placeholder="Note, e.g. November lessons" className="min-w-0 flex-1" />
      <p className="w-full text-sm text-muted">What the family owes. Use a minus sign for a credit. Empty clears it.</p>
    </InlineEdit>
  );
}

// ---------------------------------------------------------------- popups

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** The larger box: a sheet from the bottom on a phone, centred on a computer. */
function Sheet({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode }) {
  useBackToClose(true, onClose);
  useEscape(onClose);
  useEffect(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-2xl bg-paper text-ink shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-rule bg-paper px-4 pt-3 pb-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">{eyebrow}</div>
            <div className="font-semibold">{title}</div>
          </div>
          <button onClick={onClose} className="min-h-9 rounded-lg px-3 text-lg leading-none text-muted" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const BUBBLE: Record<Channel, string> = {
  email: "bg-plum-soft text-plum",
  text: "bg-sage-soft text-sage",
  push: "bg-amber-soft text-amber",
};

export function TypeBubble({ channel }: { channel: Channel }) {
  return (
    <span className={cx("inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-semibold", BUBBLE[channel])}>
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

type Ready = Record<Channel, boolean>;

const NOT_SET_UP: Record<Channel, string> = {
  email: "Email sending isn't set up yet, so this is saved in the history but not sent.",
  text: "Text sending isn't set up yet, so this is saved in the history but not sent.",
  push: "Push notifications start when the app is installed on phones. For now this is saved in the history only.",
};

function MessageBox({
  studentId,
  contact,
  channel,
  ready,
  onClose,
}: {
  studentId: string;
  contact: Contact;
  channel: Channel;
  ready: Ready;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(sendMessage, null);
  const stored = channel === "email" ? contact.email : channel === "text" ? contact.phone : null;
  const [to, setTo] = useState(stored ?? "");
  const changed = channel !== "push" && to.trim() !== "" && to.trim() !== (stored ?? "");
  const done = !!state?.ok;
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <Sheet
      title={`${CHANNEL_LABEL[channel]} ${contact.first}`}
      eyebrow={contact.role === "student" ? "Message the student" : "Message a parent"}
      onClose={onClose}
    >
      {done ? (
        <div className="flex flex-col gap-3 px-4 py-4">
          <p className="text-[16px]">{state.ok}</p>
          <Button type="button" onClick={onClose} className="self-start">
            Done
          </Button>
        </div>
      ) : (
        <form ref={formRef} action={action} className="flex flex-col gap-3 px-4 py-4">
          <input type="hidden" name="student_id" value={studentId} />
          <input type="hidden" name="contact" value={contact.key} />
          <input type="hidden" name="channel" value={channel} />
          <input type="hidden" name="recipient_name" value={contact.name} />
          {!ready[channel] && <p className="text-sm text-amber">{NOT_SET_UP[channel]}</p>}
          {channel !== "push" && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              To
              <Input
                name="to"
                type={channel === "email" ? "email" : "tel"}
                inputMode={channel === "email" ? "email" : "tel"}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder={channel === "email" ? `${contact.first}'s email` : `${contact.first}'s mobile number`}
                autoComplete="off"
              />
            </label>
          )}
          {changed && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 accent-[var(--accent)]" />
              Save as {contact.first}&apos;s {channel === "email" ? "email" : "number"}
            </label>
          )}
          {channel === "email" && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Subject
              <Input name="subject" placeholder="Subject" />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Message
            <Textarea name="body" rows={channel === "email" ? 9 : 5} autoFocus placeholder={`Write to ${contact.first}…`} />
          </label>
          {channel === "text" && <p className="text-sm text-muted">Texts over 160 characters go as more than one text.</p>}
          <Said state={state} />
          <div className="flex items-center gap-3">
            <Button disabled={pending}>{pending ? "Sending…" : ready[channel] ? "Send" : "Save to history"}</Button>
            <button type="button" className={linkClass} onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Sheet>
  );
}

/** A "Contact James" button and its small popup: Email, Text, Push notification. */
function ContactButton({
  studentId,
  contact,
  ready,
  disabled,
}: {
  studentId: string;
  contact: Contact;
  ready: Ready;
  disabled?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  // Opens to the right of the button, or to the left when it would run off the screen.
  const [alignRight, setAlignRight] = useState(false);
  const [channel, setChannel] = useState<Channel | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [menu]);
  const choices: { channel: Channel; label: string; hint: string }[] = [
    { channel: "email", label: "Email", hint: contact.email ?? "no email yet" },
    { channel: "text", label: "Text", hint: contact.phone ?? "no number yet" },
    { channel: "push", label: "Push notification", hint: "when the app is installed" },
  ];
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAlignRight(r.left + 248 > window.innerWidth);
          setMenu((m) => !m);
        }}
        aria-expanded={menu}
        className="min-h-10 rounded-full border border-rule bg-paper px-3.5 text-[15px] font-medium hover:border-accent/50 disabled:opacity-50"
      >
        Contact {contact.first}
      </button>
      {menu && (
        <div className={cx("absolute top-full z-30", alignRight ? "right-0" : "left-0", " mt-1 w-60 overflow-hidden rounded-xl border border-rule bg-paper shadow-xl")} role="menu">
          {choices.map((c) => (
            <button
              key={c.channel}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                setChannel(c.channel);
              }}
              className="flex w-full flex-col items-start px-3.5 py-2.5 text-left hover:bg-accent-soft"
            >
              <span className="text-[16px] font-medium">{c.label}</span>
              <span className="max-w-full truncate text-[13px] text-muted">{c.hint}</span>
            </button>
          ))}
        </div>
      )}
      {channel && <MessageBox studentId={studentId} contact={contact} channel={channel} ready={ready} onClose={() => setChannel(null)} />}
    </div>
  );
}

export function ContactRow({ studentId, contacts, ready, disabled }: { studentId: string; contacts: Contact[]; ready: Ready; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {contacts.map((c) => (
        <ContactButton key={c.key} studentId={studentId} contact={c} ready={ready} disabled={disabled} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- history

const STATUS_WORD: Record<MessageRow["status"], { word: string; tone: string }> = {
  sent: { word: "Sent", tone: "text-sage" },
  failed: { word: "Failed", tone: "text-danger" },
  not_sent: { word: "Not sent", tone: "text-amber" },
};

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function HistoryLink({ messages, studentFirst, disabled }: { messages: MessageRow[]; studentFirst: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | Channel>("all");
  const tabs: ("all" | Channel)[] = ["all", "email", "text", "push"];
  const shown = tab === "all" ? messages : messages.filter((m) => m.channel === tab);
  return (
    <>
      <button type="button" disabled={disabled} className={cx(linkClass, "self-start disabled:opacity-50")} onClick={() => setOpen(true)}>
        Communication history{messages.length ? ` (${messages.length})` : ""}
      </button>
      {open && (
        <Sheet title={`Messages about ${studentFirst}`} eyebrow="Communication history" onClose={() => setOpen(false)}>
          <div className="flex gap-1.5 overflow-x-auto border-b border-rule px-4 py-2" role="tablist">
            {tabs.map((t) => {
              const n = t === "all" ? messages.length : messages.filter((m) => m.channel === t).length;
              return (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cx(
                    "min-h-9 shrink-0 rounded-full px-3 text-sm font-medium",
                    tab === t ? "bg-ink text-paper" : "bg-rule/50 text-ink",
                  )}
                >
                  {t === "all" ? "All" : CHANNEL_LABEL[t]} {n > 0 && <span className="opacity-70">{n}</span>}
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-4 text-[16px] text-muted">Nothing here yet. Messages sent from the Contact buttons are kept here.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-rule">
              {shown.map((m) => (
                <li key={m.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-start gap-2.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <TypeBubble channel={m.channel} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">To {m.recipient_name}</span>
                          <span className="text-[13px] text-muted">{when(m.created_at)}</span>
                          <span className={cx("text-[13px] font-medium", STATUS_WORD[m.status].tone)}>{STATUS_WORD[m.status].word}</span>
                        </span>
                        <span className="truncate text-sm text-muted group-open:hidden">{m.subject || m.body}</span>
                      </span>
                      <span aria-hidden className="text-lg text-muted transition-transform group-open:rotate-90">
                        ›
                      </span>
                    </summary>
                    <div className="flex flex-col gap-1.5 px-4 pb-3 text-[16px]">
                      {m.to_address && <p className="text-sm text-muted">To {m.to_address}</p>}
                      {m.subject && <p className="font-semibold">{m.subject}</p>}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      {m.error && <p className="text-sm text-muted">{m.error}</p>}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Sheet>
      )}
    </>
  );
}

/** Contact details for one person, edited in place (also under Edit student). */
export function ContactDetailsForm({ studentId, contact }: { studentId: string; contact: Contact }) {
  const [state, action, pending] = useActionState(saveContact, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="contact" value={contact.key} />
      <div className="grid gap-2 sm:grid-cols-3">
        {contact.role === "parent" && <Input name="name" defaultValue={contact.name} placeholder="Name" aria-label="Name" />}
        <Input name="email" type="email" defaultValue={contact.email ?? ""} placeholder="Email" aria-label="Email" />
        <Input name="phone" type="tel" defaultValue={contact.phone ?? ""} placeholder="Mobile number" aria-label="Mobile number" />
      </div>
      <div className="flex items-center gap-3">
        <Button variant="secondary" disabled={pending} className="min-h-10 px-4 text-sm">
          {pending ? "Saving…" : "Save"}
        </Button>
        <Said state={state} />
      </div>
    </form>
  );
}

/** "Edit contact details": everyone's email and mobile number in one box. */
export function ContactDetailsLink({ studentId, contacts, disabled }: { studentId: string; contacts: Contact[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={disabled} className={cx(linkClass, "disabled:opacity-50")} onClick={() => setOpen(true)}>
        Contact details
      </button>
      {open && (
        <Sheet title="Emails and mobile numbers" eyebrow="Contact details" onClose={() => setOpen(false)}>
          <div className="flex flex-col divide-y divide-rule">
            {contacts.map((c) => (
              <div key={c.key} className="flex flex-col gap-2 px-4 py-3">
                <p className="font-semibold">
                  {c.name} <span className="text-sm font-normal text-muted">{c.role === "student" ? "student" : "parent"}</span>
                </p>
                <ContactDetailsForm studentId={studentId} contact={c} />
              </div>
            ))}
            <p className="px-4 py-3 text-sm text-muted">
              Add or remove a parent under Edit student. A parent&apos;s email is also their sign-in, so it can be changed but not left empty.
            </p>
          </div>
        </Sheet>
      )}
    </>
  );
}
