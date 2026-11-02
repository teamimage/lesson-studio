-- Practice sessions: a recorded home practice that AI listens to.
--
-- The phone records the practice (audio, or video with audio) and, while it
-- records, notes once a second how loud it is and which pitches it hears
-- (practice_sessions.activity). At Stop the file uploads to the private
-- "practice-recordings" bucket. AssemblyAI transcribes any talking, Claude
-- reads the sound timeline + transcript against the current lesson's
-- assignments, ticks off what was practised in that day's practice log, and
-- then the recording is deleted. Only the analysis is kept.
--
-- Parents and the student's teacher can start, read and delete sessions.

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,   -- the plan being practised
  practice_date date not null default current_date,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds int not null default 0,
  playing_seconds int not null default 0,       -- seconds with musical sound, worked out from activity
  media text not null default 'audio' check (media in ('audio', 'video')),
  storage_path text,                             -- null once the recording is deleted
  mime_type text,
  size_bytes bigint,
  activity jsonb,                                -- [{t, db, n}] one entry per second
  status text not null default 'uploading'
    check (status in ('uploading', 'transcribing', 'analyzing', 'done', 'error')),
  counted boolean,                               -- false = not counted as practice
  provider_job_id text,
  transcript text,
  analysis jsonb,
  applied boolean not null default false,        -- ticks/minutes written to practice_logs
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index practice_sessions_student_idx on public.practice_sessions(student_id, started_at desc);

alter table public.practice_sessions enable row level security;
create policy "family and teacher manage practice sessions" on public.practice_sessions for all
  using (public.teaches_student(student_id) or public.parents_student(student_id))
  with check (public.teaches_student(student_id) or public.parents_student(student_id));
grant all on public.practice_sessions to authenticated;

-- AI costs: practice analysis is logged against the student's teacher, and
-- may be written by a parent's session.
alter table public.ai_usage
  add column if not exists practice_session_id uuid references public.practice_sessions(id) on delete set null;
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('transcription', 'draft', 'music', 'practice'));
drop policy if exists "family logs practice ai usage" on public.ai_usage;
create policy "family logs practice ai usage" on public.ai_usage for insert
  with check (
    practice_session_id is not null
    and exists (
      select 1 from public.practice_sessions p
      where p.id = practice_session_id and p.teacher_id = ai_usage.teacher_id
        and (public.teaches_student(p.student_id) or public.parents_student(p.student_id))
    )
  );

-- Temporary practice recordings, at {student_id}/{session_id}.{ext}.
insert into storage.buckets (id, name, public, file_size_limit)
values ('practice-recordings', 'practice-recordings', false, 2147483648)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "family uploads practice" on storage.objects;
create policy "family uploads practice" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'practice-recordings'
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(name))[1]
        and (public.teaches_student(s.id) or public.parents_student(s.id))
    )
  );
drop policy if exists "family updates practice" on storage.objects;
create policy "family updates practice" on storage.objects for update to authenticated
  using (
    bucket_id = 'practice-recordings'
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(name))[1]
        and (public.teaches_student(s.id) or public.parents_student(s.id))
    )
  );
drop policy if exists "family reads practice" on storage.objects;
create policy "family reads practice" on storage.objects for select to authenticated
  using (
    bucket_id = 'practice-recordings'
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(name))[1]
        and (public.teaches_student(s.id) or public.parents_student(s.id))
    )
  );
drop policy if exists "family deletes practice" on storage.objects;
create policy "family deletes practice" on storage.objects for delete to authenticated
  using (
    bucket_id = 'practice-recordings'
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(name))[1]
        and (public.teaches_student(s.id) or public.parents_student(s.id))
    )
  );
