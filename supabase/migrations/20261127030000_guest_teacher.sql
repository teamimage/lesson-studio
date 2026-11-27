-- A guest instructor for one lesson: a name typed in when someone other than
-- the student's regular teacher taught it (not a teacher account). Empty
-- means the regular teacher taught. Shown on the lesson page, the lesson
-- sheet and the family's practice plan; the AI draft names the guest, and
-- guest lessons stay out of the regular teacher's own lesson numbers.
alter table public.lessons
  add column if not exists guest_teacher text
  check (guest_teacher is null or char_length(guest_teacher) between 1 and 80);
