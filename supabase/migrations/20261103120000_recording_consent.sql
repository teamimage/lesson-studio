-- Parent or guardian consent before a student is recorded.
--
-- Lesson videos, home practice recordings, and sending them to the AI and
-- video services (AssemblyAI, Anthropic, Cloudflare Stream) all need a signed
-- consent from the student's parent or guardian first. The teacher collects
-- it on their own iPad or phone (parents don't sign in yet).
--
-- recording_consents  one row per signature: who signed, their relationship
--                     to the student, the signature drawing, who collected it
--                     and when, and the exact wording they agreed to
--                     (statement_version + statement). Rows are never deleted
--                     from the app. Withdrawing consent stamps revoked_* on
--                     the row and keeps it; a withdrawn row can't be undone,
--                     so a new consent is a new signature. If the student is
--                     deleted the record stays (student_id goes null,
--                     student_name keeps who it was for).
--
-- Safe to run more than once.

create table if not exists public.recording_consents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  student_name text not null default '',
  signer_name text not null,
  signer_relationship text not null default 'parent'
    check (signer_relationship in ('parent', 'guardian')),
  signer_email text not null default '',
  signature_png text not null default '',
  signed_at timestamptz not null default now(),
  collected_by uuid not null default auth.uid(),
  collected_email text not null default '',
  collected_how text not null default 'teacher_device'
    check (collected_how in ('teacher_device', 'parent_account')),
  statement_version text not null,
  statement text not null,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_email text,
  revoked_reason text
);

create index if not exists recording_consents_student_idx
  on public.recording_consents (student_id, signed_at desc);

alter table public.recording_consents enable row level security;

drop policy if exists "record recording consent" on public.recording_consents;
create policy "record recording consent" on public.recording_consents for insert
  with check (
    collected_by = auth.uid()
    and revoked_at is null
    and (public.teaches_student(student_id) or public.parents_student(student_id))
  );

drop policy if exists "read recording consent" on public.recording_consents;
create policy "read recording consent" on public.recording_consents for select
  using (
    teacher_id = public.my_teacher_id()
    or public.teaches_student(student_id)
    or public.parents_student(student_id)
  );

drop policy if exists "withdraw recording consent" on public.recording_consents;
create policy "withdraw recording consent" on public.recording_consents for update
  using (public.teaches_student(student_id) or public.parents_student(student_id))
  with check (public.teaches_student(student_id) or public.parents_student(student_id));

-- Only the withdrawal columns can be changed, and only once.
revoke update on public.recording_consents from authenticated;
grant select, insert on public.recording_consents to authenticated;
grant update (revoked_at, revoked_by, revoked_email, revoked_reason) on public.recording_consents to authenticated;

create or replace function public.recording_consents_keep_revoked() returns trigger
language plpgsql as $$
begin
  if old.revoked_at is not null then
    raise exception 'A withdrawn consent stays withdrawn. Sign a new consent instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists recording_consents_keep_revoked on public.recording_consents;
create trigger recording_consents_keep_revoked
  before update on public.recording_consents
  for each row execute function public.recording_consents_keep_revoked();
