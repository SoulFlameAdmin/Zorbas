-- Multiple active guest groups per table, guest-specific bills and waiter edits.

drop index if exists public.zorbas_table_visits_one_active_idx;

with ranked as (
  select id,
         row_number() over (partition by restaurant_id, table_id order by opened_at, id)::integer as guest_no
  from public.zorbas_table_visits
  where status='active'
)
update public.zorbas_table_visits v
set visit_number=ranked.guest_no,
    guest_label='Гост '||ranked.guest_no,
    updated_at=now()
from ranked
where v.id=ranked.id;

create index if not exists zorbas_table_visits_active_table_idx
  on public.zorbas_table_visits(restaurant_id,table_id,opened_at)
  where status='active';

create unique index if not exists zorbas_table_visits_active_guest_number_idx
  on public.zorbas_table_visits(restaurant_id,table_id,visit_number)
  where status='active';

create or replace function public.zorbas_private_open_guest_visit(p_session uuid,p_table_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_restaurant uuid;
  v_actor text;
  v_visit uuid;
  v_number integer;
  v_table uuid;
begin
  select restaurant_id,display_name into v_restaurant,v_actor
  from public.zorbas_app_sessions where id=p_session;
  if v_restaurant is null then raise exception 'Невалидна сесия'; end if;

  select id into v_table from public.zorbas_restaurant_tables
  where id=p_table_id and restaurant_id=v_restaurant and active;
  if v_table is null then raise exception 'Масата не е намерена'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text,0));

  select coalesce(max(visit_number),0)+1 into v_number
  from public.zorbas_table_visits
  where restaurant_id=v_restaurant and table_id=p_table_id and status='active';

  insert into public.zorbas_table_visits(
    restaurant_id,table_id,visit_number,guest_label,status,opened_by_session,opened_by_name
  ) values (
    v_restaurant,p_table_id,v_number,'Гост '||v_number,'active',p_session,v_actor
  ) returning id into v_visit;

  update public.zorbas_restaurant_tables
  set status='occupied',updated_at=now()
  where id=p_table_id;

  insert into public.zorbas_manager_events(restaurant_id,visit_id,session_id,actor_name,event_type,payload)
  values(v_restaurant,v_visit,p_session,v_actor,'open_guest',jsonb_build_object('table_id',p_table_id,'guest_number',v_number));

  return v_visit;
end;
$$;

revoke all on function public.zorbas_private_open_guest_visit(uuid,uuid) from public,anon,authenticated;

create or replace function public.zorbas_create_order_v4(
  p_token text,
  p_table_id uuid,
  p_visit_id uuid,
  p_open_new_guest boolean,
  p_order_type text,
  p_customer_name text,
  p_customer_phone text,
  p_ready_at timestamptz,
  p_note text,
  p_items jsonb,
  p_route text
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_session uuid; v_actor text; v_restaurant uuid; v_order uuid; v_visit uuid;
  v_item record; v_menu record; v_code text; v_sequence integer:=1;
  v_kind text:='new'; v_manager_required boolean:=false; v_guest_label text;
begin
  v_session:=public.zorbas_private_session_id(p_token,false);
  select display_name,restaurant_id into v_actor,v_restaurant
  from public.zorbas_app_sessions where id=v_session;

  if p_order_type not in ('dine_in','pickup') then raise exception 'Невалиден тип поръчка'; end if;
  if p_route not in ('staff','kitchen','both') then raise exception 'Изберете къде да се изпрати'; end if;
  if p_order_type='dine_in' and p_table_id is null then raise exception 'Изберете маса'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Добавете продукти'; end if;

  if exists(
    select 1 from jsonb_to_recordset(p_items) x(menu_item_id uuid,quantity numeric,note text,meta jsonb)
    join public.zorbas_menu_items mi on mi.id=x.menu_item_id
    where mi.restaurant_id=v_restaurant and (mi.price_pending or mi.price is null or mi.price<=0)
  ) then raise exception 'Има продукт без потвърдена цена. Задайте цена от Управление → Меню.'; end if;

  if p_order_type='dine_in' then
    perform pg_advisory_xact_lock(hashtextextended(p_table_id::text,0));

    if p_visit_id is not null then
      select id,guest_label into v_visit,v_guest_label
      from public.zorbas_table_visits
      where id=p_visit_id and restaurant_id=v_restaurant and table_id=p_table_id and status='active'
      for update;
      if v_visit is null then raise exception 'Избраните гости вече са приключени. Обнови масата.'; end if;
    elsif coalesce(p_open_new_guest,false) then
      v_visit:=public.zorbas_private_open_guest_visit(v_session,p_table_id);
    else
      select id,guest_label into v_visit,v_guest_label
      from public.zorbas_table_visits
      where restaurant_id=v_restaurant and table_id=p_table_id and status='active'
      order by opened_at desc limit 1
      for update;
      if v_visit is null then
        v_visit:=public.zorbas_private_open_guest_visit(v_session,p_table_id);
      end if;
    end if;

    select guest_label into v_guest_label from public.zorbas_table_visits where id=v_visit;
    select coalesce(max(visit_sequence),0)+1 into v_sequence
    from public.zorbas_orders where visit_id=v_visit;
    v_kind:=case when v_sequence=1 then 'new' else 'addition' end;
  end if;

  v_code:=upper(substr(encode(extensions.gen_random_bytes(6),'hex'),1,8));
  insert into public.zorbas_orders(
    restaurant_id,table_id,visit_id,order_type,status,customer_name,customer_phone,ready_at,note,
    source_channel,public_code,print_route,created_by_session,created_by_name,manager_state,revision,
    visit_sequence,order_kind,manager_required
  ) values (
    v_restaurant,p_table_id,v_visit,p_order_type,'sent',nullif(trim(coalesce(p_customer_name,'')),''),
    nullif(trim(coalesce(p_customer_phone,'')),''),p_ready_at,nullif(trim(coalesce(p_note,'')),''),
    'restaurant',v_code,p_route,v_session,v_actor,'active',1,v_sequence,v_kind,true
  ) returning id into v_order;

  for v_item in select * from jsonb_to_recordset(p_items) x(menu_item_id uuid,quantity numeric,note text,meta jsonb) loop
    select mi.*,mis.station_id into v_menu
    from public.zorbas_menu_items mi
    left join public.zorbas_menu_item_stations mis on mis.menu_item_id=mi.id and mis.is_primary
    where mi.id=v_item.menu_item_id and mi.active and mi.deleted_at is null and mi.restaurant_id=v_restaurant;
    if v_menu.id is null then raise exception 'Невалиден продукт'; end if;
    if v_menu.price_pending or v_menu.price is null or v_menu.price<=0 then
      raise exception 'Продуктът няма потвърдена цена: %',v_menu.name;
    end if;

    insert into public.zorbas_order_items(
      restaurant_id,order_id,menu_item_id,station_id,item_name,quantity,unit_price,note,item_meta,status,
      manager_state,send_to_kitchen_snapshot,delivered_quantity
    ) values (
      v_restaurant,v_order,v_menu.id,v_menu.station_id,v_menu.name,greatest(coalesce(v_item.quantity,1),0.01),
      v_menu.price,nullif(trim(coalesce(v_item.note,'')),''),coalesce(v_item.meta,'{}'::jsonb),'sent',
      case when v_menu.send_to_kitchen then 'new' else 'delivered' end,v_menu.send_to_kitchen,
      case when v_menu.send_to_kitchen then 0 else greatest(coalesce(v_item.quantity,1),0.01) end
    );
    v_manager_required:=v_manager_required or v_menu.send_to_kitchen;
  end loop;

  update public.zorbas_orders o
  set subtotal=(select coalesce(sum(quantity*unit_price),0) from public.zorbas_order_items where order_id=o.id and status<>'cancelled'),
      manager_required=v_manager_required,
      manager_state=case when v_manager_required then 'active' else 'completed' end,
      manager_completed_at=case when v_manager_required then null else now() end,
      updated_at=now()
  where id=v_order;

  if p_table_id is not null then
    update public.zorbas_restaurant_tables set status='occupied',updated_at=now() where id=p_table_id;
  end if;

  perform public.zorbas_private_queue_prints(v_order,p_route,case when v_kind='new' then 'order' else 'addition' end);
  insert into public.zorbas_audit_log(restaurant_id,session_id,actor_name,action,entity_type,entity_id,payload)
  values(v_restaurant,v_session,v_actor,'create_order','order',v_order::text,
    jsonb_build_object('route',p_route,'type',p_order_type,'visit_id',v_visit,'visit_sequence',v_sequence,'order_kind',v_kind));

  return jsonb_build_object('id',v_order,'code',v_code,'visit_id',v_visit,'guest_label',v_guest_label,
    'visit_sequence',v_sequence,'order_kind',v_kind);
end;
$$;

revoke all on function public.zorbas_create_order_v4(text,uuid,uuid,boolean,text,text,text,timestamptz,text,jsonb,text) from public;
grant execute on function public.zorbas_create_order_v4(text,uuid,uuid,boolean,text,text,text,timestamptz,text,jsonb,text) to anon,authenticated,service_role;

create or replace function public.zorbas_staff_edit_order_v1(
  p_token text,
  p_order_id uuid,
  p_expected_revision integer,
  p_items jsonb,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session uuid; v_restaurant uuid; v_order public.zorbas_orders%rowtype;
  v_change record; v_item public.zorbas_order_items%rowtype; v_result jsonb;
  v_has_kitchen boolean; v_has_pending boolean;
begin
  v_session:=public.zorbas_private_session_id(p_token,false);
  select restaurant_id into v_restaurant from public.zorbas_app_sessions where id=v_session;

  select * into v_order from public.zorbas_orders
  where id=p_order_id and restaurant_id=v_restaurant for update;
  if v_order.id is null then raise exception 'Бележката не е намерена'; end if;
  if v_order.status in ('completed','cancelled','returned') then raise exception 'Приключена бележка не може да се редактира'; end if;
  if jsonb_typeof(p_items)<>'array' then raise exception 'Невалидни редове'; end if;

  for v_change in select * from jsonb_to_recordset(p_items) x(id uuid,quantity numeric) loop
    select * into v_item from public.zorbas_order_items
    where id=v_change.id and order_id=v_order.id for update;
    if v_item.id is null then raise exception 'Редът не е намерен'; end if;
    if v_change.quantity is null or v_change.quantity<0 then raise exception 'Невалидно количество'; end if;
    if v_item.send_to_kitchen_snapshot and v_change.quantity<v_item.delivered_quantity then
      raise exception 'Не може да намалиш % под вече издадените %',v_item.item_name,v_item.delivered_quantity;
    end if;
  end loop;

  v_result:=public.zorbas_edit_order_v1(p_token,p_order_id,p_expected_revision,p_items,p_reason);

  update public.zorbas_order_items
  set manager_state=case
        when status='cancelled' then 'cancelled'
        when not send_to_kitchen_snapshot then 'delivered'
        when delivered_quantity>=quantity then 'delivered'
        when delivered_quantity>0 then 'sent'
        else 'new'
      end,
      manager_version=manager_version+1,
      updated_at=now()
  where order_id=p_order_id;

  select
    exists(select 1 from public.zorbas_order_items where order_id=p_order_id and send_to_kitchen_snapshot and status<>'cancelled'),
    exists(select 1 from public.zorbas_order_items where order_id=p_order_id and send_to_kitchen_snapshot and status<>'cancelled' and delivered_quantity<quantity)
  into v_has_kitchen,v_has_pending;

  update public.zorbas_orders
  set manager_required=v_has_kitchen,
      manager_state=case when v_has_pending then 'active' else 'completed' end,
      manager_completed_at=case when v_has_pending then null else coalesce(manager_completed_at,now()) end,
      updated_at=now()
  where id=p_order_id;

  return v_result||jsonb_build_object('manager_state',case when v_has_pending then 'active' else 'completed' end);
end;
$$;

revoke all on function public.zorbas_staff_edit_order_v1(text,uuid,integer,jsonb,text) from public;
grant execute on function public.zorbas_staff_edit_order_v1(text,uuid,integer,jsonb,text) to anon,authenticated,service_role;

create or replace function public.zorbas_print_and_close_guest_v1(p_token text,p_visit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session uuid; v_actor text; v_restaurant uuid; v_visit public.zorbas_table_visits%rowtype;
  v_bill jsonb; v_remaining integer; v_table_freed boolean;
begin
  v_session:=public.zorbas_private_session_id(p_token,false);
  select display_name,restaurant_id into v_actor,v_restaurant
  from public.zorbas_app_sessions where id=v_session;

  select * into v_visit from public.zorbas_table_visits
  where id=p_visit_id and restaurant_id=v_restaurant and status='active'
  for update;
  if v_visit.id is null then raise exception 'Гостите вече са приключени или не са намерени'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_visit.table_id::text,0));

  if exists(
    select 1
    from public.zorbas_orders o
    join public.zorbas_order_items oi on oi.order_id=o.id
    where o.visit_id=v_visit.id and o.status not in ('cancelled','returned','completed')
      and oi.status<>'cancelled' and oi.send_to_kitchen_snapshot
      and oi.delivered_quantity<oi.quantity
  ) then raise exception 'Първо издай всички кухненски артикули за тези гости'; end if;

  update public.zorbas_orders
  set manager_state='completed',manager_completed_at=coalesce(manager_completed_at,now()),updated_at=now()
  where visit_id=v_visit.id and status not in ('cancelled','returned','completed');

  v_bill:=public.zorbas_print_visit_bill_v1(p_token,v_visit.id);

  update public.zorbas_orders set status='completed',updated_at=now()
  where visit_id=v_visit.id and status not in ('completed','cancelled','returned');

  update public.zorbas_table_visits
  set status='completed',bill_status='paid',paid_at=now(),paid_by_session=v_session,paid_by_name=v_actor,
      closed_at=now(),archived_at=now(),closed_by_session=v_session,closed_by_name=v_actor,
      version=version+1,updated_at=now()
  where id=v_visit.id;

  select count(*) into v_remaining
  from public.zorbas_table_visits
  where restaurant_id=v_restaurant and table_id=v_visit.table_id and status='active';
  v_table_freed:=v_remaining=0;

  update public.zorbas_restaurant_tables
  set status=case when v_table_freed then 'free' else 'occupied' end,updated_at=now()
  where id=v_visit.table_id;

  if v_table_freed then
    update public.zorbas_reservations set status='completed',updated_at=now()
    where restaurant_id=v_restaurant and table_id=v_visit.table_id and status='seated';
  end if;

  insert into public.zorbas_manager_events(restaurant_id,visit_id,session_id,actor_name,event_type,payload)
  values(v_restaurant,v_visit.id,v_session,v_actor,'paid_close_guest',
    jsonb_build_object('bill_total',v_bill->'subtotal','remaining_guests',v_remaining,'table_freed',v_table_freed));

  return jsonb_build_object('ok',true,'visit_id',v_visit.id,'table_id',v_visit.table_id,
    'guest_label',v_visit.guest_label,'subtotal',v_bill->'subtotal','print_number',v_bill->'print_number',
    'remaining_guests',v_remaining,'table_freed',v_table_freed);
end;
$$;

revoke all on function public.zorbas_print_and_close_guest_v1(text,uuid) from public;
grant execute on function public.zorbas_print_and_close_guest_v1(text,uuid) to anon,authenticated,service_role;
