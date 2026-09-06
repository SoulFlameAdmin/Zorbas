create or replace function public.zorbas_public_reserve(p_name text, p_phone text, p_guests integer, p_date date, p_time time without time zone, p_duration_minutes integer, p_table_id uuid, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
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
        and t.status in ('occupied','cleaning') and t.updated_at>now()-interval '36 hours'
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
$function$;

create or replace function public.zorbas_public_pickup(p_name text, p_phone text, p_ready_at timestamp with time zone, p_items jsonb, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_order uuid;
  v_item record;
  v_menu record;
  v_code text;
  v_restaurant uuid:=public.sf_default_restaurant_id();
  v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
begin
  if length(trim(coalesce(p_name,'')))<2 or length(v_phone)<8 then raise exception 'Въведете име и телефон'; end if;
  if p_ready_at<now() then raise exception 'Часът за вземане е минал'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Добавете поне един продукт'; end if;

  if (
    select count(*)
    from public.zorbas_orders o
    where o.restaurant_id=v_restaurant
      and o.order_type='pickup'
      and o.source_channel='website'
      and o.created_at>now()-interval '15 minutes'
      and regexp_replace(coalesce(o.customer_phone,''),'[^0-9+]','','g')=v_phone
  )>=5 then
    raise exception 'Твърде много поръчки за кратко време. Опитайте отново след 15 минути.';
  end if;

  v_code:=upper(substr(encode(gen_random_bytes(6),'hex'),1,8));
  insert into public.zorbas_orders(restaurant_id,order_type,status,customer_name,customer_phone,note,source_channel,ready_at,public_code,print_route,created_by_name)
  values(v_restaurant,'pickup','sent',trim(p_name),trim(p_phone),nullif(trim(coalesce(p_note,'')),''),'website',p_ready_at,v_code,'both','Онлайн · За вкъщи') returning id into v_order;

  for v_item in select * from jsonb_to_recordset(p_items) as x(menu_item_id uuid,quantity numeric,note text,meta jsonb) loop
    select mi.*,mis.station_id into v_menu
    from public.zorbas_menu_items mi
    left join public.zorbas_menu_item_stations mis on mis.menu_item_id=mi.id and mis.is_primary
    where mi.id=v_item.menu_item_id and mi.restaurant_id=v_restaurant and mi.active and mi.available_for_pickup;
    if v_menu.id is null then raise exception 'Невалиден продукт'; end if;
    insert into public.zorbas_order_items(restaurant_id,order_id,menu_item_id,station_id,item_name,quantity,unit_price,note,item_meta,status)
    values(v_restaurant,v_order,v_menu.id,v_menu.station_id,v_menu.name,greatest(coalesce(v_item.quantity,1),0.01),v_menu.price,nullif(trim(coalesce(v_item.note,'')),''),coalesce(v_item.meta,'{}'::jsonb),'sent');
  end loop;

  update public.zorbas_orders o
  set subtotal=(select coalesce(sum(quantity*unit_price),0) from public.zorbas_order_items where restaurant_id=v_restaurant and order_id=o.id),updated_at=now()
  where id=v_order and restaurant_id=v_restaurant;
  perform public.zorbas_private_queue_prints(v_order,'both','pickup');
  return jsonb_build_object('order_id',v_order,'code',v_code,'status','sent','ready_at',p_ready_at);
end;
$function$;
