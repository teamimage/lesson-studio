-- Families, and more than one parent or guardian per family.
--
-- A family groups a teacher's students who live together (James and Ephram
-- are the Kahn family). Parents and guardians belong to a family and see
-- either the whole family or only the children ticked for them. Access to a
-- child's Home practice is still decided by student_parents, as before; this
-- only keeps those links in step with the family.
--
-- families              one row per family, the teacher's own (teacher-only)
-- students.family_id    which family a student is in (empty: none yet)
-- parents.family_id     which family a parent or guardian belongs to
-- parents.whole_family  true: linked to every child in the family, now and
--                       any added later. false: only the children the
--                       teacher ticked (their student_parents rows).
-- parents.relationship  e.g. Mother, Father, Grandparent, Guardian, Nanny
-- family_invites.parent_id  an invite made for one named parent or guardian
--                       (from the Families page). Accepting it signs that
--                       person in as that parent row, with the access the
--                       teacher already set. Older invites (no parent_id)
--                       work as before: they link the one student.
--
-- First run: every student without a family is put in one, grouped by last
-- name ("James Kahn" and "Ephram Kahn" become the Kahn family), and each
-- parent joins the family of the child they're linked to. A parent linked to
-- every child in it gets whole-family access; otherwise they keep exactly
-- the children they had. Nobody gains or loses access on the first run.
--
-- Safe to run more than once.

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists families_teacher on public.families (teacher_id);

alter table public.students add column if not exists family_id uuid references public.families(id) on delete set null;
alter table public.parents add column if not exists family_id uuid references public.families(id) on delete set null;
alter table public.parents add column if not exists whole_family boolean not null default true;
alter table public.parents add column if not exists relationship text not null default '';
alter table public.family_invites add column if not exists parent_id uuid references public.parents(id) on delete cascade;
create index if not exists students_family on public.students (family_id);
create index if not exists parents_family on public.parents (family_id);

alter table public.families enable row level security;
drop policy if exists "teacher manages families" on public.families;
create policy "teacher manages families" on public.families for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());
drop policy if exists "admin manages all" on public.families;
create policy "admin manages all" on public.families for all to authenticated
  using (public.admin_mode()) with check (public.admin_mode());

-- A student joining a family is linked to its whole-family parents; leaving
-- one unlinks them. Parents with chosen children are left as they are.
create or replace function public.student_family_links()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.family_id is not null and old.family_id is distinct from new.family_id then
    delete from public.student_parents sp
    using public.parents p
    where sp.student_id = new.id and sp.parent_id = p.id
      and p.family_id = old.family_id and p.whole_family;
  end if;
  if new.family_id is not null then
    insert into public.student_parents (student_id, parent_id)
    select new.id, p.id from public.parents p
    where p.family_id = new.family_id and p.whole_family
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists student_family_links on public.students;
create trigger student_family_links after insert or update of family_id on public.students
  for each row execute function public.student_family_links();

-- A whole-family parent is linked to every child in their family.
create or replace function public.parent_family_links()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.family_id is not null and new.whole_family then
    insert into public.student_parents (student_id, parent_id)
    select s.id, new.id from public.students s
    where s.family_id = new.family_id
    on conflict do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists parent_family_links on public.parents;
create trigger parent_family_links after insert or update of family_id, whole_family on public.parents
  for each row execute function public.parent_family_links();

-- First run: a family per last name, for students who have none.
do $$
declare
  r record;
  fid uuid;
begin
  for r in
    select teacher_id,
           coalesce(nullif(regexp_replace(trim(name), '^.*\s', ''), ''), trim(name)) as last
    from public.students
    where family_id is null
    group by 1, 2
  loop
    select id into fid from public.families
    where teacher_id = r.teacher_id and lower(name) = lower(r.last || ' family')
    limit 1;
    if fid is null then
      insert into public.families (teacher_id, name) values (r.teacher_id, r.last || ' family')
      returning id into fid;
    end if;
    update public.students
    set family_id = fid
    where teacher_id = r.teacher_id and family_id is null
      and coalesce(nullif(regexp_replace(trim(name), '^.*\s', ''), ''), trim(name)) = r.last;
  end loop;

  -- Each parent without a family joins the family of their linked children
  -- (the one with most of them). Whole family only if linked to all of it.
  update public.parents p
  set family_id = x.family_id,
      whole_family = x.linked = (select count(*) from public.students s2 where s2.family_id = x.family_id)
  from (
    select distinct on (sp.parent_id) sp.parent_id, s.family_id, count(*) as linked
    from public.student_parents sp
    join public.students s on s.id = sp.student_id
    where s.family_id is not null
    group by sp.parent_id, s.family_id
    order by sp.parent_id, count(*) desc
  ) x
  where p.id = x.parent_id and p.family_id is null;
end;
$$;

-- What the invite page may show before anyone signs in: the children's first
-- names and the studio. An invite for a named parent lists every child they
-- will see.
create or replace function public.family_invite_preview(p_token text)
returns table (student_first_name text, instrument text, teacher_name text, state text)
language sql stable security definer set search_path = public as $$
  select
    coalesce(
      (select string_agg(split_part(s2.name, ' ', 1), ' and ' order by s2.name)
       from public.student_parents sp join public.students s2 on s2.id = sp.student_id
       where i.parent_id is not null and sp.parent_id = i.parent_id),
      split_part(s.name, ' ', 1)
    ),
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

-- The signed-in user accepts an invite. For an invite made for a named parent
-- or guardian, they become that parent row (keeping the access the teacher
-- set). Otherwise, as before: find or make their parent row for that teacher
-- and link it to the student. Returns the student id to open.
-- Errors: 'signin', 'invalid', 'used', 'revoked', 'expired'.
create or replace function public.accept_family_invite(p_token text, p_name text default '')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.family_invites;
  uid uuid := auth.uid();
  mail text := lower(coalesce(auth.email(), ''));
  pid uuid;
  owner uuid;
  first_student uuid;
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

  if inv.parent_id is not null then
    select user_id into owner from public.parents where id = inv.parent_id for update;
    if not found then raise exception 'invalid'; end if;
    if owner is not null and owner <> uid then raise exception 'used'; end if;
    pid := inv.parent_id;
    update public.parents
    set user_id = uid,
        name = coalesce(nullif(trim(name), ''), nullif(trim(p_name), ''), split_part(mail, '@', 1), 'Parent'),
        -- Keep the email the teacher typed; fill it in if they left it out
        -- (a placeholder with no @ until now).
        email = case
          when position('@' in coalesce(email, '')) = 0 and mail <> ''
            and not exists (select 1 from public.parents o where o.teacher_id = inv.teacher_id and lower(o.email) = mail and o.id <> pid)
          then mail else email end
    where id = pid;
    -- Open their first child; make sure they have at least the invite's one.
    select sp.student_id into first_student
    from public.student_parents sp join public.students s on s.id = sp.student_id
    where sp.parent_id = pid order by s.name limit 1;
    if first_student is null then
      insert into public.student_parents (student_id, parent_id) values (inv.student_id, pid)
      on conflict do nothing;
      first_student := inv.student_id;
    end if;
  else
    -- This user's parent row with this teacher, by account or by email.
    select id into pid from public.parents
    where teacher_id = inv.teacher_id and (user_id = uid or (mail <> '' and lower(email) = mail))
    order by (user_id = uid) desc nulls last
    limit 1;

    if pid is null then
      insert into public.parents (teacher_id, name, email, user_id, family_id, whole_family)
      values (
        inv.teacher_id,
        coalesce(nullif(trim(p_name), ''), nullif(inv.name, ''), split_part(mail, '@', 1), 'Parent'),
        case when mail <> '' then mail else uid::text end,
        uid,
        (select family_id from public.students where id = inv.student_id),
        false
      )
      returning id into pid;
    else
      update public.parents set user_id = uid where id = pid and user_id is null;
    end if;

    insert into public.student_parents (student_id, parent_id)
    values (inv.student_id, pid)
    on conflict do nothing;
    first_student := inv.student_id;
  end if;

  update public.family_invites
  set status = 'accepted', accepted_at = now(), accepted_by = uid,
      accepted_email = mail, accepted_parent_id = pid
  where id = inv.id;

  return first_student;
end;
$$;

revoke execute on function public.family_invite_preview(text) from public;
grant execute on function public.family_invite_preview(text) to anon, authenticated;
revoke execute on function public.accept_family_invite(text, text) from public, anon;
grant execute on function public.accept_family_invite(text, text) to authenticated;
revoke execute on function public.student_family_links() from public, anon, authenticated;
revoke execute on function public.parent_family_links() from public, anon, authenticated;
