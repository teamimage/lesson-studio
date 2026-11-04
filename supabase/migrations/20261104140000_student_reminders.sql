-- Technique and posture reminders: standing points the teacher wants the
-- child to keep in mind every time they play (bow hold, left-hand shape,
-- sitting tall, endpin height...). Unlike practice assignments they carry
-- over from lesson to lesson until the teacher clears them.
--
-- status  'active'    shown to the family on Home practice and the lesson sheet
--         'suggested' proposed by the AI lesson draft, teacher-only until kept
--         'cleared'   no longer needed (kept for history)
--
-- Safe to run more than once.

create table if not exists public.student_reminders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null default 'technique' check (kind in ('technique', 'posture')),
  text text not null check (length(trim(text)) > 0),
  status text not null default 'active' check (status in ('active', 'suggested', 'cleared')),
  lesson_id uuid references public.lessons(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cleared_at timestamptz
);
create index if not exists student_reminders_student
  on public.student_reminders (student_id, status, sort_order);

drop trigger if exists student_reminders_updated_at on public.student_reminders;
create trigger student_reminders_updated_at before update on public.student_reminders
  for each row execute function public.set_updated_at();

alter table public.student_reminders enable row level security;

drop policy if exists "teacher manages reminders" on public.student_reminders;
create policy "teacher manages reminders" on public.student_reminders for all
  using (public.teaches_student(student_id))
  with check (public.teaches_student(student_id));

-- Families only ever see the reminders the teacher kept.
drop policy if exists "parent reads active reminders" on public.student_reminders;
create policy "parent reads active reminders" on public.student_reminders for select
  using (status = 'active' and public.parents_student(student_id));
