-- The melody of each uploaded piece, written out once by Claude as note
-- names bar by bar, so practice sessions can be matched against the
-- student's own music in plain code ("Gavotte, bars 1-24").
--
-- scores.melody = { "v": 1, "sections": { "<start_page>:<title>": {
--   "title", "display", "start_page", "end_page", "status": "done"|"error",
--   "key_signature", "time_signature", "bars": [{ "bar", "page", "notes" }] } } }
--
-- Safe to run more than once.

alter table public.scores
  add column if not exists melody jsonb;
