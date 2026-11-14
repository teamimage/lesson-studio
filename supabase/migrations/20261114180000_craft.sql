-- Craft: the teacher's own improvement section (Nov 2026).
-- craft_runs      one row per Focus program a teacher starts (7 days by
--                 default; "keep going" adds 7). ended_on is set when they
--                 finish or stop it. Only one running program at a time.
-- craft_checkins  the one-tap "Did you try it?" answer for each day.
-- The programs and articles themselves live in the app (src/lib/craft/),
-- and the numbers are read from lesson transcripts, so nothing else is
-- stored. Teacher-only. Safe to run more than once.

create table if not exists public.craft_runs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  program text not null,
  started_on date not null,
  length_days smallint not null default 7 check (length_days between 1 and 63),
  ended_on date,
  created_at timestamptz not null default now()
);
create index if not exists craft_runs_teacher on public.craft_runs (teacher_id, started_on desc);
create unique index if not exists craft_runs_one_running on public.craft_runs (teacher_id) where ended_on is null;

create table if not exists public.craft_checkins (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.craft_runs(id) on delete cascade,
  day smallint not null check (day between 1 and 63),
  answer text not null check (answer in ('yes', 'partly', 'no')),
  created_at timestamptz not null default now(),
  unique (run_id, day)
);

alter table public.craft_runs enable row level security;
alter table public.craft_checkins enable row level security;

drop policy if exists "teacher manages own craft runs" on public.craft_runs;
create policy "teacher manages own craft runs" on public.craft_runs for all
  using (teacher_id in (select id from public.teachers where user_id = auth.uid()))
  with check (teacher_id in (select id from public.teachers where user_id = auth.uid()));

drop policy if exists "teacher manages own craft checkins" on public.craft_checkins;
create policy "teacher manages own craft checkins" on public.craft_checkins for all
  using (run_id in (select r.id from public.craft_runs r join public.teachers t on t.id = r.teacher_id where t.user_id = auth.uid()))
  with check (run_id in (select r.id from public.craft_runs r join public.teachers t on t.id = r.teacher_id where t.user_id = auth.uid()));

notify pgrst, 'reload schema';
