-- Music stand pilot: the teacher keeps a student's music (scores) in the app,
-- opens it on an iPad/phone/laptop during the lesson, and the stand logs
-- which piece and page is open (and any bars the teacher marks) with
-- wall-clock times. A lesson video's start time lines the two up, so the
-- video can be split by piece and marks can link to the moment they were made.
--
-- Score pages are stored as JPEG images (PDFs are converted in the browser)
-- in the private "lesson-scores" bucket at
--   {teacher_id}/{student_id}/{score_id}/{page}.jpg

create table public.scores (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  repertoire_id uuid references public.repertoire(id) on delete set null,
  title text not null,
  kind text not null default 'piece' check (kind in ('piece', 'exercise', 'scale', 'etude', 'other')),
  pages jsonb not null default '[]'::jsonb,   -- [{ "path": "...", "w": 1600, "h": 2070 }, ...]
  sort_order integer not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index scores_student_idx on public.scores(student_id, archived, sort_order);

create table public.stand_events (
  id uuid primary key default gen_random_uuid(), -- made by the browser, so offline retries don't duplicate
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  score_id uuid references public.scores(id) on delete set null,
  page integer,                         -- 1-based page within the score
  kind text not null check (kind in ('open', 'close', 'sync', 'mark', 'end')),
  rect jsonb,                           -- marks: { "x", "y", "w", "h" } as 0..1 of the page
  note text,
  at timestamptz not null,              -- when it happened, by the stand device's clock
  created_at timestamptz not null default now()
);
create index stand_events_lesson_idx on public.stand_events(lesson_id, at);

-- Wall-clock time of the first frame of a recording, so stand events can be
-- placed on the video. "file" = read from the video's metadata on upload,
-- "lineup" = the teacher matched a moment (the sync beep) by hand.
alter table public.recordings
  add column started_at timestamptz,
  add column started_at_source text check (started_at_source in ('file', 'lineup'));

alter table public.scores enable row level security;
alter table public.stand_events enable row level security;

create policy "teacher manages scores" on public.scores for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id() and public.teaches_student(student_id));

create policy "teacher manages stand events" on public.stand_events for all
  using (teacher_id = public.my_teacher_id())
  with check (
    teacher_id = public.my_teacher_id()
    and public.teaches_student(student_id)
    and exists (select 1 from public.lessons l where l.id = lesson_id and l.student_id = stand_events.student_id)
  );

grant all on public.scores to authenticated;
grant all on public.stand_events to authenticated;

-- ------------------------------------------------------------ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lesson-scores', 'lesson-scores', false, 20971520, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "teacher uploads scores" on storage.objects for insert to authenticated
  with check (bucket_id = 'lesson-scores' and (storage.foldername(name))[1] = public.my_teacher_id()::text);
create policy "teacher updates scores" on storage.objects for update to authenticated
  using (bucket_id = 'lesson-scores' and (storage.foldername(name))[1] = public.my_teacher_id()::text);
create policy "teacher reads scores" on storage.objects for select to authenticated
  using (bucket_id = 'lesson-scores' and (storage.foldername(name))[1] = public.my_teacher_id()::text);
create policy "teacher deletes scores" on storage.objects for delete to authenticated
  using (bucket_id = 'lesson-scores' and (storage.foldername(name))[1] = public.my_teacher_id()::text);
