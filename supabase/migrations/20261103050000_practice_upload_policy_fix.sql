-- Fix: home practice recordings couldn't upload ("The upload didn't finish").
--
-- The four storage rules for the practice-recordings bucket checked the
-- folder name with storage.foldername(name). Inside the "select from
-- students" part, "name" meant the STUDENT's name, not the file's path, so
-- the check never matched and every upload was refused. This version says
-- objects.name (the file's path). Safe to run more than once.

drop policy if exists "family uploads practice" on storage.objects;
create policy "family uploads practice" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'practice-recordings'
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(objects.name))[1]
        and (public.teaches_student(s.id) or public.parents_student(s.id))
    )
  );

drop policy if exists "family updates practice" on storage.objects;
create policy "family updates practice" on storage.objects for update to authenticated
  using (
    bucket_id = 'practice-recordings'
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(objects.name))[1]
        and (public.teaches_student(s.id) or public.parents_student(s.id))
    )
  );

drop policy if exists "family reads practice" on storage.objects;
create policy "family reads practice" on storage.objects for select to authenticated
  using (
    bucket_id = 'practice-recordings'
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(objects.name))[1]
        and (public.teaches_student(s.id) or public.parents_student(s.id))
    )
  );

drop policy if exists "family deletes practice" on storage.objects;
create policy "family deletes practice" on storage.objects for delete to authenticated
  using (
    bucket_id = 'practice-recordings'
    and exists (
      select 1 from public.students s
      where s.id::text = (storage.foldername(objects.name))[1]
        and (public.teaches_student(s.id) or public.parents_student(s.id))
    )
  );
