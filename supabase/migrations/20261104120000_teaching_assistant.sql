-- Each teacher's own teaching assistant: a chat that interviews the teacher
-- about how they teach and keeps a teaching profile, which every AI review
-- and lesson draft then follows (their standards, not the app's).
--
-- teachers.review_tone        'encouraging' | 'balanced' | 'strict'
-- teachers.teaching_profile   { v, sections: { <id>: text }, answered: [question ids], updated_at }
-- teaching_assistant_messages the chat with the assistant, teacher-only
--
-- Safe to run more than once.

alter table public.teachers
  add column if not exists review_tone text not null default 'balanced',
  add column if not exists teaching_profile jsonb;

alter table public.teachers drop constraint if exists teachers_review_tone_check;
alter table public.teachers add constraint teachers_review_tone_check
  check (review_tone in ('encouraging', 'balanced', 'strict'));

-- Existing teachers (David) start on Strict.
update public.teachers set review_tone = 'strict'
  where review_tone = 'balanced' and teaching_profile is null;

create table if not exists public.teaching_assistant_messages (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists teaching_assistant_messages_teacher
  on public.teaching_assistant_messages (teacher_id, created_at);

alter table public.teaching_assistant_messages enable row level security;
drop policy if exists "teacher manages own assistant chat" on public.teaching_assistant_messages;
create policy "teacher manages own assistant chat" on public.teaching_assistant_messages for all
  using (teacher_id in (select id from public.teachers where user_id = auth.uid()))
  with check (teacher_id in (select id from public.teachers where user_id = auth.uid()));

-- The assistant's cost shows under Settings → AI costs.
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('transcription', 'draft', 'music', 'practice', 'weekly', 'assistant'));
