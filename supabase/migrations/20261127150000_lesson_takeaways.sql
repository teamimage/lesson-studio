-- Main takeaways from a student's last three approved lessons: one row per
-- student, shown on the student page to the teacher and the family.
--
-- Claude compares the last three approved lessons (summary, focus, pieces,
-- the practice checklist; never the teacher's private notes) and writes two
-- parts: the overall takeaways and progress, and "The specifics", each
-- marked one-time or repeated. The row is rewritten when one of those
-- lessons changes or a new lesson is approved; source_key says which
-- version of the lessons it was written from.
--
-- Safe to run more than once. The student's teacher and family can read and
-- write their student's row (a family page writes it when it is missing).

create table if not exists public.lesson_takeaways (
  student_id uuid primary key references public.students(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  source_key text not null default '',
  lesson_ids uuid[] not null default '{}',
  status text not null default 'generating'
    check (status in ('generating', 'done', 'error')),
  takeaways jsonb,
  error text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lesson_takeaways enable row level security;
drop policy if exists "family and teacher manage lesson takeaways" on public.lesson_takeaways;
create policy "family and teacher manage lesson takeaways" on public.lesson_takeaways for all
  using (public.teaches_student(student_id) or public.parents_student(student_id))
  with check (public.teaches_student(student_id) or public.parents_student(student_id));
grant all on public.lesson_takeaways to authenticated;

-- AI costs: when a family page writes the takeaways, the cost is logged
-- against the student's teacher, tied to the newest approved lesson used.
drop policy if exists "family logs takeaways ai usage" on public.ai_usage;
create policy "family logs takeaways ai usage" on public.ai_usage for insert
  with check (
    kind = 'draft'
    and lesson_id is not null
    and exists (
      select 1 from public.lessons l
      where l.id = lesson_id and l.teacher_id = ai_usage.teacher_id
        and l.status = 'approved' and public.parents_student(l.student_id)
    )
  );
