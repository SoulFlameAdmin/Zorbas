-- Applied to production through Supabase migration: sf_restaurant_bridge_rpcs_v4.
-- Adds pairing, heartbeat, atomic claim/ack, browser v4 print RPCs and SoulFlame partner admin RPCs.

create or replace function public.sf_private_bridge_device(p_device_id text, p_device_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_device uuid;
  v_restaurant uuid;
begin
  select d.id, d.restaurant_id into v_device, v_restaurant
  from public.sf_restaurant_devices d
  where d.external_device_id = nullif(trim(p_device_id),'')
    and d.status = 'active'
    and d.token_hash = encode(extensions.digest(coalesce(p_device_token,''),'sha256'),'hex')
  limit 1;
  if v_device is null then raise exception 'Невалидно или блокирано Bridge устройство'; end if;
  update public.sf_restaurant_devices set last_seen_at = now() where id = v_device;
  insert into public.sf_device_heartbeats(device_id, restaurant_id, state, last_seen_at)
  values(v_device, v_restaurant, 'online', now())
  on conflict (device_id) do update set state = 'online', last_seen_at = excluded.last_seen_at;
  return v_device;
end;
$$;
revoke all on function public.sf_private_bridge_device(text,text) from public, anon, authenticated;

create or replace function public.sf_pair_restaurant_device(
  p_restaurant_code text,
  p_device_id text,
  p_device_name text default null,
  p_platform text default 'windows',
  p_app_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_restaurant public.sf_restaurants%rowtype;
  v_token text;
  v_device uuid;
begin
  if nullif(trim(p_device_id),'') is null then raise exception 'Липсва идентификатор на устройството'; end if;
  select * into v_restaurant
  from public.sf_restaurants r
  where r.code = lower(trim(p_restaurant_code))
    and r.active
    and r.access_code_hash = encode(extensions.digest(lower(trim(p_restaurant_code)),'sha256'),'hex')
  limit 1;
  if v_restaurant.id is null then raise exception 'Невалиден ресторантски код'; end if;
  v_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.sf_restaurant_devices(
    restaurant_id, external_device_id, device_name, platform, app_version,
    token_hash, status, paired_at, last_seen_at, revoked_at
  ) values (
    v_restaurant.id, trim(p_device_id), nullif(trim(p_device_name),''),
    coalesce(nullif(trim(p_platform),''),'windows'), nullif(trim(p_app_version),''),
    encode(extensions.digest(v_token,'sha256'),'hex'), 'active', now(), now(), null
  )
  on conflict (restaurant_id, external_device_id) do update set
    device_name = excluded.device_name,
    platform = excluded.platform,
    app_version = excluded.app_version,
    token_hash = excluded.token_hash,
    status = 'active',
    paired_at = now(),
    last_seen_at = now(),
    revoked_at = null
  returning id into v_device;
  insert into public.sf_device_heartbeats(device_id, restaurant_id, state, app_version, last_seen_at)
  values(v_device, v_restaurant.id, 'online', p_app_version, now())
  on conflict (device_id) do update set state = 'online', app_version = excluded.app_version, last_seen_at = excluded.last_seen_at;
  return jsonb_build_object(
    'ok', true,
    'restaurant_id', v_restaurant.id,
    'restaurant_code', v_restaurant.code,
    'restaurant_name', v_restaurant.name,
    'device_record_id', v_device,
    'device_id', trim(p_device_id),
    'device_token', v_token,
    'operating_mode', v_restaurant.operating_mode
  );
end;
$$;

create or replace function public.sf_bridge_get_config(p_device_id text, p_device_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device uuid;
  v_restaurant uuid;
begin
  v_device := public.sf_private_bridge_device(p_device_id, p_device_token);
  select restaurant_id into v_restaurant from public.sf_restaurant_devices where id = v_device;
  return jsonb_build_object(
    'restaurant', (
      select jsonb_build_object(
        'id', r.id, 'code', r.code, 'name', r.name, 'city', r.city,
        'site_url', r.site_url, 'status', r.status, 'plan', r.plan,
        'operating_mode', r.operating_mode
      ) from public.sf_restaurants r where r.id = v_restaurant
    ),
    'device_record_id', v_device,
    'printers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'name', p.name, 'destination', p.destination,
        'connection_type', p.connection_type, 'connection_value', p.connection_value,
        'paper_width_mm', p.paper_width_mm, 'model', p.model, 'active', p.active
      ) order by p.code)
      from public.zorbas_printers p
      where p.restaurant_id = v_restaurant and p.active
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.sf_bridge_heartbeat(
  p_device_id text,
  p_device_token text,
  p_state text default 'online',
  p_app_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device uuid;
  v_restaurant uuid;
begin
  v_device := public.sf_private_bridge_device(p_device_id, p_device_token);
  select restaurant_id into v_restaurant from public.sf_restaurant_devices where id = v_device;
  update public.sf_restaurant_devices
  set app_version = coalesce(nullif(trim(p_app_version),''), app_version), last_seen_at = now()
  where id = v_device;
  insert into public.sf_device_heartbeats(device_id, restaurant_id, state, app_version, metadata, last_seen_at)
  values(v_device, v_restaurant, coalesce(nullif(trim(p_state),''),'online'), p_app_version, coalesce(p_metadata,'{}'::jsonb), now())
  on conflict (device_id) do update set
    state = excluded.state,
    app_version = coalesce(excluded.app_version, public.sf_device_heartbeats.app_version),
    metadata = excluded.metadata,
    last_seen_at = excluded.last_seen_at;
  return jsonb_build_object('ok',true,'server_time',now());
end;
$$;

create or replace function public.sf_bridge_claim_next_print_job(
  p_device_id text,
  p_device_token text,
  p_destination text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device uuid;
  v_restaurant uuid;
  v_job public.zorbas_print_jobs%rowtype;
begin
  if p_destination not in ('staff','kitchen') then raise exception 'Невалидна печатна дестинация'; end if;
  v_device := public.sf_private_bridge_device(p_device_id, p_device_token);
  select restaurant_id into v_restaurant from public.sf_restaurant_devices where id = v_device;
  with candidate as (
    select j.id
    from public.zorbas_print_jobs j
    where j.restaurant_id = v_restaurant
      and j.destination = p_destination
      and j.available_at <= now()
      and j.attempts < j.max_attempts
      and (
        j.status in ('pending','retrying')
        or (j.status in ('claimed','preparing','sending','printing') and j.claim_expires_at is not null and j.claim_expires_at < now())
      )
    order by j.priority desc, j.created_at
    for update skip locked
    limit 1
  )
  update public.zorbas_print_jobs j
  set status = 'claimed',
      claimed_by_device_id = v_device,
      claimed_by_session_id = null,
      claimed_at = now(),
      claim_expires_at = now() + interval '45 seconds',
      attempts = j.attempts + 1,
      updated_at = now(),
      last_error = null
  where j.id = (select id from candidate)
  returning j.* into v_job;
  if v_job.id is null then return null; end if;
  insert into public.sf_print_job_attempts(restaurant_id, print_job_id, device_id, attempt_no, status)
  values(v_restaurant, v_job.id, v_device, v_job.attempts, 'claimed');
  return to_jsonb(v_job);
end;
$$;

create or replace function public.sf_bridge_ack_print_job(
  p_device_id text,
  p_device_token text,
  p_job_id uuid,
  p_status text,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device uuid;
  v_restaurant uuid;
  v_job public.zorbas_print_jobs%rowtype;
begin
  if p_status not in ('preparing','sending','printing','printed','failed','retrying','cancelled') then raise exception 'Невалиден печатен статус'; end if;
  v_device := public.sf_private_bridge_device(p_device_id, p_device_token);
  select restaurant_id into v_restaurant from public.sf_restaurant_devices where id = v_device;
  update public.zorbas_print_jobs j
  set status = p_status,
      last_error = nullif(trim(coalesce(p_error,'')),''),
      printed_at = case when p_status = 'printed' then now() else j.printed_at end,
      available_at = case when p_status = 'retrying' then now() + interval '5 seconds' else j.available_at end,
      claim_expires_at = case when p_status in ('preparing','sending','printing') then now() + interval '45 seconds' else null end,
      claimed_by_device_id = case when p_status in ('preparing','sending','printing') then v_device else null end,
      claimed_by_session_id = null,
      updated_at = now()
  where j.id = p_job_id and j.restaurant_id = v_restaurant and j.claimed_by_device_id = v_device
  returning j.* into v_job;
  if v_job.id is null then raise exception 'Задачата не е взета от това Bridge устройство'; end if;
  insert into public.sf_print_job_attempts(restaurant_id, print_job_id, device_id, attempt_no, status, error_message, metadata)
  values(v_restaurant, v_job.id, v_device, v_job.attempts, p_status, nullif(trim(coalesce(p_error,'')),''), coalesce(p_metadata,'{}'::jsonb));
  return jsonb_build_object('ok',true,'job',to_jsonb(v_job));
end;
$$;

create or replace function public.zorbas_list_print_jobs_v4(p_token text, p_destination text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  v_restaurant uuid;
begin
  v_session := public.zorbas_private_session_id(p_token,false);
  select restaurant_id into v_restaurant from public.zorbas_app_sessions where id = v_session;
  return coalesce((
    select jsonb_agg(to_jsonb(j) order by j.priority desc, j.created_at)
    from public.zorbas_print_jobs j
    where j.restaurant_id = v_restaurant
      and j.destination = p_destination
      and j.created_at > now() - interval '48 hours'
      and (j.status in ('pending','retrying','failed') or (j.claimed_by_session_id = v_session and j.status in ('claimed','preparing','sending','printing')))
  ), '[]'::jsonb);
end;
$$;

create or replace function public.zorbas_claim_print_job_v4(p_token text, p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  v_restaurant uuid;
  v_job public.zorbas_print_jobs%rowtype;
begin
  v_session := public.zorbas_private_session_id(p_token,false);
  select restaurant_id into v_restaurant from public.zorbas_app_sessions where id = v_session;
  update public.zorbas_print_jobs j
  set status = 'claimed',
      claimed_by_session_id = v_session,
      claimed_by_device_id = null,
      claimed_at = now(),
      claim_expires_at = now() + interval '45 seconds',
      attempts = j.attempts + 1,
      last_error = null,
      updated_at = now()
  where j.id = p_job_id
    and j.restaurant_id = v_restaurant
    and j.attempts < j.max_attempts
    and (j.status in ('pending','retrying','failed') or (j.status in ('claimed','preparing','sending','printing') and j.claim_expires_at is not null and j.claim_expires_at < now()))
  returning j.* into v_job;
  if v_job.id is null then raise exception 'Задачата вече е взета или е изчерпала опитите'; end if;
  insert into public.sf_print_job_attempts(restaurant_id, print_job_id, session_id, attempt_no, status)
  values(v_restaurant, v_job.id, v_session, v_job.attempts, 'claimed');
  return to_jsonb(v_job);
end;
$$;

create or replace function public.zorbas_ack_print_job_v4(p_token text, p_job_id uuid, p_status text, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  v_restaurant uuid;
  v_job public.zorbas_print_jobs%rowtype;
begin
  v_session := public.zorbas_private_session_id(p_token,false);
  select restaurant_id into v_restaurant from public.zorbas_app_sessions where id = v_session;
  if p_status not in ('preparing','sending','printing','printed','failed','retrying','cancelled') then raise exception 'Невалиден печатен статус'; end if;
  update public.zorbas_print_jobs j
  set status = p_status,
      last_error = nullif(trim(coalesce(p_error,'')),''),
      printed_at = case when p_status = 'printed' then now() else j.printed_at end,
      available_at = case when p_status = 'retrying' then now() + interval '5 seconds' else j.available_at end,
      claim_expires_at = case when p_status in ('preparing','sending','printing') then now() + interval '45 seconds' else null end,
      claimed_by_session_id = case when p_status in ('preparing','sending','printing') then v_session else null end,
      claimed_by_device_id = null,
      updated_at = now()
  where j.id = p_job_id and j.restaurant_id = v_restaurant and j.claimed_by_session_id = v_session
  returning j.* into v_job;
  if v_job.id is null then raise exception 'Задачата не е взета от тази сесия'; end if;
  insert into public.sf_print_job_attempts(restaurant_id, print_job_id, session_id, attempt_no, status, error_message)
  values(v_restaurant, v_job.id, v_session, v_job.attempts, p_status, nullif(trim(coalesce(p_error,'')),''));
  return jsonb_build_object('ok',true,'job',to_jsonb(v_job));
end;
$$;

create or replace function public.zorbas_private_queue_prints(p_order_id uuid, p_route text, p_job_type text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_template uuid;
  v_restaurant uuid;
  v_batch text;
begin
  select restaurant_id into v_restaurant from public.zorbas_orders where id = p_order_id;
  if v_restaurant is null then raise exception 'Поръчката няма ресторант'; end if;
  select id into v_template from public.zorbas_print_templates where restaurant_id = v_restaurant and active order by created_at limit 1;
  v_batch := encode(extensions.gen_random_bytes(12),'hex');
  if p_route in ('staff','both') then
    insert into public.zorbas_print_jobs(restaurant_id, order_id, printer_id, template_id, job_type, destination, payload, status, idempotency_key)
    select v_restaurant, o.id, p.id, v_template, p_job_type, 'staff',
      jsonb_build_object(
        'destination','staff','order_id',o.id,'order_number',o.order_number,'public_code',o.public_code,'table_number',t.table_number,
        'order_type',o.order_type,'ready_at',o.ready_at,'actor',o.created_by_name,'note',o.note,'subtotal',o.subtotal,'created_at',o.created_at,
        'cancel_reason',o.cancel_reason,
        'items',coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'note',oi.note,'meta',oi.item_meta) order by oi.created_at) from public.zorbas_order_items oi where oi.order_id=o.id),'[]'::jsonb)
      ), 'pending', p_order_id::text || ':' || p_job_type || ':staff:' || v_batch
    from public.zorbas_orders o
    left join public.zorbas_restaurant_tables t on t.id = o.table_id
    left join public.zorbas_printers p on p.restaurant_id = v_restaurant and p.code = 'print_1' and p.active
    where o.id = p_order_id;
  end if;
  if p_route in ('kitchen','both') and (
    p_job_type = 'cancellation' or exists(
      select 1 from public.zorbas_order_items oi join public.zorbas_menu_items mi on mi.id = oi.menu_item_id
      where oi.order_id = p_order_id and mi.send_to_kitchen and oi.status <> 'cancelled'
    )
  ) then
    insert into public.zorbas_print_jobs(restaurant_id, order_id, printer_id, template_id, job_type, destination, payload, status, idempotency_key)
    select v_restaurant, o.id, p.id, v_template, p_job_type, 'kitchen',
      jsonb_build_object(
        'destination','kitchen','order_id',o.id,'order_number',o.order_number,'public_code',o.public_code,'table_number',t.table_number,
        'order_type',o.order_type,'ready_at',o.ready_at,'actor',o.created_by_name,'note',o.note,'created_at',o.created_at,
        'cancel_reason',o.cancel_reason,
        'items',coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'note',oi.note,'meta',oi.item_meta,'station_id',oi.station_id) order by oi.created_at)
          from public.zorbas_order_items oi join public.zorbas_menu_items mi on mi.id = oi.menu_item_id
          where oi.order_id = o.id and mi.send_to_kitchen and (p_job_type = 'cancellation' or oi.status <> 'cancelled')),'[]'::jsonb)
      ), 'pending', p_order_id::text || ':' || p_job_type || ':kitchen:' || v_batch
    from public.zorbas_orders o
    left join public.zorbas_restaurant_tables t on t.id = o.table_id
    left join public.zorbas_printers p on p.restaurant_id = v_restaurant and p.code = 'print_2' and p.active
    where o.id = p_order_id;
  end if;
end;
$$;

create or replace function public.sf_admin_list_restaurants()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sf_is_platform_admin(auth.uid()) then raise exception 'Нямате SoulFlame admin права'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',r.id,'code',r.code,'name',r.name,
      'category',case when r.business_type='restaurant' then 'restaurants' when r.business_type='clothes' then 'clothes' else 'ai-boxes' end,
      'business_type',r.business_type,'city',r.city,'siteUrl',r.site_url,
      'status',r.status,'plan',r.plan,'operating_mode',r.operating_mode,
      'staffCount',r.staff_count,'tableCount',r.table_count,'printerCount',r.printer_count,
      'active',r.active,'installerReady',false,
      'bridgeOnline',exists(select 1 from public.sf_restaurant_devices d where d.restaurant_id=r.id and d.status='active' and d.last_seen_at>now()-interval '2 minutes')
    ) order by r.created_at)
    from public.sf_restaurants r
  ),'[]'::jsonb);
end;
$$;

create or replace function public.sf_admin_create_restaurant(
  p_code text,
  p_name text,
  p_business_type text default 'restaurant',
  p_city text default null,
  p_site_url text default null,
  p_plan text default 'Pilot',
  p_staff_count integer default 0,
  p_table_count integer default 0,
  p_printer_count integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_restaurant public.sf_restaurants%rowtype;
  v_code text;
begin
  if not public.sf_is_platform_admin(auth.uid()) then raise exception 'Нямате SoulFlame admin права'; end if;
  v_code := lower(trim(p_code));
  if v_code !~ '^sf-[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Кодът трябва да започва със sf-'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Името е задължително'; end if;
  insert into public.sf_restaurants(
    code,name,business_type,city,site_url,status,plan,operating_mode,
    staff_count,table_count,printer_count,access_code_hash,active
  ) values (
    v_code,trim(p_name),coalesce(nullif(trim(p_business_type),''),'restaurant'),
    nullif(trim(p_city),''),nullif(trim(p_site_url),''),'pilot',coalesce(nullif(trim(p_plan),''),'Pilot'),
    'test_no_print',greatest(coalesce(p_staff_count,0),0),greatest(coalesce(p_table_count,0),0),
    greatest(coalesce(p_printer_count,0),0),encode(extensions.digest(v_code,'sha256'),'hex'),true
  ) returning * into v_restaurant;
  return to_jsonb(v_restaurant) || jsonb_build_object('installerReady',false);
end;
$$;

grant execute on function public.sf_pair_restaurant_device(text,text,text,text,text) to anon, authenticated;
grant execute on function public.sf_bridge_get_config(text,text) to anon, authenticated;
grant execute on function public.sf_bridge_heartbeat(text,text,text,text,jsonb) to anon, authenticated;
grant execute on function public.sf_bridge_claim_next_print_job(text,text,text) to anon, authenticated;
grant execute on function public.sf_bridge_ack_print_job(text,text,uuid,text,text,jsonb) to anon, authenticated;
grant execute on function public.zorbas_list_print_jobs_v4(text,text) to anon, authenticated;
grant execute on function public.zorbas_claim_print_job_v4(text,uuid) to anon, authenticated;
grant execute on function public.zorbas_ack_print_job_v4(text,uuid,text,text) to anon, authenticated;
grant execute on function public.sf_admin_list_restaurants() to authenticated;
grant execute on function public.sf_admin_create_restaurant(text,text,text,text,text,text,integer,integer,integer) to authenticated;