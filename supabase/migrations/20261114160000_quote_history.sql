-- Daily inspirational quote on Downbeat (Nov 2026).
-- One row per user per day: which quote they were shown, and their thumbs
-- up (1) or down (-1), if any. The quotes themselves live in the app
-- (src/lib/quotes.ts), a fixed checked list; this table is the history the
-- daily pick learns from. Safe to run more than once.

create table if not exists public.quote_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shown_on date not null,
  quote_id text not null,
  vote smallint check (vote in (-1, 1)),
  voted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, shown_on)
);
create index if not exists quote_history_user on public.quote_history (user_id, shown_on desc);

alter table public.quote_history enable row level security;

drop policy if exists "own quote history" on public.quote_history;
create policy "own quote history" on public.quote_history for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
