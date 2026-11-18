-- Joining practice recordings from the same day (Nov 18 2026).
-- The joined session keeps the original sessions here (rows exactly as they
-- were, and where each part starts on the joined timeline), so "Split back"
-- can restore them without new reviews.
alter table public.practice_sessions add column if not exists merged_from jsonb;
