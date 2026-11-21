-- Pending lesson days for the family's practice calendar.
--
-- Families can only read a lesson once the teacher approves it. Between the
-- lesson and the approval, the family's calendar still shows that a lesson
-- happened that day and that its write-up is on the way. This function gives
-- them just the dates (and whether the video is still being processed),
-- nothing from the lesson itself, and only for students they are a parent
-- or guardian of. Safe to run more than once.

create or replace function public.pending_lesson_days(p_student uuid, p_from date, p_to date)
returns table (lesson_date date, processing boolean)
language sql stable security definer set search_path = public as $$
  select l.lesson_date,
         bool_or(
           exists (select 1 from public.recordings r where r.lesson_id = l.id and r.status = 'uploading')
           or exists (
             select 1 from public.lesson_transcripts t
             where t.lesson_id = l.id and t.status in ('transcribing', 'drafting')
           )
         ) as processing
  from public.lessons l
  where l.student_id = p_student
    and l.status = 'draft'
    and l.lesson_date between p_from and p_to
    and l.lesson_date <= current_date
    and public.parents_student(p_student)
  group by l.lesson_date
$$;

revoke execute on function public.pending_lesson_days(uuid, date, date) from public, anon;
grant execute on function public.pending_lesson_days(uuid, date, date) to authenticated;
