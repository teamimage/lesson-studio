-- Admin backend. Admins (listed in app_admins) can read and change every
-- row, but only on requests that carry the header `x-lesson-admin: 1`,
-- which only the /admin pages send. Ordinary pages keep relying on RLS to
-- show a teacher just their own studio, so an admin's normal views stay clean.

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
create policy "admin reads own row" on public.app_admins for select to authenticated
  using (user_id = auth.uid());

-- David's account is the first admin.
insert into public.app_admins (user_id)
select id from auth.users where lower(email) = 'teamimageinc@gmail.com'
on conflict do nothing;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

create or replace function public.admin_mode() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_app_admin()
    and coalesce(nullif(current_setting('request.headers', true), '')::json ->> 'x-lesson-admin', '') = '1';
$$;

do $$
declare t text;
begin
  foreach t in array array['teachers','students','parents','student_parents','repertoire','lessons',
                           'lesson_pieces','assignments','practice_logs','recordings','scores','stand_events']
  loop
    execute format(
      'create policy "admin manages all" on public.%I for all to authenticated using (public.admin_mode()) with check (public.admin_mode())', t);
  end loop;
end $$;

-- Storage: admins may read and delete any lesson video or score page
-- (needed to clean up files when deleting a student or recording).
create policy "admin reads lesson files" on storage.objects for select to authenticated
  using (bucket_id in ('lesson-recordings', 'lesson-scores') and public.is_app_admin());
create policy "admin deletes lesson files" on storage.objects for delete to authenticated
  using (bucket_id in ('lesson-recordings', 'lesson-scores') and public.is_app_admin());

-- Sign-in accounts (auth.users) for the admin list.
create or replace function public.admin_list_users()
returns table (id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select u.id, u.email::text, u.created_at, u.last_sign_in_at
  from auth.users u
  where public.is_app_admin()
  order by u.created_at;
$$;

-- Delete a sign-in account (and, by cascade, its teacher row and studio).
create or replace function public.admin_delete_user(uid uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_app_admin() then raise exception 'not allowed'; end if;
  if uid = auth.uid() then raise exception 'cannot delete your own account'; end if;
  delete from auth.users where id = uid;
end $$;

-- Make another account a teacher (gives it an empty studio).
create or replace function public.admin_make_teacher(uid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if not public.is_app_admin() then raise exception 'not allowed'; end if;
  insert into public.teachers (user_id) values (uid)
  on conflict (user_id) do update set user_id = excluded.user_id
  returning id into tid;
  return tid;
end $$;

revoke execute on function public.admin_list_users() from anon, public;
revoke execute on function public.admin_delete_user(uuid) from anon, public;
revoke execute on function public.admin_make_teacher(uuid) from anon, public;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_make_teacher(uuid) to authenticated;
