-- The teacher's lesson schedule (Downbeat, the landing page).
--
-- lesson_slots          a student's regular weekly lesson: weekday
--                       (0 = Sunday ... 6 = Saturday), start time and length
--                       in minutes, in the studio's time zone. starts_on /
--                       ends_on bound it (a new term, a student who stops).
--                       A student can have more than one slot.
-- lesson_slot_changes   one-off changes to the schedule:
--                         cancel  one week's lesson is off (slot_id + on_date)
--                         move    one week's lesson moves to new_date/new_time
--                         extra   a one-off lesson with no regular slot
--                       on_date is the slot's own date for cancel/move; for an
--                       extra it is the lesson's date.
--
-- Until this runs, Downbeat falls back to each student's "Lesson day" and
-- "Lesson time" fields.
--
-- Safe to run more than once.

create table if not exists public.lesson_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  minutes smallint not null default 30 check (minutes between 5 and 240),
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create index if not exists lesson_slots_teacher_idx on public.lesson_slots (teacher_id, weekday, start_time);

create table if not exists public.lesson_slot_changes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  slot_id uuid references public.lesson_slots(id) on delete cascade,
  kind text not null check (kind in ('cancel', 'move', 'extra')),
  on_date date not null,
  new_date date,
  new_time time,
  minutes smallint check (minutes between 5 and 240),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (kind <> 'move' or (slot_id is not null and new_date is not null and new_time is not null)),
  check (kind <> 'cancel' or slot_id is not null),
  check (kind <> 'extra' or new_time is not null)
);

create index if not exists lesson_slot_changes_teacher_idx on public.lesson_slot_changes (teacher_id, on_date);
create unique index if not exists lesson_slot_changes_one_per_week
  on public.lesson_slot_changes (slot_id, on_date) where slot_id is not null;

alter table public.lesson_slots enable row level security;
alter table public.lesson_slot_changes enable row level security;

drop policy if exists "teacher manages lesson slots" on public.lesson_slots;
create policy "teacher manages lesson slots" on public.lesson_slots for all
  using (teacher_id = public.my_teacher_id() and public.teaches_student(student_id))
  with check (teacher_id = public.my_teacher_id() and public.teaches_student(student_id));

drop policy if exists "parent reads lesson slots" on public.lesson_slots;
create policy "parent reads lesson slots" on public.lesson_slots for select
  using (public.parents_student(student_id));

drop policy if exists "teacher manages lesson slot changes" on public.lesson_slot_changes;
create policy "teacher manages lesson slot changes" on public.lesson_slot_changes for all
  using (teacher_id = public.my_teacher_id() and public.teaches_student(student_id))
  with check (teacher_id = public.my_teacher_id() and public.teaches_student(student_id));

drop policy if exists "parent reads lesson slot changes" on public.lesson_slot_changes;
create policy "parent reads lesson slot changes" on public.lesson_slot_changes for select
  using (public.parents_student(student_id));

grant select, insert, update, delete on public.lesson_slots to authenticated;
grant select, insert, update, delete on public.lesson_slot_changes to authenticated;

-- Start everyone off from the "Lesson day" / "Lesson time" already on each
-- student (e.g. "Tuesday", "4:30 PM"), 30 minutes long. Only for students
-- with no slot yet, so running this again adds nothing.
insert into public.lesson_slots (teacher_id, student_id, weekday, start_time, minutes)
select s.teacher_id, s.id, d.weekday, t.start_time, 30
from public.students s
cross join lateral (
  select case left(lower(trim(s.lesson_day)), 3)
    when 'sun' then 0 when 'mon' then 1 when 'tue' then 2 when 'wed' then 3
    when 'thu' then 4 when 'fri' then 5 when 'sat' then 6 end as weekday
) d
cross join lateral (
  select m[1]::int as h, coalesce(m[2], '0')::int as mi, m[3] as ap
  from (select regexp_match(lower(trim(coalesce(s.lesson_time, ''))), '^(\d{1,2})(?::(\d{2}))?\s*(a|p)?') as m) x
) p
cross join lateral (
  select make_time(
    case
      when p.ap = 'p' and p.h < 12 then p.h + 12
      when p.ap = 'a' and p.h = 12 then 0
      when p.ap is null and p.h between 1 and 7 then p.h + 12
      else p.h % 24
    end, p.mi, 0) as start_time
) t
where s.active
  and d.weekday is not null
  and p.h is not null
  and not exists (select 1 from public.lesson_slots ls where ls.student_id = s.id);
