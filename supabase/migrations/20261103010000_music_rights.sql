-- Copyright sign-off for sheet music uploads.
--
-- Before any sheet music is uploaded (a PDF, or photos/scans of a book), the
-- uploader ticks a box confirming they or the student's family own that copy
-- and it's only for teaching this student. Each tick is kept here with who,
-- when, and the exact wording they agreed to (statement_version + statement).
--
-- music_rights_confirmations  one row per upload or Replace file. Rows are
--                             never edited or deleted from the app, and stay
--                             on record even if the music or student is
--                             deleted later (score_id / student_id go null).
-- scores.rights_*             the confirmation for the file the score holds
--                             now, shown on the Music page.

create table if not exists public.music_rights_confirmations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid references public.students(id) on delete set null,
  score_id uuid references public.scores(id) on delete set null,
  confirmed_by uuid not null default auth.uid(),
  confirmed_email text not null default '',
  confirmed_at timestamptz not null default now(),
  statement_version text not null,
  statement text not null,
  action text not null default 'upload' check (action in ('upload', 'replace')),
  file_names text[] not null default '{}'
);

create index if not exists music_rights_confirmations_score_idx
  on public.music_rights_confirmations (score_id);

alter table public.music_rights_confirmations enable row level security;
drop policy if exists "teacher records music rights" on public.music_rights_confirmations;
create policy "teacher records music rights" on public.music_rights_confirmations for insert
  with check (teacher_id = public.my_teacher_id() and confirmed_by = auth.uid());
drop policy if exists "teacher reads music rights" on public.music_rights_confirmations;
create policy "teacher reads music rights" on public.music_rights_confirmations for select
  using (teacher_id = public.my_teacher_id());
grant select, insert on public.music_rights_confirmations to authenticated;

alter table public.scores
  add column if not exists rights_confirmation_id uuid
    references public.music_rights_confirmations(id) on delete set null,
  add column if not exists rights_confirmed_at timestamptz,
  add column if not exists rights_confirmed_email text,
  add column if not exists rights_version text;
