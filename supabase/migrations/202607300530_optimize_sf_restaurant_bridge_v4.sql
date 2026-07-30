-- Applied to production through Supabase migration: optimize_sf_restaurant_bridge_v4.

create index if not exists sf_device_heartbeats_restaurant_idx
  on public.sf_device_heartbeats(restaurant_id);

create index if not exists sf_print_job_attempts_restaurant_idx
  on public.sf_print_job_attempts(restaurant_id);

create index if not exists sf_print_job_attempts_device_idx
  on public.sf_print_job_attempts(device_id)
  where device_id is not null;

create index if not exists sf_print_job_attempts_session_idx
  on public.sf_print_job_attempts(session_id)
  where session_id is not null;

create index if not exists zorbas_print_jobs_claimed_device_idx
  on public.zorbas_print_jobs(claimed_by_device_id)
  where claimed_by_device_id is not null;

create index if not exists zorbas_print_jobs_claimed_session_idx
  on public.zorbas_print_jobs(claimed_by_session_id)
  where claimed_by_session_id is not null;

drop policy if exists sf_admin_manage_restaurants on public.sf_restaurants;
create policy sf_admin_manage_restaurants
on public.sf_restaurants
for all
to authenticated
using (public.sf_is_platform_admin((select auth.uid())))
with check (public.sf_is_platform_admin((select auth.uid())));

drop policy if exists sf_admin_manage_devices on public.sf_restaurant_devices;
create policy sf_admin_manage_devices
on public.sf_restaurant_devices
for all
to authenticated
using (public.sf_is_platform_admin((select auth.uid())))
with check (public.sf_is_platform_admin((select auth.uid())));

drop policy if exists sf_admin_manage_heartbeats on public.sf_device_heartbeats;
create policy sf_admin_manage_heartbeats
on public.sf_device_heartbeats
for all
to authenticated
using (public.sf_is_platform_admin((select auth.uid())))
with check (public.sf_is_platform_admin((select auth.uid())));

drop policy if exists sf_admin_read_attempts on public.sf_print_job_attempts;
create policy sf_admin_read_attempts
on public.sf_print_job_attempts
for select
to authenticated
using (public.sf_is_platform_admin((select auth.uid())));