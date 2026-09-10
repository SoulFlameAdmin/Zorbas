-- ZORBAS operational core P1 v2
-- 1) Service-day rollover closes stale operational orders together with stale visits.
-- 2) New-day records created after 05:00 are never closed by a delayed reset run.
-- 3) System health includes bridge heartbeat, printer configuration and lifecycle integrity.

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

  -- Only yesterday's shifts may be auto-ended. A shift started after 05:00
  -- belongs to the new service day even if the cron invocation is delayed.
  update public.zorbas_shifts
  set ended_at = now(), end_reason = 'auto_05'
  where ended_at is null
    and started_at < v_day_start;

  update public.zorbas_work_shifts
  set ended_at = now(), end_reason = 'auto_05'
  where ended_at is null
    and started_at < v_day_start;

  -- Preserve an audit record before stale dine-in orders leave the live queue.
  insert into public.zorbas_manager_events(
    restaurant_id, visit_id, order_id, session_id, actor_name,
    event_type, from_state, to_state, payload
  )
  select
    o.restaurant_id,
    o.visit_id,
    o.id,
    null,
    'AUTO 05:00',
    'auto_service_day_rollover',
    o.status,
    'completed',
    jsonb_build_object(
      'reason', 'service_day_rollover',
      'manager_state', o.manager_state,
      'manager_required', o.manager_required,
      'bill_status', v.bill_status,
      'visit_opened_at', v.opened_at
    )
  from public.zorbas_orders o
  join public.zorbas_table_visits v on v.id = o.visit_id and v.restaurant_id = o.restaurant_id
  where v.status = 'active'
    and v.opened_at < v_day_start
    and o.status not in ('completed','cancelled','returned');

  -- Order status is the operational lifecycle. A new service day must not keep
  -- yesterday's dine-in notes in live queues, even when the bill state was open.
  update public.zorbas_orders o
  set status = 'completed',
      updated_at = now()
  where o.status not in ('completed','cancelled','returned')
    and exists(
      select 1
      from public.zorbas_table_visits v
      where v.id = o.visit_id
        and v.restaurant_id = o.restaurant_id
        and v.status = 'active'
        and v.opened_at < v_day_start
    );

  -- Old pickup orders are also operationally stale after their pickup time is
  -- behind the new service-day boundary. Preorders are intentionally excluded.
  insert into public.zorbas_manager_events(
    restaurant_id, order_id, session_id, actor_name,
    event_type, from_state, to_state, payload
  )
  select
    o.restaurant_id,
    o.id,
    null,
    'AUTO 05:00',
    'auto_pickup_rollover',
    o.status,
    'completed',
    jsonb_build_object(
      'reason', 'service_day_rollover',
      'ready_at', o.ready_at,
      'created_at', o.created_at
    )
  from public.zorbas_orders o
  where o.order_type = 'pickup'
    and o.status not in ('completed','cancelled','returned')
    and coalesce(o.ready_at, o.created_at) < v_day_start;

  update public.zorbas_orders
  set status = 'completed', updated_at = now()
  where order_type = 'pickup'
    and status not in ('completed','cancelled','returned')
    and coalesce(ready_at, created_at) < v_day_start;

  -- Archive stale visits without inventing payment. bill_status/paid_at remain
  -- authoritative financial facts and are deliberately not changed here.
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

  -- Reconcile table state from live records instead of blindly freeing every
  -- occupied table. This protects a table opened after the 05:00 boundary.
  update public.zorbas_restaurant_tables t
  set status = case
        when public.zorbas_private_table_has_live_records(t.restaurant_id,t.id) then 'occupied'
        else 'free'
      end,
      updated_at = now()
  where t.active
    and t.status <> 'blocked'
    and (
      t.status in ('occupied','cleaning')
      or public.zorbas_private_table_has_live_records(t.restaurant_id,t.id)
    );

  update public.zorbas_reservations
  set status = 'completed', updated_at = now()
  where status in ('confirmed','seated')
    and end_at < now();

  delete from public.zorbas_app_sessions
  where expires_at < now();
end;
$function$;

create or replace function public.zorbas_ops_health_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session uuid;
  v_restaurant uuid;
  v_operating_mode text;
  v_expected_printers integer := 0;
  v_day_start timestamptz;

  v_recent_failed_prints integer := 0;
  v_ambiguous_prints integer := 0;
  v_expired_print_leases integer := 0;
  v_exhausted_prints integer := 0;
  v_printed_last_24h integer := 0;
  v_last_printed_at timestamptz;

  v_active_printers integer := 0;
  v_bad_printer_config integer := 0;
  v_bridge_devices integer := 0;
  v_bridge_online integer := 0;
  v_bridge_stale integer := 0;
  v_bridge_last_seen_at timestamptz;

  v_recent_dinein_without_visit integer := 0;
  v_live_table_mismatch integer := 0;
  v_current_live_visits integer := 0;
  v_historical_stale_active_visits integer := 0;
  v_stale_nonfinal_orders integer := 0;
  v_lifecycle_conflicts integer := 0;
  v_recent_orders integer := 0;
  v_upcoming_reservations integer := 0;
  v_expired_sessions integer := 0;
  v_status text := 'ok';
  v_bridge_required boolean := false;
begin
  v_session := public.zorbas_private_require_manager(p_token, false);
  select s.restaurant_id into v_restaurant
  from public.zorbas_app_sessions s
  where s.id = v_session;

  select r.operating_mode, coalesce(r.printer_count,0)
    into v_operating_mode, v_expected_printers
  from public.sf_restaurants r
  where r.id = v_restaurant;

  v_bridge_required := coalesce(v_operating_mode,'parallel') in ('parallel','soulflame');
  v_day_start := public.zorbas_private_service_day_start(now());

  select count(*) into v_recent_failed_prints
  from public.zorbas_print_jobs
  where restaurant_id = v_restaurant
    and status = 'failed'
    and updated_at >= now() - interval '48 hours';

  select count(*) into v_ambiguous_prints
  from public.zorbas_print_jobs
  where restaurant_id = v_restaurant
    and status = 'failed'
    and updated_at >= now() - interval '48 hours'
    and coalesce(last_error,'') like '[AMBIGUOUS_PRINT]%';

  select count(*) into v_expired_print_leases
  from public.zorbas_print_jobs
  where restaurant_id = v_restaurant
    and status in ('claimed','preparing','sending','printing')
    and claim_expires_at is not null
    and claim_expires_at < now();

  select count(*) into v_exhausted_prints
  from public.zorbas_print_jobs
  where restaurant_id = v_restaurant
    and status not in ('printed','cancelled')
    and attempts >= max_attempts
    and updated_at >= now() - interval '48 hours';

  select count(*) into v_printed_last_24h
  from public.zorbas_print_jobs
  where restaurant_id = v_restaurant
    and status = 'printed'
    and printed_at >= now() - interval '24 hours';

  select max(printed_at) into v_last_printed_at
  from public.zorbas_print_jobs
  where restaurant_id = v_restaurant
    and status = 'printed';

  select
    count(*) filter (where p.active),
    count(*) filter (
      where p.active and (
        nullif(trim(coalesce(p.connection_type,'')),'') is null
        or nullif(trim(coalesce(p.connection_value,'')),'') is null
      )
    )
    into v_active_printers, v_bad_printer_config
  from public.zorbas_printers p
  where p.restaurant_id = v_restaurant;

  select
    count(*) filter (where d.status='active' and d.revoked_at is null),
    count(*) filter (
      where d.status='active' and d.revoked_at is null
        and coalesce(h.state,'online')='online'
        and coalesce(h.last_seen_at,d.last_seen_at) >= now() - interval '3 minutes'
    ),
    count(*) filter (
      where d.status='active' and d.revoked_at is null
        and (
          coalesce(h.state,'online') <> 'online'
          or coalesce(h.last_seen_at,d.last_seen_at) is null
          or coalesce(h.last_seen_at,d.last_seen_at) < now() - interval '3 minutes'
        )
    ),
    max(coalesce(h.last_seen_at,d.last_seen_at))
    into v_bridge_devices, v_bridge_online, v_bridge_stale, v_bridge_last_seen_at
  from public.sf_restaurant_devices d
  left join public.sf_device_heartbeats h on h.device_id = d.id
  where d.restaurant_id = v_restaurant;

  select count(*) into v_recent_dinein_without_visit
  from public.zorbas_orders
  where restaurant_id = v_restaurant
    and order_type = 'dine_in'
    and status not in ('cancelled','returned','completed')
    and created_at >= v_day_start
    and visit_id is null;

  select count(*) into v_current_live_visits
  from public.zorbas_table_visits v
  where v.restaurant_id = v_restaurant
    and public.zorbas_private_visit_is_live(v_restaurant, v.id);

  select count(*) into v_historical_stale_active_visits
  from public.zorbas_table_visits v
  where v.restaurant_id = v_restaurant
    and v.status = 'active'
    and not public.zorbas_private_visit_is_live(v_restaurant, v.id);

  select count(*) into v_stale_nonfinal_orders
  from public.zorbas_orders o
  left join public.zorbas_table_visits v on v.id=o.visit_id and v.restaurant_id=o.restaurant_id
  where o.restaurant_id = v_restaurant
    and o.status not in ('completed','cancelled','returned')
    and (
      (v.id is not null and v.opened_at < v_day_start)
      or (o.order_type='pickup' and coalesce(o.ready_at,o.created_at) < v_day_start)
    );

  select count(*) into v_lifecycle_conflicts
  from public.zorbas_orders o
  where o.restaurant_id = v_restaurant
    and (
      (
        o.manager_state = 'completed'
        and exists(
          select 1
          from public.zorbas_order_items oi
          where oi.order_id = o.id
            and oi.restaurant_id = v_restaurant
            and oi.status <> 'cancelled'
            and oi.send_to_kitchen_snapshot
            and coalesce(oi.delivered_quantity,0) < oi.quantity
        )
      )
      or (o.manager_state <> 'completed' and o.manager_completed_at is not null)
      or (o.manager_state = 'completed' and o.manager_completed_at is null)
    );

  select count(*) into v_live_table_mismatch
  from public.zorbas_restaurant_tables t
  where t.restaurant_id = v_restaurant
    and t.active
    and (
      (public.zorbas_private_table_has_live_records(v_restaurant,t.id) and t.status = 'free')
      or
      (not public.zorbas_private_table_has_live_records(v_restaurant,t.id)
        and t.status in ('occupied','cleaning')
        and t.updated_at >= v_day_start)
    );

  select count(*) into v_recent_orders
  from public.zorbas_orders
  where restaurant_id = v_restaurant
    and created_at >= now() - interval '24 hours';

  select count(*) into v_upcoming_reservations
  from public.zorbas_reservations
  where restaurant_id = v_restaurant
    and status = 'confirmed'
    and start_at >= now()
    and start_at < now() + interval '24 hours';

  select count(*) into v_expired_sessions
  from public.zorbas_app_sessions
  where restaurant_id = v_restaurant
    and expires_at < now();

  if v_expired_print_leases > 0
     or v_ambiguous_prints > 0
     or v_exhausted_prints > 0
     or v_recent_dinein_without_visit > 0
     or v_live_table_mismatch > 0
     or v_lifecycle_conflicts > 0
     or v_bad_printer_config > 0
     or (v_bridge_required and v_bridge_online = 0)
     or (v_expected_printers > 0 and v_active_printers < v_expected_printers) then
    v_status := 'action_required';
  elsif v_recent_failed_prints > 0
     or v_historical_stale_active_visits > 0
     or v_stale_nonfinal_orders > 0
     or v_bridge_stale > 0 then
    v_status := 'warning';
  end if;

  return jsonb_build_object(
    'ok', v_status = 'ok',
    'status', v_status,
    'checked_at', now(),
    'database', jsonb_build_object('reachable', true),
    'printing', jsonb_build_object(
      'failed_last_48h', v_recent_failed_prints,
      'ambiguous_last_48h', v_ambiguous_prints,
      'expired_leases', v_expired_print_leases,
      'exhausted_last_48h', v_exhausted_prints,
      'printed_last_24h', v_printed_last_24h,
      'last_printed_at', v_last_printed_at,
      'active_printers', v_active_printers,
      'expected_printers', v_expected_printers,
      'bad_printer_config', v_bad_printer_config
    ),
    'bridge', jsonb_build_object(
      'required', v_bridge_required,
      'devices', v_bridge_devices,
      'online', v_bridge_online,
      'stale', v_bridge_stale,
      'last_seen_at', v_bridge_last_seen_at,
      'operating_mode', v_operating_mode
    ),
    'service', jsonb_build_object(
      'recent_dinein_without_visit', v_recent_dinein_without_visit,
      'live_table_mismatch', v_live_table_mismatch,
      'current_live_visits', v_current_live_visits,
      'historical_stale_active_visits', v_historical_stale_active_visits,
      'stale_nonfinal_orders', v_stale_nonfinal_orders,
      'lifecycle_conflicts', v_lifecycle_conflicts,
      'orders_last_24h', v_recent_orders,
      'confirmed_reservations_next_24h', v_upcoming_reservations
    ),
    'maintenance', jsonb_build_object('expired_sessions', v_expired_sessions)
  );
end;
$function$;
