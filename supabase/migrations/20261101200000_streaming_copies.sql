-- Streaming copies of lesson videos (Cloudflare Stream).
-- The original file stays in the private "lesson-recordings" bucket as the
-- master (the AI transcript and downloads use it). Cloudflare makes a
-- compressed, adaptive (HLS) copy that starts playing in a second or two.
--   stream_uid      Cloudflare Stream video id
--   stream_status   null = not started, 'pending' = Cloudflare is preparing it,
--                   'ready' = plays from Cloudflare, 'error' = failed (original still plays)
--   stream_hls_url  manifest address Cloudflare gave us; the video id in it is
--                   swapped for a short-lived signed token at play time

alter table public.recordings
  add column if not exists stream_uid text,
  add column if not exists stream_status text
    check (stream_status in ('pending', 'ready', 'error')),
  add column if not exists stream_hls_url text,
  add column if not exists stream_error text;
