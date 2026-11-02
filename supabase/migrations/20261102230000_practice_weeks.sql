-- Weekly practice reviews: one row per student per week (Monday to Sunday).
--
-- The numbers on the weekly review page (days, minutes, check marks) are
-- worked out live from practice_logs and practice_sessions. This table keeps
-- only Claude's written part (summary, encouraging line, going well, things
-- to work on, trends), so it isn't paid for twice. A finished week is written
-- the first time anyone opens it (or the Home practice page) after Sunday;
-- the current week can be written "so far" on request.
--
-- Parents and the student's teacher can read and write their student's rows.

create table if not exists public.practice_weeks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  week_start date not null,                       -- a Monday
  through_date date,                              -- last day the review covers (week_start + 6 = final)
  status text not null default 'generating'
    check (status in ('generating', 'done', 'error')),
  review jsonb,
  session_count int not null default 0,
  error text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, week_start)
);

alter table public.practice_weeks enable row level security;
drop policy if exists "family and teacher manage practice weeks" on public.practice_weeks;
create policy "family and teacher manage practice weeks" on public.practice_weeks for all
  using (public.teaches_student(student_id) or public.parents_student(student_id))
  with check (public.teaches_student(student_id) or public.parents_student(student_id));
grant all on public.practice_weeks to authenticated;

-- AI costs for weekly reviews, logged against the student's teacher.
alter table public.ai_usage
  add column if not exists practice_week_id uuid references public.practice_weeks(id) on delete set null;
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('transcription', 'draft', 'music', 'practice', 'weekly'));
drop policy if exists "family logs weekly review ai usage" on public.ai_usage;
create policy "family logs weekly review ai usage" on public.ai_usage for insert
  with check (
    practice_week_id is not null
    and exists (
      select 1 from public.practice_weeks w
      where w.id = practice_week_id and w.teacher_id = ai_usage.teacher_id
        and (public.teaches_student(w.student_id) or public.parents_student(w.student_id))
    )
  );
