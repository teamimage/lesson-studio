import { Suspense } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { AdminNotices } from "@/components/admin-ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Button, Card, Pill, SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/format";
import { adminDeleteAccount, adminMakeTeacher } from "./actions";

type SP = Promise<{ saved?: string; deleted?: string; error?: string }>;

export default function AdminPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Admin" eyebrow="All accounts" back={{ href: "/settings", label: "Settings" }} wide>
      <Suspense>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const { db, viewer } = await requireAdmin();
  const sp = await searchParams;
  const [{ data: users }, { data: teachers }, { data: students }, { data: parents }] = await Promise.all([
    db.rpc("admin_list_users"),
    db.from("teachers").select("*").order("created_at"),
    db.from("students").select("id, teacher_id, name, instrument, active").order("name"),
    db.from("parents").select("id, teacher_id, name, email, user_id"),
  ]);
  const emailOf = new Map((users ?? []).map((u) => [u.id, u]));
  const teacherUserIds = new Set((teachers ?? []).map((t) => t.user_id));
  const otherUsers = (users ?? []).filter((u) => !teacherUserIds.has(u.id));

  return (
    <div className="flex flex-col gap-8">
      <AdminNotices sp={sp} />
      <p className="text-sm text-muted">
        Everything in the app, grouped by teacher. Open a teacher to see and edit their students, parents,
        lessons, practice logs and videos. Changes here take effect right away for that account.
      </p>

      <Link href="/admin/storage" className="block">
        <Card className="flex items-center gap-3 transition hover:border-accent/50">
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Storage</div>
            <div className="text-sm text-muted">
              Space used, videos deleted from lessons, and old videos to delete for good.
            </div>
          </div>
          <span className="text-accent-ink" aria-hidden>
            ›
          </span>
        </Card>
      </Link>

      <section>
        <SectionTitle>Teachers</SectionTitle>
        <div className="flex flex-col gap-3">
          {(teachers ?? []).map((t) => {
            const mine = (students ?? []).filter((s) => s.teacher_id === t.id);
            const fams = (parents ?? []).filter((p) => p.teacher_id === t.id);
            const user = emailOf.get(t.user_id);
            return (
              <Link key={t.id} href={`/admin/teachers/${t.id}`} className="block">
                <Card className="flex items-center gap-3 transition hover:border-accent/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {t.name || "No name yet"}
                      {t.studio_name && <span className="font-normal text-muted"> · {t.studio_name}</span>}
                    </div>
                    <div className="truncate text-sm text-muted">{user?.email ?? "(account missing)"}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Pill tone="accent">
                        {mine.length} student{mine.length === 1 ? "" : "s"}
                      </Pill>
                      <Pill tone="plum">
                        {fams.length} parent{fams.length === 1 ? "" : "s"}
                      </Pill>
                      {t.user_id === viewer.userId && <Pill tone="sage">You</Pill>}
                    </div>
                  </div>
                  <span className="text-accent-ink" aria-hidden>
                    ›
                  </span>
                </Card>
              </Link>
            );
          })}
          {(teachers ?? []).length === 0 && <p className="text-sm text-muted">No teachers yet.</p>}
        </div>
      </section>

      <section>
        <SectionTitle>Other sign-ins</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          Accounts that aren&apos;t teachers. Parents show up here once they sign in; their children are under
          their teacher above.
        </p>
        <div className="flex flex-col gap-2">
          {otherUsers.map((u) => {
            const parentOf = (parents ?? []).filter(
              (p) => p.user_id === u.id || p.email.toLowerCase() === u.email.toLowerCase(),
            );
            return (
              <Card key={u.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{u.email}</div>
                  <div className="text-xs text-muted">
                    {parentOf.length > 0 ? `Parent (${parentOf.map((p) => p.name).join(", ")})` : "No role"}
                    {" · "}
                    {u.last_sign_in_at ? `last signed in ${formatDate(u.last_sign_in_at.slice(0, 10))}` : "never signed in"}
                  </div>
                </div>
                <form action={adminMakeTeacher}>
                  <input type="hidden" name="user_id" value={u.id} />
                  <Button variant="secondary" className="min-h-9 px-3 text-sm">
                    Make teacher
                  </Button>
                </form>
                <form action={adminDeleteAccount}>
                  <input type="hidden" name="user_id" value={u.id} />
                  <ConfirmButton
                    message={`Delete the sign-in for ${u.email}? They won't be able to sign in until they make a new account.`}
                    variant="danger"
                    className="min-h-9 px-3 text-sm"
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </Card>
            );
          })}
          {otherUsers.length === 0 && <p className="text-sm text-muted">None.</p>}
        </div>
      </section>
    </div>
  );
}
