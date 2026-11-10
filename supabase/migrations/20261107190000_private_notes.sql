-- Teacher-only notes move out of the rows families can read.
--
-- Families linked to a student may read that student's row and its approved
-- lessons. Row rules can't hide single columns, so the private columns
-- (lessons.teacher_notes, lessons.suggestions, students.notes) now live in
-- two tables only the teacher (and admin) can read:
--
--   lesson_private   lesson_id, teacher_notes, suggestions
--   student_private  student_id, notes
--
-- The old columns stay but are always empty: a trigger catches anything
-- written to them, stores it in the private table and blanks the column. So
-- every existing save path keeps working, and an empty string ('') clears a note.
--
-- RUN THIS AFTER the version with family sign-in is live (that version reads
-- the private tables, and falls back to the old columns until this has run).
-- Safe to run more than once.

create table if not exists public.lesson_private (
  lesson_id uuid primary key references public.lessons(id) on delete cascade deferrable initially deferred,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  teacher_notes text,
  suggestions text,
  updated_at timestamptz not null default now()
);

create table if not exists public.student_private (
  student_id uuid primary key references public.students(id) on delete cascade deferrable initially deferred,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now()
);

alter table public.lesson_private enable row level security;
alter table public.student_private enable row level security;

drop policy if exists "teacher manages lesson private" on public.lesson_private;
create policy "teacher manages lesson private" on public.lesson_private for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());
drop policy if exists "teacher manages student private" on public.student_private;
create policy "teacher manages student private" on public.student_private for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());
drop policy if exists "admin manages all" on public.lesson_private;
create policy "admin manages all" on public.lesson_private for all to authenticated
  using (public.admin_mode()) with check (public.admin_mode());
drop policy if exists "admin manages all" on public.student_private;
create policy "admin manages all" on public.student_private for all to authenticated
  using (public.admin_mode()) with check (public.admin_mode());

-- Anything written to the old columns goes to the private table instead.
create or replace function public.lessons_keep_private() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.teacher_notes is not null or new.suggestions is not null then
    insert into public.lesson_private (lesson_id, teacher_id, teacher_notes, suggestions)
    values (new.id, new.teacher_id, nullif(trim(new.teacher_notes), ''), nullif(trim(new.suggestions), ''))
    on conflict (lesson_id) do update set
      teacher_notes = case when new.teacher_notes is null then lesson_private.teacher_notes
                           else nullif(trim(new.teacher_notes), '') end,
      suggestions = case when new.suggestions is null then lesson_private.suggestions
                         else nullif(trim(new.suggestions), '') end,
      teacher_id = new.teacher_id,
      updated_at = now();
    new.teacher_notes := null;
    new.suggestions := null;
  end if;
  return new;
end;
$$;

create or replace function public.students_keep_private() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.notes is not null then
    insert into public.student_private (student_id, teacher_id, notes)
    values (new.id, new.teacher_id, nullif(trim(new.notes), ''))
    on conflict (student_id) do update set
      notes = nullif(trim(new.notes), ''), teacher_id = new.teacher_id, updated_at = now();
    new.notes := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.lessons_keep_private() from public, anon, authenticated;
revoke execute on function public.students_keep_private() from public, anon, authenticated;

drop trigger if exists lessons_keep_private on public.lessons;
create trigger lessons_keep_private before insert or update on public.lessons
  for each row execute function public.lessons_keep_private();
drop trigger if exists students_keep_private on public.students;
create trigger students_keep_private before insert or update on public.students
  for each row execute function public.students_keep_private();

-- Move what's there now (the triggers do the moving).
update public.lessons set teacher_notes = teacher_notes
  where teacher_notes is not null or suggestions is not null;
update public.students set notes = notes where notes is not null;
