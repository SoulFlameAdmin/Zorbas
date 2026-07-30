-- Applied to production through Supabase migration: sf_restaurant_bridge_schema_v4.
-- Adds the SoulFlame multi-restaurant foundation and durable print-job claim fields.

alter table public.sf_platform_admins add column if not exists active boolean not null default true;

insert into public.sf_platform_admins(user_id, role, active)
select id, 'owner', true
from auth.users
where lower(email) = 'soulflame.mitko@gmail.com'
on conflict (user_id) do update set role = excluded.role, active = true;

create or replace function public.sf_is_platform_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null and exists(
    select 1 from public.sf_platform_admins a
    where a.user_id = p_user and a.active
  );
$$;

create table if not exists public.sf_restaurants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  business_type text not null default 'restaurant',
  city text,
  site_url text,
  status text not null default 'pilot',
  plan text not null default 'Pilot',
  operating_mode text not null default 'test_no_print',
  staff_count integer not null default 0 check (staff_count >= 0),
  table_count integer not null default 0 check (table_count >= 0),
  printer_count integer not null default 0 check (printer_count >= 0),
  access_code_hash text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sf_restaurants_code_format check (code ~ '^sf-[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint sf_restaurants_mode_check check (operating_mode in ('legacy','test_no_print','parallel','soulflame'))
);

insert into public.sf_restaurants(
  code, name, business_type, city, site_url, status, plan, operating_mode,
  staff_count, table_count, printer_count, access_code_hash, active
)
values (
  'sf-zorbas', 'Restaurant Zorbas', 'restaurant', 'Sliven',
  'https://zorbas-seven.vercel.app/', 'pilot', 'Pilot', 'test_no_print',
  0, 0, 2, encode(extensions.digest('sf-zorbas','sha256'),'hex'), true
)
on conflict (code) do update set
  name = excluded.name,
  city = excluded.city,
  site_url = excluded.site_url,
  printer_count = excluded.printer_count,
  access_code_hash = excluded.access_code_hash,
  active = true,
  updated_at = now();

create or replace function public.sf_default_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.sf_restaurants where code = 'sf-zorbas' limit 1;
$$;

do $$
declare
  v_table text;
  v_constraint text;
begin
  for v_table in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name like 'zorbas\_%' escape '\'
  loop
    execute format('alter table public.%I add column if not exists restaurant_id uuid', v_table);
    execute format('alter table public.%I alter column restaurant_id set default public.sf_default_restaurant_id()', v_table);
    execute format('update public.%I set restaurant_id = public.sf_default_restaurant_id() where restaurant_id is null', v_table);
    execute format('alter table public.%I alter column restaurant_id set not null', v_table);
    v_constraint := left(v_table || '_restaurant_fk', 63);
    if not exists (
      select 1 from pg_constraint
      where conname = v_constraint
        and conrelid = to_regclass(format('public.%I', v_table))
    ) then
      execute format('alter table public.%I add constraint %I foreign key (restaurant_id) references public.sf_restaurants(id) on delete restrict', v_table, v_constraint);
    end if;
    execute format('create index if not exists %I on public.%I (restaurant_id)', left(v_table || '_restaurant_id_idx', 63), v_table);
  end loop;
end;
$$;

create table if not exists public.sf_restaurant_devices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.sf_restaurants(id) on delete cascade,
  external_device_id text not null,
  device_name text,
  platform text not null default 'windows',
  app_version text,
  token_hash text not null,
  status text not null default 'active' check (status in ('active','revoked')),
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (restaurant_id, external_device_id)
);

create table if not exists public.sf_device_heartbeats (
  device_id uuid primary key references public.sf_restaurant_devices(id) on delete cascade,
  restaurant_id uuid not null references public.sf_restaurants(id) on delete cascade,
  state text not null default 'online',
  app_version text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now()
);

alter table public.zorbas_print_jobs
  add column if not exists idempotency_key text,
  add column if not exists claimed_by_device_id uuid references public.sf_restaurant_devices(id) on delete set null,
  add column if not exists claimed_by_session_id uuid references public.zorbas_app_sessions(id) on delete set null,
  add column if not exists claimed_at timestamptz,
  add column if not exists claim_expires_at timestamptz,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists max_attempts integer not null default 3,
  add column if not exists priority integer not null default 100,
  add column if not exists updated_at timestamptz not null default now();

update public.zorbas_print_jobs set idempotency_key = 'legacy:' || id::text where idempotency_key is null;
alter table public.zorbas_print_jobs alter column idempotency_key set not null;

create unique index if not exists zorbas_print_jobs_idempotency_idx on public.zorbas_print_jobs(restaurant_id, idempotency_key);
create index if not exists zorbas_print_jobs_claim_queue_idx on public.zorbas_print_jobs(restaurant_id, destination, status, available_at, priority desc, created_at);
create index if not exists zorbas_print_jobs_claim_expiry_idx on public.zorbas_print_jobs(claim_expires_at) where claim_expires_at is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'zorbas_print_jobs_status_v4_check') then
    alter table public.zorbas_print_jobs add constraint zorbas_print_jobs_status_v4_check check (status in ('pending','claimed','preparing','sending','printing','printed','failed','retrying','cancelled')) not valid;
    alter table public.zorbas_print_jobs validate constraint zorbas_print_jobs_status_v4_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zorbas_print_jobs_attempts_v4_check') then
    alter table public.zorbas_print_jobs add constraint zorbas_print_jobs_attempts_v4_check check (attempts >= 0 and max_attempts >= 1);
  end if;
end;
$$;

create table if not exists public.sf_print_job_attempts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.sf_restaurants(id) on delete cascade,
  print_job_id uuid not null references public.zorbas_print_jobs(id) on delete cascade,
  device_id uuid references public.sf_restaurant_devices(id) on delete set null,
  session_id uuid references public.zorbas_app_sessions(id) on delete set null,
  attempt_no integer not null,
  status text not null,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sf_print_job_attempts_job_idx on public.sf_print_job_attempts(print_job_id, created_at desc);

alter table public.sf_restaurants enable row level security;
alter table public.sf_restaurant_devices enable row level security;
alter table public.sf_device_heartbeats enable row level security;
alter table public.sf_print_job_attempts enable row level security;

drop policy if exists sf_admin_manage_restaurants on public.sf_restaurants;
create policy sf_admin_manage_restaurants on public.sf_restaurants for all to authenticated using (public.sf_is_platform_admin(auth.uid())) with check (public.sf_is_platform_admin(auth.uid()));
drop policy if exists sf_admin_manage_devices on public.sf_restaurant_devices;
create policy sf_admin_manage_devices on public.sf_restaurant_devices for all to authenticated using (public.sf_is_platform_admin(auth.uid())) with check (public.sf_is_platform_admin(auth.uid()));
drop policy if exists sf_admin_manage_heartbeats on public.sf_device_heartbeats;
create policy sf_admin_manage_heartbeats on public.sf_device_heartbeats for all to authenticated using (public.sf_is_platform_admin(auth.uid())) with check (public.sf_is_platform_admin(auth.uid()));
drop policy if exists sf_admin_read_attempts on public.sf_print_job_attempts;
create policy sf_admin_read_attempts on public.sf_print_job_attempts for select to authenticated using (public.sf_is_platform_admin(auth.uid()));

revoke all on public.sf_restaurants, public.sf_restaurant_devices, public.sf_device_heartbeats, public.sf_print_job_attempts from anon;
grant select, insert, update, delete on public.sf_restaurants, public.sf_restaurant_devices, public.sf_device_heartbeats to authenticated;
grant select on public.sf_print_job_attempts to authenticated;