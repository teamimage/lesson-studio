-- Lesson length from the video (Nov 2026).
-- Records where a lesson's length came from, so a length the teacher typed
-- is never replaced by the video's length.
--   manual    typed by the teacher
--   video     the lesson's videos
--   timer     Start lesson to End lesson
--   schedule  carried over from the last lesson or the lesson slot
--   practice  the practice recording the lesson was converted from
alter table public.lessons add column if not exists duration_source text;

do $$ begin
  alter table public.lessons add constraint lessons_duration_source_check
    check (duration_source is null or duration_source in ('manual', 'video', 'timer', 'schedule', 'practice'));
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
