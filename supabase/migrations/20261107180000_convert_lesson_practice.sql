-- Switching a recording between lesson and practice (Nov 2026).
-- A practice switched to a lesson brings its transcript but no video (home
-- practice recordings are deleted once reviewed), so a lesson transcript
-- can now exist without a recording.
alter table public.lesson_transcripts alter column recording_id drop not null;
