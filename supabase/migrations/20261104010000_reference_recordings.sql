-- Reference recordings: audio for listening, assigned as practice.
--
-- The teacher's own library of recordings (a Suzuki book's tracks, other
-- pieces the studio uses), tagged by instrument, book and track. They are
-- only for listening. Practice analysis never compares against them.
--
-- Bring your own recording: nothing is pre-loaded. Each upload (or link) is
-- signed off like sheet music: the teacher confirms they or the families they
-- assign it to own that recording (for example the CD or download that came
-- with the book), and it stays inside the studio.
--
-- reference_recordings             one row per track (file) or link.
-- reference_rights_confirmations   one row per upload batch or link, with who,
--                                  when and the exact wording. Kept if the
--                                  recordings are deleted later.
-- assignments.reference_recording_id / listen_times
--                                  a "Listen to ..." practice item and how
--                                  many plays a day it asks for.
-- practice_logs.listen_plays       {assignment_id: plays that day}. Reaching
--                                  listen_times ticks the item off.
-- storage bucket reference-audio   {teacher}/{recording}/{file}. The teacher
--                                  manages it; families can play a recording
--                                  that an approved lesson assigned to their child.

create table if not exists public.reference_rights_confirmations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  confirmed_by uuid not null default auth.uid(),
  confirmed_email text not null default '',
  confirmed_at timestamptz not null default now(),
  statement_version text not null,
  statement text not null,
  file_names text[] not null default '{}'
);

alter table public.reference_rights_confirmations enable row level security;
drop policy if exists "teacher records reference rights" on public.reference_rights_confirmations;
create policy "teacher records reference rights" on public.reference_rights_confirmations for insert
  with check (teacher_id = public.my_teacher_id() and confirmed_by = auth.uid());
drop policy if exists "teacher reads reference rights" on public.reference_rights_confirmations;
create policy "teacher reads reference rights" on public.reference_rights_confirmations for select
  using (teacher_id = public.my_teacher_id());
grant select, insert on public.reference_rights_confirmations to authenticated;

create table if not exists public.reference_recordings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  instrument text,
  book text,
  track_no int,
  title text not null,
  -- The uploaded sheet music this recording goes with, if any.
  score_id uuid references public.scores(id) on delete set null,
  source text not null default 'file' check (source in ('file', 'link')),
  status text not null default 'ready' check (status in ('uploading', 'ready')),
  storage_path text,
  file_name text,
  size_bytes bigint,
  mime_type text,
  duration_seconds numeric,
  link_url text,
  rights_confirmation_id uuid references public.reference_rights_confirmations(id) on delete set null,
  rights_confirmed_at timestamptz,
  rights_confirmed_email text,
  rights_version text,
  created_at timestamptz not null default now()
);

create index if not exists reference_recordings_teacher_idx
  on public.reference_recordings (teacher_id, book, track_no);

alter table public.assignments
  add column if not exists reference_recording_id uuid
    references public.reference_recordings(id) on delete set null,
  add column if not exists listen_times smallint;

alter table public.practice_logs
  add column if not exists listen_plays jsonb not null default '{}'::jsonb;

-- Can the signed-in family play this recording? Only when an approved lesson
-- of one of their children assigns it.
create or replace function public.family_hears_recording(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.assignments a
    join public.lessons l on l.id = a.lesson_id
    where a.reference_recording_id = rid
      and l.status = 'approved'
      and public.parents_student(a.student_id)
  )
$$;

-- Same, from a storage object path {teacher}/{recording}/{file}.
create or replace function public.family_hears_reference_path(object_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.reference_recordings r
    where r.storage_path = object_path
      and public.family_hears_recording(r.id)
  )
$$;

revoke execute on function public.family_hears_recording(uuid) from public, anon;
revoke execute on function public.family_hears_reference_path(text) from public, anon;
grant execute on function public.family_hears_recording(uuid) to authenticated;
grant execute on function public.family_hears_reference_path(text) to authenticated;

alter table public.reference_recordings enable row level security;
drop policy if exists "teacher manages reference recordings" on public.reference_recordings;
create policy "teacher manages reference recordings" on public.reference_recordings for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());
drop policy if exists "family reads assigned reference recordings" on public.reference_recordings;
create policy "family reads assigned reference recordings" on public.reference_recordings for select
  using (public.family_hears_recording(id));
grant select, insert, update, delete on public.reference_recordings to authenticated;

-- ------------------------------------------------------------ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reference-audio', 'reference-audio', false, 209715200,
  array['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac',
        'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/vnd.wave', 'audio/flac', 'audio/x-flac',
        'audio/ogg', 'audio/webm']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The object's own path is passed by its column name (objects.name), never
-- inside a subquery, so it can't be mistaken for another table's "name".
drop policy if exists "teacher uploads reference audio" on storage.objects;
create policy "teacher uploads reference audio" on storage.objects for insert to authenticated
  with check (bucket_id = 'reference-audio' and split_part(objects.name, '/', 1) = public.my_teacher_id()::text);
drop policy if exists "teacher updates reference audio" on storage.objects;
create policy "teacher updates reference audio" on storage.objects for update to authenticated
  using (bucket_id = 'reference-audio' and split_part(objects.name, '/', 1) = public.my_teacher_id()::text);
drop policy if exists "teacher deletes reference audio" on storage.objects;
create policy "teacher deletes reference audio" on storage.objects for delete to authenticated
  using (bucket_id = 'reference-audio' and split_part(objects.name, '/', 1) = public.my_teacher_id()::text);
drop policy if exists "teacher or family reads reference audio" on storage.objects;
create policy "teacher or family reads reference audio" on storage.objects for select to authenticated
  using (
    bucket_id = 'reference-audio'
    and (
      split_part(objects.name, '/', 1) = public.my_teacher_id()::text
      or public.family_hears_reference_path(objects.name)
    )
  );

notify pgrst, 'reload schema';
