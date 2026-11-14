-- Studio store: the owner (app admin) loads a catalogue of products with
-- their retailer links (affiliate links where we have one). Each teacher
-- picks which products their families see, filtered by instrument, inside
-- the fixed categories, and chooses a layout. Families see the teacher's
-- picks that fit their child's instrument on Home practice.
--
-- store_products       the catalogue (admin writes through the service key)
-- teacher_store_items  which products a teacher switched on
-- store_clicks         one row per Buy tap, so earnings can be matched later
--
-- Admin writes use the app's admin mode (x-lesson-admin header + app_admins).
-- teachers.store_*     the teacher's layout and a short note to families
--
-- Safe to run more than once.

create table if not exists public.store_products (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'instruments', 'accessories', 'strings', 'books', 'recordings', 'practice', 'general')),
  name text not null check (length(trim(name)) > 0),
  description text not null default '',
  retailer text not null default '',
  url text not null check (url ~* '^https://'),
  image_url text,
  price_note text not null default '',
  -- Empty means it suits every instrument (a stand, a practice log).
  instruments text[] not null default '{}',
  -- True when url is a commission-paying affiliate link.
  affiliate boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists store_products_category on public.store_products (category, sort_order);

drop trigger if exists store_products_updated_at on public.store_products;
create trigger store_products_updated_at before update on public.store_products
  for each row execute function public.set_updated_at();

alter table public.store_products enable row level security;

-- Anyone signed in can read the live catalogue; only the admin writes.
drop policy if exists "signed in reads active products" on public.store_products;
create policy "signed in reads active products" on public.store_products for select
  using (auth.uid() is not null and active);
drop policy if exists "admin manages all" on public.store_products;
create policy "admin manages all" on public.store_products for all to authenticated
  using (public.admin_mode()) with check (public.admin_mode());

create table if not exists public.teacher_store_items (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  product_id uuid not null references public.store_products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, product_id)
);

alter table public.teacher_store_items enable row level security;

drop policy if exists "teacher manages own store" on public.teacher_store_items;
create policy "teacher manages own store" on public.teacher_store_items for all
  using (teacher_id = public.my_teacher_id())
  with check (teacher_id = public.my_teacher_id());

-- Families read the picks of their children's teachers.
drop policy if exists "admin manages all" on public.teacher_store_items;
create policy "admin manages all" on public.teacher_store_items for all to authenticated
  using (public.admin_mode()) with check (public.admin_mode());

drop policy if exists "family reads teacher store" on public.teacher_store_items;
create policy "family reads teacher store" on public.teacher_store_items for select
  using (teacher_id in (select s.teacher_id from public.students s where public.parents_student(s.id)));

create table if not exists public.store_clicks (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.store_products(id) on delete set null,
  teacher_id uuid references public.teachers(id) on delete set null,
  user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists store_clicks_teacher on public.store_clicks (teacher_id, created_at);
alter table public.store_clicks enable row level security;

-- Anyone signed in logs their own taps; teachers count theirs; admin sees all.
drop policy if exists "user logs own click" on public.store_clicks;
create policy "user logs own click" on public.store_clicks for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "teacher reads own clicks" on public.store_clicks;
create policy "teacher reads own clicks" on public.store_clicks for select
  using (teacher_id = public.my_teacher_id());
drop policy if exists "admin manages all" on public.store_clicks;
create policy "admin manages all" on public.store_clicks for all to authenticated
  using (public.admin_mode()) with check (public.admin_mode());

alter table public.teachers add column if not exists store_layout text not null default 'grid';
alter table public.teachers drop constraint if exists teachers_store_layout_check;
alter table public.teachers add constraint teachers_store_layout_check
  check (store_layout in ('grid', 'list', 'compact'));
alter table public.teachers add column if not exists store_note text not null default '';
