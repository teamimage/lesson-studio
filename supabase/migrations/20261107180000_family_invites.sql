-- Family accounts and invites.
--
-- The teacher invites a student's family from the student page. The invite
-- is a private link (/join/<token>) the teacher copies, texts or emails. The
-- parent opens it, signs in with their own email, and taps Join: that links
-- their account to that one student. From then on they see only the family
-- side (Home practice for their own children) and none of the teacher pages.
--
-- Families still get in the old way too: a parent whose email the teacher
-- typed on the student is matched by email when they sign in.
--
-- family_invites  one row per invite link
--   status  'pending'   link works (until expires_at)
--           'accepted'  used once; accepted_parent_id is the parent it linked
--           'revoked'   the teacher cancelled it (and removed the access it gave)
--
-- Invite links work once. A second parent gets their own invite.
--
-- join_email: the email the parent typed on the invite page. When that
-- person signs in (by code, or by the emailed link on any device), the
-- invite is finished for them automatically, so they never land on the
-- teacher side by mistake.
--
-- Safe to run more than once.

create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  token text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  name text not null default '',
  email text not null default '',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_email text,
  accepted_parent_id uuid references public.parents(id) on delete set null,
  revoked_at timestamptz,
  join_email text
);
alter table public.family_invites add column if not exists join_email text;
create index if not exists family_invites_student on public.family_invites (student_id, created_at desc);

alter table public.family_invites enable row level security;

-- Only the student's teacher sees and manages invites. Families never read
-- this table; they go through the two functions below.
drop policy if exists "teacher manages family invites" on public.family_invites;
create policy "teacher manages family invites" on public.family_invites for all
  using (teacher_id = public.my_teacher_id() and public.teaches_student(student_id))
  with check (teacher_id = public.my_teacher_id() and public.teaches_student(student_id));

-- What the invite page may show before anyone signs in: the child's first
-- name and the studio, nothing else.
create or replace function public.family_invite_preview(p_token text)
returns table (student_first_name text, instrument text, teacher_name text, state text)
language sql stable security definer set search_path = public as $$
  select
    split_part(s.name, ' ', 1),
    s.instrument,
    coalesce(nullif(t.name, ''), nullif(t.studio_name, ''), 'your teacher'),
    case
      when i.status = 'pending' and i.expires_at < now() then 'expired'
      else i.status
    end
  from public.family_invites i
  join public.students s on s.id = i.student_id
  join public.teachers t on t.id = i.teacher_id
  where i.token = p_token
$$;

-- The signed-in user accepts an invite: finds or makes their parent row for
-- that teacher, claims it, links it to the student, and uses up the invite.
-- Returns the student id. Errors: 'signin', 'invalid', 'used', 'revoked', 'expired'.
create or replace function public.accept_family_invite(p_token text, p_name text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.family_invites;
  uid uuid := auth.uid();
  mail text := lower(coalesce(auth.email(), ''));
  pid uuid;
begin
  if uid is null then raise exception 'signin'; end if;

  select * into inv from public.family_invites where token = p_token for update;
  if not found then raise exception 'invalid'; end if;
  if inv.status = 'revoked' then raise exception 'revoked'; end if;
  if inv.status = 'accepted' then
    -- Opening your own link again is fine.
    if inv.accepted_by = uid then return inv.student_id; end if;
    raise exception 'used';
  end if;
  if inv.expires_at < now() then raise exception 'expired'; end if;

  -- This user's parent row with this teacher, by account or by email.
  select id into pid from public.parents
  where teacher_id = inv.teacher_id and (user_id = uid or (mail <> '' and lower(email) = mail))
  order by (user_id = uid) desc nulls last
  limit 1;

  if pid is null then
    insert into public.parents (teacher_id, name, email, user_id)
    values (
      inv.teacher_id,
      coalesce(nullif(trim(p_name), ''), nullif(inv.name, ''), split_part(mail, '@', 1), 'Parent'),
      case when mail <> '' then mail else uid::text end,
      uid
    )
    returning id into pid;
  else
    update public.parents set user_id = uid where id = pid and user_id is null;
  end if;

  insert into public.student_parents (student_id, parent_id)
  values (inv.student_id, pid)
  on conflict do nothing;

  update public.family_invites
  set status = 'accepted', accepted_at = now(), accepted_by = uid,
      accepted_email = mail, accepted_parent_id = pid
  where id = inv.id;

  return inv.student_id;
end;
$$;

-- The invite page, before sign-in: remember which email is joining.
create or replace function public.family_invite_start(p_token text, p_email text)
returns boolean
language sql volatile security definer set search_path = public as $$
  with u as (
    update public.family_invites
    set join_email = lower(trim(p_email))
    where token = p_token and status = 'pending' and expires_at >= now()
      and position('@' in coalesce(p_email, '')) > 1
    returning 1
  )
  select exists (select 1 from u)
$$;

-- After sign-in: finish every open invite started with this user's email.
-- Returns how many were finished.
create or replace function public.accept_my_family_invites()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  mail text := lower(coalesce(auth.email(), ''));
  t text;
  n integer := 0;
begin
  if auth.uid() is null or mail = '' then return 0; end if;
  for t in
    select token from public.family_invites
    where status = 'pending' and expires_at >= now() and join_email = mail
  loop
    perform public.accept_family_invite(t, '');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Which side of the app this user belongs on: 'teacher' (has a teacher row),
-- 'family' (linked as a parent to at least one student), or null (neither
-- yet: a brand-new sign-up, who becomes a teacher on first visit).
create or replace function public.my_role()
returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.teachers where user_id = auth.uid()) then 'teacher'
    when exists (
      select 1 from public.student_parents sp
      where sp.parent_id in (select public.my_parent_ids())
    ) then 'family'
    else null
  end
$$;

revoke execute on function public.family_invite_preview(text) from public;
grant execute on function public.family_invite_preview(text) to anon, authenticated;
revoke execute on function public.accept_family_invite(text, text) from public, anon;
grant execute on function public.accept_family_invite(text, text) to authenticated;
revoke execute on function public.family_invite_start(text, text) from public;
grant execute on function public.family_invite_start(text, text) to anon, authenticated;
revoke execute on function public.accept_my_family_invites() from public, anon;
grant execute on function public.accept_my_family_invites() to authenticated;
revoke execute on function public.my_role() from public, anon;
grant execute on function public.my_role() to authenticated;

-- Families may read the names of their child's music (the practice page
-- links each assignment to the spot in the lesson video where it was
-- played). The music files themselves stay teacher-only in storage.
drop policy if exists "parent reads scores" on public.scores;
create policy "parent reads scores" on public.scores for select
  using (public.parents_student(student_id));
