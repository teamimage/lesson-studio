-- Lesson recordings: video files attached to a lesson record.
-- Files live in the private "lesson-recordings" bucket at
--   {teacher_id}/{student_id}/{recording_id}/{file name}
-- and are uploaded from the browser with the resumable (TUS) endpoint.
-- Teachers manage their own students' recordings; parents can watch the
-- recordings of their children's approved lessons.

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  label text,                            -- e.g. "Piano camera"
  mime_type text not null default 'video/mp4',
  size_bytes bigint not null default 0,
  duration_seconds numeric,
  status text not null default 'uploading' check (status in ('uploading', 'ready')),
  created_at timestamptz not null default now()
);
create index recordings_lesson_idx on public.recordings(lesson_id);
create index recordings_student_idx on public.recordings(student_id, created_at desc);

alter table public.recordings enable row level security;

create policy "teacher manages recordings" on public.recordings for all
  using (teacher_id = public.my_teacher_id())
  with check (
    teacher_id = public.my_teacher_id()
    and public.teaches_student(student_id)
    and exists (select 1 from public.lessons l where l.id = lesson_id and l.student_id = recordings.student_id)
  );
create policy "parent reads recordings of approved lessons" on public.recordings for select
  using (
    status = 'ready'
    and exists (select 1 from public.lessons l where l.id = lesson_id and l.status = 'approved' and public.parents_student(l.student_id))
  );

grant all on public.recordings to authenticated;

-- ------------------------------------------------------------ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-recordings',
  'lesson-recordings',
  false,
  10737418240, -- 10 GB per file
  array['video/*', 'audio/*']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first folder of every object is the teacher id.
create policy "teacher uploads recordings" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lesson-recordings'
    and (storage.foldername(name))[1] = public.my_teacher_id()::text
  );
-- TUS resumes and upserts need update as well as insert.
create policy "teacher updates recordings" on storage.objects for update to authenticated
  using (
    bucket_id = 'lesson-recordings'
    and (storage.foldername(name))[1] = public.my_teacher_id()::text
  );
create policy "teacher reads recordings" on storage.objects for select to authenticated
  using (
    bucket_id = 'lesson-recordings'
    and (storage.foldername(name))[1] = public.my_teacher_id()::text
  );
create policy "teacher deletes recordings" on storage.objects for delete to authenticated
  using (
    bucket_id = 'lesson-recordings'
    and (storage.foldername(name))[1] = public.my_teacher_id()::text
  );
create policy "parent reads recordings" on storage.objects for select to authenticated
  using (
    bucket_id = 'lesson-recordings'
    and exists (
      select 1 from public.recordings r
      join public.lessons l on l.id = r.lesson_id
      where r.storage_path = storage.objects.name
        and r.status = 'ready'
        and l.status = 'approved'
        and public.parents_student(l.student_id)
    )
  );
