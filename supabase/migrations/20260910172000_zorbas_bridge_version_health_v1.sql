-- ZORBAS Bridge version health v1
-- Safe test-no-print requires Bridge 1.2.4 or newer. This manager-authenticated
-- helper never exposes device credentials or identifiers.

create or replace function public.zorbas_bridge_version_health_v1(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session uuid;
  v_restaurant uuid;
  v_required_version text := '1.2.4';
  v_required_number integer := 1002004;
  v_active_devices integer := 0;
  v_outdated_devices integer := 0;
  v_unknown_devices integer := 0;
  v_latest_version text;
  v_last_seen_at timestamptz;
begin
  v_session := public.zorbas_private_require_manager(p_token, false);

  select s.restaurant_id into v_restaurant
  from public.zorbas_app_sessions s
  where s.id = v_session;

  with versions as (
    select
      split_part(coalesce(h.app_version,d.app_version,''), '+', 1) as version_text,
      coalesce(h.last_seen_at,d.last_seen_at) as last_seen_at
    from public.sf_restaurant_devices d
    left join public.sf_device_heartbeats h on h.device_id=d.id
    where d.restaurant_id=v_restaurant
      and d.status='active'
      and d.revoked_at is null
  ), parsed as (
    select
      version_text,
      last_seen_at,
      case
        when version_text ~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
          split_part(version_text,'.',1)::int * 1000000
          + split_part(version_text,'.',2)::int * 1000
          + split_part(version_text,'.',3)::int
        else null
      end as version_number
    from versions
  )
  select
    count(*),
    count(*) filter (where version_number is not null and version_number < v_required_number),
    count(*) filter (where version_number is null),
    max(version_text) filter (where version_text<>''),
    max(last_seen_at)
  into v_active_devices,v_outdated_devices,v_unknown_devices,v_latest_version,v_last_seen_at
  from parsed;

  return jsonb_build_object(
    'required_version', v_required_version,
    'active_devices', v_active_devices,
    'outdated_devices', v_outdated_devices,
    'unknown_version_devices', v_unknown_devices,
    'current_version', v_latest_version,
    'last_seen_at', v_last_seen_at,
    'safe_test_no_print_ready',
      v_active_devices > 0 and v_outdated_devices = 0 and v_unknown_devices = 0
  );
end;
$function$;

revoke all on function public.zorbas_bridge_version_health_v1(text) from public;
grant execute on function public.zorbas_bridge_version_health_v1(text) to anon, authenticated, service_role;
