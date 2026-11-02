-- Student photos: a picture of the student's face, shown as a round avatar
-- (tap to enlarge) wherever the app shows the student.
--
-- students.photo_path        where the photo sits in the private
--                            "student-photos" bucket:
--                            {teacher_id}/{student_id}/{timestamp}.jpg
-- students.photo_updated_at  changes with every new photo, so browsers
--                            fetch the new one instead of a cached copy.
--
-- The app shrinks photos on the phone before upload (about 1200 px, JPEG),
-- so files are small. Teachers manage their own students' photos; parents
-- can see their own children's photos; admins can see and delete any.

alter table public.students
  add column if not exists photo_path text,
  add column if not exists photo_updated_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "teacher uploads student photos" on storage.objects;
drop policy if exists "teacher updates student photos" on storage.objects;
drop policy if exists "teacher reads student photos" on storage.objects;
drop policy if exists "teacher deletes student photos" on storage.objects;
drop policy if exists "parent reads student photos" on storage.objects;
drop policy if exists "admin reads student photos" on storage.objects;
drop policy if exists "admin deletes student photos" on storage.objects;

create policy "teacher uploads student photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and (storage.foldername(name))[1] = public.my_teacher_id()::text);
create policy "teacher updates student photos" on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and (storage.foldername(name))[1] = public.my_teacher_id()::text);
create policy "teacher reads student photos" on storage.objects for select to authenticated
  using (bucket_id = 'student-photos' and (storage.foldername(name))[1] = public.my_teacher_id()::text);
create policy "teacher deletes student photos" on storage.objects for delete to authenticated
  using (bucket_id = 'student-photos' and (storage.foldername(name))[1] = public.my_teacher_id()::text);

create policy "parent reads student photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'student-photos'
    and exists (
      select 1 from public.students s
      where s.photo_path = storage.objects.name
        and public.parents_student(s.id)
    )
  );

create policy "admin reads student photos" on storage.objects for select to authenticated
  using (bucket_id = 'student-photos' and public.is_app_admin());
create policy "admin deletes student photos" on storage.objects for delete to authenticated
  using (bucket_id = 'student-photos' and public.is_app_admin());
