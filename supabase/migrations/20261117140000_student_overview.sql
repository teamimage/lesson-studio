-- Student overview box and in-app messages (Nov 17 2026).
--
-- students.playing_since   year the student started (the box shows "N years").
--                          Families may see it, so it lives on the student row.
-- student_private          + email, phone (the student's own contact details)
--                          + balance_cents, balance_note, balance_updated_at.
--                          Teacher only, like the private notes.
-- parents.phone            for texts. The email column was already there.
-- teachers.message_signature, message_reply_to   (Settings, Messages)
-- messages                 every email, text and push note the teacher sends
--                          from the app, sent or not, so there is a record.
--                          Teacher (and admin) only.
--
-- Safe to run more than once.

alter table public.students add column if not exists playing_since int;

alter table public.student_private add column if not exists email text;
alter table public.student_private add column if not exists phone text;
alter table public.student_private add column if not exists balance_cents bigint;
alter table public.student_private add column if not exists balance_note text;
alter table public.student_private add column if not exists balance_updated_at timestamptz;

alter table public.parents add column if not exists phone text;

alter table public.teachers add column if not exists message_signature text;
alter table public.teachers add column if not exists message_reply_to text;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  parent_id uuid references public.parents(id) on delete set null,
  -- Who it went to, as written at the time (names and numbers change).
  recipient_name text not null,
  recipient_role text not null check (recipient_role in ('student', 'parent')),
  channel text not null check (channel in ('email', 'text', 'push')),
  to_address text,
  subject text,
  body text not null,
  -- sent: the provider took it. failed: the provider refused it (see error).
  -- not_sent: no provider set up yet, kept as a record only.
  status text not null check (status in ('sent', 'failed', 'not_sent')),
  error text,
  provider_id text,
  created_at timestamptz not null default now()
);
create index if not exists messages_student_idx on public.messages (student_id, created_at desc);

alter table public.messages enable row level security;
drop policy if exists "teacher manages messages" on public.messages;
create policy "teacher manages messages" on public.messages for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());
drop policy if exists "admin manages all" on public.messages;
create policy "admin manages all" on public.messages for all to authenticated
  using (public.admin_mode()) with check (public.admin_mode());
