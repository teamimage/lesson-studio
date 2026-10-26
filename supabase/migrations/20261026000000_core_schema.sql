-- Lesson Studio core schema: teachers, students, parents, lessons,
-- lesson records (pieces + assignments), repertoire and practice logs.
-- Every table has row-level security. A teacher sees their own students;
-- a parent sees the children linked to them, and only approved lessons.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- people

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default '',
  studio_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  name text not null,
  instrument text not null,              -- piano, cello, ...
  age int,
  method text not null default 'Suzuki',
  current_book text,                     -- e.g. "Suzuki Cello Book 1"
  goals text,
  notes text,                            -- private teacher notes
  lesson_day text,                       -- e.g. "Tuesday"
  lesson_time text,                      -- e.g. "4:30 PM"
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index students_teacher_idx on public.students(teacher_id);

create table public.parents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  name text not null,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  supervises_practice boolean not null default true,
  created_at timestamptz not null default now(),
  unique (teacher_id, email)
);
create index parents_email_idx on public.parents(lower(email));

create table public.student_parents (
  student_id uuid not null references public.students(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  primary key (student_id, parent_id)
);

-- ------------------------------------------------------------ repertoire

create type public.repertoire_status as enum
  ('preview', 'learning', 'polishing', 'review', 'performed');

create table public.repertoire (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  title text not null,
  book text,
  status public.repertoire_status not null default 'learning',
  started_on date default current_date,
  last_played_on date,
  notes text,
  created_at timestamptz not null default now()
);
create index repertoire_student_idx on public.repertoire(student_id);

-- --------------------------------------------------------------- lessons

create type public.lesson_status as enum ('draft', 'approved');

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  lesson_date date not null default current_date,
  duration_minutes int,
  status public.lesson_status not null default 'draft',
  summary text,            -- "Today we..." written for the parent
  focus_points text,       -- the one or two teaching points, parent language
  suggestions text,        -- ideas for next lesson (teacher or AI), teacher-only
  teacher_notes text,      -- private notes, never shown to parents
  parent_message text,     -- a short note to the parent for the sheet
  next_lesson_date date,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lessons_student_date_idx on public.lessons(student_id, lesson_date desc);

create type public.piece_activity as enum ('started', 'worked_on', 'polished', 'reviewed', 'performed');

create table public.lesson_pieces (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  repertoire_id uuid references public.repertoire(id) on delete set null,
  title text not null,
  activity public.piece_activity not null default 'worked_on',
  notes text,
  sort_order int not null default 0
);
create index lesson_pieces_lesson_idx on public.lesson_pieces(lesson_id);

create type public.assignment_kind as enum ('piece', 'technique', 'review', 'listening', 'game', 'theory', 'other');

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  kind public.assignment_kind not null default 'piece',
  title text not null,               -- "Perpetual Motion, line 1"
  how text,                          -- "three slow times, pinky curved"
  every_day boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index assignments_lesson_idx on public.assignments(lesson_id);
create index assignments_student_idx on public.assignments(student_id);

-- ---------------------------------------------------------- practice log

create table public.practice_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  practice_date date not null default current_date,
  minutes int,
  listened boolean not null default false,
  completed_assignment_ids uuid[] not null default '{}',
  parent_note text,
  logged_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, practice_date)
);
create index practice_logs_student_date_idx on public.practice_logs(student_id, practice_date desc);

-- ----------------------------------------------------------- updated_at

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger lessons_updated_at before update on public.lessons
  for each row execute function public.set_updated_at();
create trigger practice_logs_updated_at before update on public.practice_logs
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------- access helpers
-- security definer so they can look past RLS; search_path pinned.

create or replace function public.my_teacher_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.teachers where user_id = auth.uid()
$$;

-- A parent row belongs to the signed-in user if it was claimed (user_id)
-- or if its email matches the signed-in email. Email match lets an invited
-- parent see their children the first time they sign in.
create or replace function public.my_parent_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from public.parents
  where user_id = auth.uid()
     or (auth.email() is not null and lower(email) = lower(auth.email()))
$$;

create or replace function public.teaches_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    where s.id = sid and s.teacher_id = public.my_teacher_id()
  )
$$;

create or replace function public.parents_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_parents sp
    where sp.student_id = sid and sp.parent_id in (select public.my_parent_ids())
  )
$$;

-- --------------------------------------------------------------- RLS

alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.parents enable row level security;
alter table public.student_parents enable row level security;
alter table public.repertoire enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_pieces enable row level security;
alter table public.assignments enable row level security;
alter table public.practice_logs enable row level security;

-- teachers: you manage your own row; parents can read their children's teacher
create policy "teacher reads own row" on public.teachers for select
  using (user_id = auth.uid()
      or id in (select s.teacher_id from public.students s where public.parents_student(s.id)));
create policy "teacher inserts own row" on public.teachers for insert
  with check (user_id = auth.uid());
create policy "teacher updates own row" on public.teachers for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- students
create policy "teacher manages students" on public.students for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());
create policy "parent reads own children" on public.students for select
  using (public.parents_student(id));

-- parents
create policy "teacher manages parents" on public.parents for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());
create policy "parent reads own row" on public.parents for select
  using (id in (select public.my_parent_ids()));
create policy "parent claims own row" on public.parents for update
  using (id in (select public.my_parent_ids()))
  with check (id in (select public.my_parent_ids()));

-- student_parents
create policy "teacher manages links" on public.student_parents for all
  using (public.teaches_student(student_id))
  with check (public.teaches_student(student_id));
create policy "parent reads own links" on public.student_parents for select
  using (parent_id in (select public.my_parent_ids()));

-- repertoire
create policy "teacher manages repertoire" on public.repertoire for all
  using (public.teaches_student(student_id))
  with check (public.teaches_student(student_id));
create policy "parent reads repertoire" on public.repertoire for select
  using (public.parents_student(student_id));

-- lessons: parents only see approved records
create policy "teacher manages lessons" on public.lessons for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id() and public.teaches_student(student_id));
create policy "parent reads approved lessons" on public.lessons for select
  using (status = 'approved' and public.parents_student(student_id));

-- lesson_pieces
create policy "teacher manages pieces" on public.lesson_pieces for all
  using (exists (select 1 from public.lessons l where l.id = lesson_id and l.teacher_id = public.my_teacher_id()))
  with check (exists (select 1 from public.lessons l where l.id = lesson_id and l.teacher_id = public.my_teacher_id()));
create policy "parent reads pieces of approved lessons" on public.lesson_pieces for select
  using (exists (select 1 from public.lessons l where l.id = lesson_id and l.status = 'approved' and public.parents_student(l.student_id)));

-- assignments
create policy "teacher manages assignments" on public.assignments for all
  using (public.teaches_student(student_id))
  with check (public.teaches_student(student_id));
create policy "parent reads assignments of approved lessons" on public.assignments for select
  using (exists (select 1 from public.lessons l where l.id = lesson_id and l.status = 'approved' and public.parents_student(l.student_id)));

-- practice logs: teacher reads and may write; parents read and write for their children
create policy "teacher manages practice logs" on public.practice_logs for all
  using (public.teaches_student(student_id))
  with check (public.teaches_student(student_id));
create policy "parent manages practice logs" on public.practice_logs for all
  using (public.parents_student(student_id))
  with check (public.parents_student(student_id));

grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Helper functions are only for RLS policies: signed-in users may run them, nobody else.
revoke execute on function public.my_teacher_id() from public, anon;
revoke execute on function public.my_parent_ids() from public, anon;
revoke execute on function public.teaches_student(uuid) from public, anon;
revoke execute on function public.parents_student(uuid) from public, anon;
revoke execute on function public.set_updated_at() from public, anon;
alter function public.set_updated_at() set search_path = public;
