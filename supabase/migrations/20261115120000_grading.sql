-- Grading systems and standards (Settings, Grading).
-- teachers.grading: the studio default {system, standard, definitions}.
-- students.grading: the resolved settings for that student, plus
-- follows_studio. Families can read their student's row, so the grade key
-- and reviews started from a family phone use the teacher's settings.
alter table public.teachers add column if not exists grading jsonb;
alter table public.students add column if not exists grading jsonb;
