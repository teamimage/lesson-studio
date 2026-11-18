-- Each student's usual lesson length, in minutes. Add lesson on a calendar
-- fills it in and blocks that much time. Empty means "use the length of the
-- student's regular lesson, else 30".
alter table public.students
  add column if not exists lesson_minutes integer
  check (lesson_minutes is null or lesson_minutes between 5 and 240);

-- Start every student off with the length of their current regular lesson.
update public.students s
set lesson_minutes = sl.minutes
from (
  select distinct on (student_id) student_id, minutes
  from public.lesson_slots
  where ends_on is null or ends_on >= current_date
  order by student_id, created_at desc
) sl
where sl.student_id = s.id and s.lesson_minutes is null;
