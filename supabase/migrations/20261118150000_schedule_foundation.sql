-- Schedule foundation and calendar links (admin/schedule-foundation.sql).
--
-- teachers.time_zone            the teacher's own time zone (lesson times are
--                               clock times in this zone)
-- teachers.makeup_notice_hours  a family cancellation with at least this much
--                               notice earns a make-up lesson (default 24)
-- lesson_slots.every_weeks      1 = every week, 2 = every other week, counted
--                               from starts_on
-- lesson_slot_changes           new kind 'noshow'; cancelled_by (teacher,
--                               family, studio); makeup_owed; makeup_for (a
--                               one-off lesson that settles an owed make-up)
-- studio_closures               dates the studio is closed (holidays, breaks):
--                               every lesson in them is cancelled (closure_id
--                               on each cancellation)
-- calendar_feeds                secret calendar subscription links, one per
--                               person, that Google, Outlook, Apple and other
--                               calendars can subscribe to
-- calendar_feed(token)          what a link shows, readable without signing in
--                               (only with the secret token)
--
-- Safe to run more than once.

alter table public.teachers add column if not exists time_zone text not null default 'America/New_York';
alter table public.teachers add column if not exists makeup_notice_hours smallint not null default 24;
alter table public.teachers drop constraint if exists teachers_makeup_notice_hours_check;
alter table public.teachers add constraint teachers_makeup_notice_hours_check check (makeup_notice_hours between 0 and 336);

alter table public.lesson_slots add column if not exists every_weeks smallint not null default 1;
alter table public.lesson_slots drop constraint if exists lesson_slots_every_weeks_check;
alter table public.lesson_slots add constraint lesson_slots_every_weeks_check check (every_weeks between 1 and 4);

alter table public.lesson_slot_changes drop constraint if exists lesson_slot_changes_kind_check;
alter table public.lesson_slot_changes add constraint lesson_slot_changes_kind_check
  check (kind in ('cancel', 'move', 'extra', 'noshow'));
alter table public.lesson_slot_changes drop constraint if exists lesson_slot_changes_noshow_check;
alter table public.lesson_slot_changes add constraint lesson_slot_changes_noshow_check
  check (kind <> 'noshow' or slot_id is not null);
alter table public.lesson_slot_changes add column if not exists cancelled_by text;
alter table public.lesson_slot_changes drop constraint if exists lesson_slot_changes_cancelled_by_check;
alter table public.lesson_slot_changes add constraint lesson_slot_changes_cancelled_by_check
  check (cancelled_by is null or cancelled_by in ('teacher', 'family', 'studio'));
alter table public.lesson_slot_changes add column if not exists makeup_owed boolean not null default false;
alter table public.lesson_slot_changes add column if not exists makeup_for uuid
  references public.lesson_slot_changes(id) on delete set null;

-- Cancellations made before this file: the teacher made them.
update public.lesson_slot_changes set cancelled_by = 'teacher' where kind = 'cancel' and cancelled_by is null;

create table if not exists public.studio_closures (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  note text not null default '',
  makeup_owed boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists studio_closures_teacher_idx on public.studio_closures (teacher_id, starts_on);
alter table public.studio_closures enable row level security;

drop policy if exists "teacher manages studio closures" on public.studio_closures;
create policy "teacher manages studio closures" on public.studio_closures for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());

drop policy if exists "parent reads studio closures" on public.studio_closures;
create policy "parent reads studio closures" on public.studio_closures for select
  using (exists (
    select 1 from public.students s
    where s.teacher_id = studio_closures.teacher_id and public.parents_student(s.id)
  ));

grant select, insert, update, delete on public.studio_closures to authenticated;

-- A studio closure's cancellations point back to it, so removing the closure
-- brings those lessons back.
alter table public.lesson_slot_changes add column if not exists closure_id uuid
  references public.studio_closures(id) on delete cascade;

create table if not exists public.calendar_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('teacher', 'family')),
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  last_read_at timestamptz,
  revoked_at timestamptz
);
create index if not exists calendar_feeds_user_idx on public.calendar_feeds (user_id);
alter table public.calendar_feeds enable row level security;

drop policy if exists "own calendar feeds" on public.calendar_feeds;
create policy "own calendar feeds" on public.calendar_feeds for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.calendar_feeds to authenticated;

-- What a calendar link shows: the lessons of the teacher's active students, or
-- of the family's children, from 60 days back. No notes, grades or contact
-- details. Readable by anyone holding the token, the way calendar
-- subscriptions work; a reset link stops working at once.
create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f public.calendar_feeds;
  ids uuid[];
  since date := (now() at time zone 'utc')::date - 60;
begin
  select * into f from public.calendar_feeds where token = p_token and revoked_at is null;
  if not found then return null; end if;

  if f.kind = 'teacher' then
    select coalesce(array_agg(s.id), '{}') into ids
    from public.students s join public.teachers t on t.id = s.teacher_id
    where t.user_id = f.user_id and s.active;
  else
    select coalesce(array_agg(distinct sp.student_id), '{}') into ids
    from public.student_parents sp
    join public.parents p on p.id = sp.parent_id
    join public.students s on s.id = sp.student_id
    left join auth.users u on u.id = f.user_id
    where s.active
      and (p.user_id = f.user_id or (u.email is not null and lower(p.email) = lower(u.email)));
  end if;

  update public.calendar_feeds set last_read_at = now() where id = f.id;

  return jsonb_build_object(
    'kind', f.kind,
    'students', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'instrument', s.instrument, 'teacher_id', s.teacher_id,
        'lesson_day', s.lesson_day, 'lesson_time', s.lesson_time))
      from public.students s where s.id = any(ids)), '[]'::jsonb),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'studio_name', t.studio_name, 'time_zone', t.time_zone))
      from public.teachers t where t.id in (select s.teacher_id from public.students s where s.id = any(ids))), '[]'::jsonb),
    'slots', coalesce((
      select jsonb_agg(to_jsonb(ls)) from public.lesson_slots ls
      where ls.student_id = any(ids) and (ls.ends_on is null or ls.ends_on >= since)), '[]'::jsonb),
    'changes', coalesce((
      select jsonb_agg(to_jsonb(c)) from public.lesson_slot_changes c
      where c.student_id = any(ids) and (c.on_date >= since or c.new_date >= since)), '[]'::jsonb),
    'closures', coalesce((
      select jsonb_agg(to_jsonb(sc)) from public.studio_closures sc
      where sc.ends_on >= since
        and sc.teacher_id in (select s.teacher_id from public.students s where s.id = any(ids))), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
