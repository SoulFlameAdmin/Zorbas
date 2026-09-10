-- ZORBAS daily reset hardening v1
-- At the 05:00 service-day boundary, archive stale operational visits without
-- pretending that an unpaid/open bill was paid. History and bill state stay intact.

create or replace function public.zorbas_daily_reset()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_local_now timestamp := now() at time zone 'Europe/Sofia';
  v_business_date date := (now() at time zone 'Europe/Sofia')::date;
  v_day_start timestamptz;
  v_inserted boolean := false;
begin
  if extract(hour from v_local_now)::int <> 5 then
    return;
  end if;

  insert into public.zorbas_daily_maintenance_log(business_date)
  values(v_business_date)
  on conflict(business_date) do nothing;

  v_inserted := found;
  if not v_inserted then
    return;
  end if;

  v_day_start := public.zorbas_private_service_day_start(now());

  update public.zorbas_shifts
  set ended_at = now(), end_reason = 'auto_05'
  where ended_at is null;

  update public.zorbas_work_shifts
  set ended_at = now(), end_reason = 'auto_05'
  where ended_at is null;

  -- A visit from a previous service day must not remain operationally active.
  -- Preserve bill_status/paid_at exactly as they are: an automatic rollover is
  -- not proof that the guest paid.
  update public.zorbas_table_visits
  set status = 'completed',
      closed_at = coalesce(closed_at, now()),
      archived_at = coalesce(archived_at, now()),
      closed_by_name = coalesce(closed_by_name, 'AUTO 05:00'),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'auto_closed', true,
        'auto_closed_reason', 'service_day_rollover',
        'auto_closed_at', now(),
        'bill_status_at_auto_close', bill_status
      ),
      version = version + 1,
      updated_at = now()
  where status = 'active'
    and opened_at < v_day_start;

  update public.zorbas_restaurant_tables
  set status = 'free', updated_at = now()
  where status in ('occupied','cleaning');

  update public.zorbas_reservations
  set status = 'completed', updated_at = now()
  where status in ('confirmed','seated')
    and end_at < now();

  delete from public.zorbas_app_sessions
  where expires_at < now();
end;
$function$;
