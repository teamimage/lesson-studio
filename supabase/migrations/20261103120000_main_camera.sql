-- Multi-angle lessons: which video is the main camera (the one with the
-- good microphone). Its sound plays on every angle and its transcript makes
-- the AI notes. Null means "the first video uploaded".
alter table public.lessons
  add column if not exists main_recording_id uuid
  references public.recordings(id) on delete set null;
