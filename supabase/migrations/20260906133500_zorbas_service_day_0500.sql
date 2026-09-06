create or replace function public.zorbas_private_service_day_start(p_at timestamptz default now())
returns timestamptz
language sql
stable
security definer
set search_path='public'
as $$
  select case
    when (p_at at time zone 'Europe/Sofia')::time >= time '05:00'
      then (((p_at at time zone 'Europe/Sofia')::date + time '05:00') at time zone 'Europe/Sofia')
    else ((((p_at at time zone 'Europe/Sofia')::date - 1) + time '05:00') at time zone 'Europe/Sofia')
  end;
$$;

revoke execute on function public.zorbas_private_service_day_start(timestamptz) from public, anon, authenticated;
grant execute on function public.zorbas_private_service_day_start(timestamptz) to service_role;

create or replace function public.zorbas_private_visit_is_live(p_restaurant_id uuid, p_visit_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select exists(
    select 1
    from public.zorbas_table_visits v
    where v.id=p_visit_id
      and v.restaurant_id=p_restaurant_id
      and v.status='active'
      and v.opened_at>=public.zorbas_private_service_day_start(now())
  );
$$;

create or replace function public.zorbas_private_table_has_live_records(p_restaurant_id uuid, p_table_id uuid)
returns boolean
language sql
stable
security definer
set search_path='public'
as $$
  select
    exists(
      select 1 from public.zorbas_table_visits v
      where v.restaurant_id=p_restaurant_id and v.table_id=p_table_id
        and public.zorbas_private_visit_is_live(p_restaurant_id,v.id)
    )
    or exists(
      select 1 from public.zorbas_orders o
      where o.restaurant_id=p_restaurant_id and o.table_id=p_table_id
        and o.order_type='dine_in'
        and o.created_at>=public.zorbas_private_service_day_start(now())
        and o.status not in ('cancelled','completed','returned')
    )
    or exists(
      select 1 from public.zorbas_reservations r
      where r.restaurant_id=p_restaurant_id and r.table_id=p_table_id
        and r.status='seated'
        and r.start_at>=public.zorbas_private_service_day_start(now())
        and r.end_at>now()
    );
$$;

create or replace function public.zorbas_public_availability(p_date date, p_time time without time zone, p_duration_minutes integer default 120)
returns jsonb
language sql
stable
security definer
set search_path='public'
as $$
with q as (
  select ((p_date+p_time) at time zone 'Europe/Sofia') as s,
         ((p_date+p_time) at time zone 'Europe/Sofia')+make_interval(mins=>p_duration_minutes) as e
), table_states as (
  select t.*,
    case
      when t.status='blocked' then 'blocked'
      when (
        (
          (t.status in ('occupied','cleaning') and t.updated_at>=public.zorbas_private_service_day_start(now()))
          or public.zorbas_private_table_has_live_records(t.restaurant_id,t.id)
        )
        and (select s from q)<now()+interval '3 hours'
        and (select e from q)>now()-interval '15 minutes'
      ) then 'occupied'
      when exists(
        select 1 from public.zorbas_reservations r,q
        where r.restaurant_id=t.restaurant_id and r.table_id=t.id and r.status='seated' and r.start_at<q.e and r.end_at>q.s
      ) then 'occupied'
      when exists(
        select 1 from public.zorbas_reservations r,q
        where r.restaurant_id=t.restaurant_id and r.table_id=t.id and r.status in ('requested','confirmed') and r.start_at<q.e and r.end_at>q.s
      ) then 'reserved'
      else 'available'
    end display_state
  from public.zorbas_restaurant_tables t
  where t.active and t.restaurant_id=public.sf_default_restaurant_id()
)
select coalesce(jsonb_agg(jsonb_build_object(
  'id',ts.id,'area_id',ts.area_id,'table_number',ts.table_number,'seats',ts.seats,
  'shape',ts.shape,'x',ts.x,'y',ts.y,'width',ts.width,'height',ts.height,'rotation',ts.rotation,
  'state',ts.display_state,'available',ts.display_state='available'
) order by ts.table_number),'[]'::jsonb)
from table_states ts;
$$;

create or replace function public.zorbas_public_reserve(
  p_name text,
  p_phone text,
  p_guests integer,
  p_date date,
  p_time time without time zone,
  p_duration_minutes integer,
  p_table_id uuid,
  p_note text default null::text
) returns jsonb
language plpgsql
security definer
set search_path='public','extensions'
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_id uuid;
  v_code text;
  v_seats integer;
  v_status text;
  v_restaurant uuid:=public.sf_default_restaurant_id();
  v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
begin
  if length(trim(coalesce(p_name,'')))<2 then raise exception 'Въведете име'; end if;
  if length(v_phone)<8 then raise exception 'Въведете валиден телефон'; end if;
  if p_guests<1 or p_guests>50 then raise exception 'Невалиден брой гости'; end if;

  if (
    select count(*)
    from public.zorbas_reservations r
    where r.restaurant_id=v_restaurant
      and r.source='web'
      and r.created_at>now()-interval '15 minutes'
      and regexp_replace(coalesce(r.customer_phone,''),'[^0-9+]','','g')=v_phone
  )>=4 then
    raise exception 'Твърде много резервации за кратко време. Опитайте отново след 15 минути.';
  end if;

  v_start:=((p_date+p_time) at time zone 'Europe/Sofia');
  v_end:=v_start+make_interval(mins=>p_duration_minutes);
  if v_start<now()-interval '5 minutes' then raise exception 'Избраният час е минал'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text,0));

  select seats,status into v_seats,v_status from public.zorbas_restaurant_tables
  where id=p_table_id and active and restaurant_id=v_restaurant;
  if v_seats is null or v_status='blocked' then raise exception 'Масата е недостъпна'; end if;
  if p_guests>v_seats then raise exception 'Масата няма достатъчно места'; end if;

  if v_start<now()+interval '3 hours' and v_end>now()-interval '15 minutes' and (
    exists(
      select 1 from public.zorbas_restaurant_tables t
      where t.id=p_table_id and t.restaurant_id=v_restaurant
        and t.status in ('occupied','cleaning')
        and t.updated_at>=public.zorbas_private_service_day_start(now())
    )
    or public.zorbas_private_table_has_live_records(v_restaurant,p_table_id)
  ) then raise exception 'Масата е заета за този час'; end if;

  if exists(select 1 from public.zorbas_reservations
    where restaurant_id=v_restaurant and table_id=p_table_id
      and status in ('requested','confirmed','seated') and start_at<v_end and end_at>v_start
  ) then raise exception 'Масата вече е резервирана за този час'; end if;

  v_code:=upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
  insert into public.zorbas_reservations(
    restaurant_id,table_id,customer_name,customer_phone,guests,start_at,end_at,status,source,note,public_code
  ) values (
    v_restaurant,p_table_id,trim(p_name),trim(p_phone),p_guests,v_start,v_end,'confirmed','web',nullif(trim(coalesce(p_note,'')),''),v_code
  ) returning id into v_id;
  return jsonb_build_object('id',v_id,'code',v_code,'start_at',v_start,'end_at',v_end);
end;
$$;

create or replace function public.zorbas_staff_snapshot(p_token text)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_session uuid;
  v_restaurant uuid;
  v_day_start timestamptz;
begin
  v_session:=public.zorbas_private_session_id(p_token,false);
  select restaurant_id into v_restaurant from public.zorbas_app_sessions where id=v_session;
  v_day_start:=public.zorbas_private_service_day_start(now());

  return jsonb_build_object(
   'session',(select jsonb_build_object('id',s.id,'display_name',s.display_name,'role',a.role,'admin_unlocked',s.admin_unlocked_until>now(),'expires_at',s.expires_at)
      from public.zorbas_app_sessions s join public.zorbas_staff_accounts a on a.id=s.account_id where s.id=v_session),
   'live',(select public.zorbas_live_version()),
   'staff',(select coalesce(jsonb_agg(jsonb_build_object('name',x.display_name,'started_at',x.started_at) order by x.display_name),'[]'::jsonb)
      from (select distinct on (lower(w.display_name)) w.display_name,w.started_at from public.zorbas_work_shifts w
        where w.restaurant_id=v_restaurant and w.ended_at is null order by lower(w.display_name),w.started_at desc) x),
   'visits',(select coalesce(jsonb_agg(to_jsonb(v) order by v.opened_at desc),'[]'::jsonb)
      from public.zorbas_table_visits v
      where v.restaurant_id=v_restaurant and v.opened_at>=v_day_start),
   'areas',(select coalesce(jsonb_agg(to_jsonb(a) order by a.sort_order),'[]'::jsonb) from public.zorbas_floor_areas a where a.active and a.restaurant_id=v_restaurant),
   'tables',(
     select coalesce(jsonb_agg(
       to_jsonb(t) || jsonb_build_object(
         'live_state',case
           when t.status='blocked' then 'blocked'
           when public.zorbas_private_table_has_live_records(v_restaurant,t.id)
             or (t.status in ('occupied','cleaning') and t.updated_at>=v_day_start) then 'occupied'
           when r.id is not null then 'reserved'
           else 'available' end,
         'reservation_id',r.id,'reservation_start_at',r.start_at,'reservation_end_at',r.end_at,'reservation_guests',r.guests,
         'active_visit_id',(select tv.id from public.zorbas_table_visits tv
           where tv.restaurant_id=v_restaurant and tv.table_id=t.id and tv.status='active'
             and public.zorbas_private_visit_is_live(v_restaurant,tv.id)
           order by tv.opened_at desc limit 1),
         'guest_label',(select tv.guest_label from public.zorbas_table_visits tv
           where tv.restaurant_id=v_restaurant and tv.table_id=t.id and tv.status='active'
             and public.zorbas_private_visit_is_live(v_restaurant,tv.id)
           order by tv.opened_at desc limit 1)
       ) order by t.table_number
     ),'[]'::jsonb)
     from public.zorbas_restaurant_tables t
     left join lateral (
       select rr.id,rr.start_at,rr.end_at,rr.guests from public.zorbas_reservations rr
       where rr.restaurant_id=v_restaurant and rr.table_id=t.id and rr.status in ('requested','confirmed')
         and rr.start_at<now()+interval '2 hours' and rr.end_at>now()
       order by rr.start_at limit 1
     ) r on true
     where t.active and t.restaurant_id=v_restaurant
   ),
   'categories',(select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order),'[]'::jsonb) from public.zorbas_menu_categories c where c.active and c.restaurant_id=v_restaurant),
   'stations',(select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order),'[]'::jsonb) from public.zorbas_kitchen_stations s where s.active and s.restaurant_id=v_restaurant),
   'items',(select coalesce(jsonb_agg(jsonb_build_object('id',mi.id,'code',mi.code,'name',mi.name,'description',mi.short_description,'price',mi.price,'price_pending',mi.price_pending,'image_url',mi.image_url,'category_id',mi.category_id,'quantity_mode',mi.quantity_mode,'default_piece_count',mi.default_piece_count,'includes_fries',mi.includes_fries,'option_schema',mi.option_schema,'available_for_pickup',mi.available_for_pickup,'send_to_kitchen',mi.send_to_kitchen,'active',mi.active,'ar_status',mi.ar_status,'station_id',mis.station_id) order by mi.sort_order,mi.name),'[]'::jsonb)
      from public.zorbas_menu_items mi left join public.zorbas_menu_item_stations mis on mis.menu_item_id=mi.id and mis.is_primary
      where mi.deleted_at is null and mi.restaurant_id=v_restaurant),
   'orders',(
     select coalesce(jsonb_agg(jsonb_build_object(
       'id',o.id,'order_number',o.order_number,'table_id',o.table_id,'visit_id',o.visit_id,'order_type',o.order_type,
       'status',o.status,'manager_state',o.manager_state,'manager_required',o.manager_required,
       'manager_completed_at',o.manager_completed_at,'manager_completed_by_name',o.manager_completed_by_name,
       'visit_sequence',o.visit_sequence,'order_kind',o.order_kind,
       'revision',o.revision,'source_channel',o.source_channel,'ready_at',o.ready_at,'public_code',o.public_code,
       'print_route',o.print_route,'created_by_name',o.created_by_name,'customer_name',o.customer_name,
       'customer_phone',o.customer_phone,'note',o.note,'subtotal',o.subtotal,'reservation_id',o.reservation_id,
       'created_at',o.created_at,
       'items',(select coalesce(jsonb_agg(to_jsonb(oi) order by oi.created_at),'[]'::jsonb) from public.zorbas_order_items oi where oi.order_id=o.id),
       'revisions',(select coalesce(jsonb_agg(to_jsonb(rv) order by rv.revision desc),'[]'::jsonb) from public.zorbas_order_revisions rv where rv.order_id=o.id)
     ) order by o.created_at desc),'[]'::jsonb)
     from public.zorbas_orders o
     where o.restaurant_id=v_restaurant
       and o.created_at>=v_day_start
       and (o.status<>'completed' or o.manager_completed_at>=v_day_start)
   ),
   'reservations',(select coalesce(jsonb_agg(to_jsonb(rr) order by rr.start_at),'[]'::jsonb)
      from public.zorbas_reservations rr where rr.restaurant_id=v_restaurant
        and rr.start_at>=v_day_start and rr.start_at<now()+interval '7 days'
        and rr.status not in ('completed','cancelled','no_show')),
   'print_jobs',(select coalesce(jsonb_agg(to_jsonb(j) order by j.created_at desc),'[]'::jsonb)
      from public.zorbas_print_jobs j where j.restaurant_id=v_restaurant and j.created_at>now()-interval '12 hours')
  );
end;
$$;
