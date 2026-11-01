-- Sheet music: keep the original uploaded file, and let Claude read it.
--
-- scores.source_*   the file exactly as uploaded (a PDF), stored next to the
--                   page images at {teacher}/{student}/{score}/.../original.pdf.
--                   Replace file swaps it (and the pages) for a new one;
--                   deleting the music deletes the original, every page image
--                   and the pieces found in it.
-- scores.analysis   what Claude found: the book/edition, and its pieces and
--                   movements with page ranges, matched to the student.
-- scores.title_auto true while the name came from the file or from Claude,
--                   so Claude's detected title can replace it. Renaming by
--                   hand sets it to false.
-- ai_usage          gets kind 'music' and a score_id, so reading sheet music
--                   shows up under Settings -> AI costs.

alter table public.scores
  add column if not exists source_path text,
  add column if not exists source_name text,
  add column if not exists source_size bigint,
  add column if not exists title_auto boolean not null default false,
  add column if not exists analysis jsonb,
  add column if not exists analysis_status text not null default 'none',
  add column if not exists analysis_error text,
  add column if not exists analysis_at timestamptz;

alter table public.scores drop constraint if exists scores_analysis_status_check;
alter table public.scores add constraint scores_analysis_status_check
  check (analysis_status in ('none', 'running', 'done', 'error'));

alter table public.scores drop constraint if exists scores_kind_check;
alter table public.scores add constraint scores_kind_check
  check (kind in ('book', 'piece', 'exercise', 'scale', 'etude', 'other'));

alter table public.ai_usage
  add column if not exists score_id uuid references public.scores(id) on delete set null;
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('transcription', 'draft', 'music'));

-- PDFs can now go in the music bucket (the original file), up to 500 MB.
update storage.buckets
  set file_size_limit = 524288000,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  where id = 'lesson-scores';
