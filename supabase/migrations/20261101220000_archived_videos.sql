-- Archived lesson videos.
-- "Delete video" on a lesson no longer destroys the original. It removes the
-- Cloudflare streaming copy and hides the video from the lesson, but the
-- original file stays in the private "lesson-recordings" bucket and its row
-- stays here with archived_at set (the transcript stays too). From the lesson
-- page the teacher can Restore it (a new streaming copy is made); from
-- Settings -> Admin -> Storage an admin can delete it for good.

alter table public.recordings
  add column if not exists archived_at timestamptz;
create index if not exists recordings_archived_idx
  on public.recordings(archived_at) where archived_at is not null;

-- Families never see archived videos.
drop policy if exists "parent reads recordings of approved lessons" on public.recordings;
create policy "parent reads recordings of approved lessons" on public.recordings for select
  using (
    status = 'ready'
    and archived_at is null
    and exists (select 1 from public.lessons l where l.id = lesson_id and l.status = 'approved' and public.parents_student(l.student_id))
  );

drop policy if exists "parent reads recordings" on storage.objects;
create policy "parent reads recordings" on storage.objects for select to authenticated
  using (
    bucket_id = 'lesson-recordings'
    and exists (
      select 1 from public.recordings r
      join public.lessons l on l.id = r.lesson_id
      where r.storage_path = storage.objects.name
        and r.status = 'ready'
        and r.archived_at is null
        and l.status = 'approved'
        and public.parents_student(l.student_id)
    )
  );

-- Storage used, per bucket (admins only), for the admin Storage screen.
create or replace function public.admin_storage_usage()
returns table (bucket_id text, files bigint, bytes bigint)
language sql stable security definer set search_path = public, storage as $$
  select o.bucket_id::text, count(*)::bigint, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint
  from storage.objects o
  where public.is_app_admin()
  group by o.bucket_id
  order by 3 desc;
$$;

-- Video files left in storage with no recording row (for example from a
-- lesson that was deleted). Admins only.
create or replace function public.admin_unlinked_videos()
returns table (name text, bytes bigint, created_at timestamptz)
language sql stable security definer set search_path = public, storage as $$
  select o.name::text, coalesce((o.metadata ->> 'size')::bigint, 0)::bigint, o.created_at
  from storage.objects o
  where public.is_app_admin()
    and o.bucket_id = 'lesson-recordings'
    and not exists (select 1 from public.recordings r where r.storage_path = o.name)
  order by o.created_at;
$$;

revoke execute on function public.admin_storage_usage() from anon, public;
revoke execute on function public.admin_unlinked_videos() from anon, public;
grant execute on function public.admin_storage_usage() to authenticated;
grant execute on function public.admin_unlinked_videos() to authenticated;
