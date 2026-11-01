-- AI processing of lesson videos, and a log of every AI call with its cost.
--
-- lesson_transcripts: one row per processed recording. AssemblyAI pulls the
--   video from a signed storage link and transcribes the speech; Claude then
--   drafts the lesson record from the transcript. Teacher-only (parents never
--   see transcripts).
-- ai_usage: one row per paid AI call (a transcription or a Claude request),
--   with tokens/seconds and the dollar cost worked out at the time. Rows keep
--   their cost after a lesson is deleted (lesson_id is set to null).

create table public.lesson_transcripts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  recording_id uuid not null unique references public.recordings(id) on delete cascade,
  status text not null default 'transcribing'
    check (status in ('transcribing', 'drafting', 'done', 'error')),
  provider_job_id text,
  audio_seconds numeric,
  transcript text,
  draft jsonb,                 -- what Claude wrote, kept even if the lesson is edited later
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lesson_transcripts_lesson_idx on public.lesson_transcripts(lesson_id, created_at desc);

alter table public.lesson_transcripts enable row level security;
create policy "teacher manages transcripts" on public.lesson_transcripts for all
  using (teacher_id = public.my_teacher_id())
  with check (
    teacher_id = public.my_teacher_id()
    and exists (select 1 from public.lessons l where l.id = lesson_id and l.teacher_id = public.my_teacher_id())
  );
grant all on public.lesson_transcripts to authenticated;

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete set null,
  recording_id uuid references public.recordings(id) on delete set null,
  kind text not null check (kind in ('transcription', 'draft')),
  provider text not null,      -- 'assemblyai' | 'anthropic'
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  audio_seconds numeric not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_teacher_idx on public.ai_usage(teacher_id, created_at desc);
create index ai_usage_lesson_idx on public.ai_usage(lesson_id);

alter table public.ai_usage enable row level security;
create policy "teacher reads own ai usage" on public.ai_usage for select
  using (teacher_id = public.my_teacher_id() or public.is_app_admin());
create policy "teacher logs own ai usage" on public.ai_usage for insert
  with check (teacher_id = public.my_teacher_id());
grant select, insert on public.ai_usage to authenticated;
