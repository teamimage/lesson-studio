-- Parent PIN for changing practice records (Nov 15 2026).
-- A parent (or the teacher) sets a PIN per student; while it is set, a
-- practice day can only be changed after the PIN is entered, so a child on
-- the family's login or in Family mode can't tick work off themselves.
-- The PIN is stored hashed (bcrypt) and only these functions touch it.
-- Five wrong tries lock it for 15 minutes. The teacher can always reset it.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.student_pins (
  student_id uuid primary key references public.students(id) on delete cascade,
  pin_hash text not null,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.student_pins enable row level security;
revoke all on public.student_pins from anon, authenticated;

-- Is a PIN set for this student? (Teacher or the student's family only.)
create or replace function public.practice_pin_set(p_student uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select (public.teaches_student(p_student) or public.parents_student(p_student))
     and exists (select 1 from public.student_pins where student_id = p_student)
$$;

-- 'ok' (right PIN, or none set), 'wrong', 'locked' or 'denied'.
create or replace function public.check_practice_pin(p_student uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r public.student_pins;
begin
  if not (public.teaches_student(p_student) or public.parents_student(p_student)) then return 'denied'; end if;
  select * into r from public.student_pins where student_id = p_student;
  if not found then return 'ok'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update public.student_pins set failed_count = 0, locked_until = null where student_id = p_student;
    return 'ok';
  end if;
  update public.student_pins
     set failed_count = r.failed_count + 1,
         locked_until = case when r.failed_count + 1 >= 5 then now() + interval '15 minutes' else null end
   where student_id = p_student;
  return case when r.failed_count + 1 >= 5 then 'locked' else 'wrong' end;
end $$;

-- Sets (p_pin = 4 to 8 digits) or removes (p_pin empty) the PIN.
-- A parent changing or removing an existing PIN gives the current one;
-- the teacher doesn't need it (that is the reset for a forgotten PIN).
-- Returns 'ok', 'bad' (not 4-8 digits), 'wrong', 'locked' or 'denied'.
create or replace function public.set_practice_pin(p_student uuid, p_pin text, p_current text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare is_teacher boolean := public.teaches_student(p_student);
declare checked text;
begin
  if not (is_teacher or public.parents_student(p_student)) then return 'denied'; end if;
  if coalesce(p_pin, '') <> '' and p_pin !~ '^[0-9]{4,8}$' then return 'bad'; end if;
  if not is_teacher then
    checked := public.check_practice_pin(p_student, p_current);
    if checked <> 'ok' then return checked; end if;
  end if;
  if coalesce(p_pin, '') = '' then
    delete from public.student_pins where student_id = p_student;
  else
    insert into public.student_pins (student_id, pin_hash, updated_by)
    values (p_student, crypt(p_pin, gen_salt('bf')), auth.uid())
    on conflict (student_id) do update
      set pin_hash = excluded.pin_hash, failed_count = 0, locked_until = null,
          updated_at = now(), updated_by = auth.uid();
  end if;
  return 'ok';
end $$;

revoke all on function public.practice_pin_set(uuid) from public, anon;
revoke all on function public.check_practice_pin(uuid, text) from public, anon;
revoke all on function public.set_practice_pin(uuid, text, text) from public, anon;
grant execute on function public.practice_pin_set(uuid) to authenticated;
grant execute on function public.check_practice_pin(uuid, text) to authenticated;
grant execute on function public.set_practice_pin(uuid, text, text) to authenticated;
