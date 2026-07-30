-- Zorbas exact operating floor and photographed Print 1 / Print 2 routing.
-- Does not touch Tremol, COM ports or the legacy iCashPOS application.

do $$
declare
  v_restaurant uuid;
  v_hall uuid;
  v_garden uuid;
  v_upper uuid;
begin
  select id into v_restaurant from public.sf_restaurants where code = 'sf-zorbas' limit 1;
  if v_restaurant is null then raise exception 'Restaurant sf-zorbas was not found'; end if;

  select id into v_hall from public.zorbas_floor_areas
  where restaurant_id=v_restaurant and code in ('hall','inside')
  order by case when code='hall' then 0 else 1 end limit 1;
  if v_hall is null then
    insert into public.zorbas_floor_areas(restaurant_id,code,name,map_width,map_height,sort_order,active)
    values(v_restaurant,'hall','ЗАЛА',100,70,10,true) returning id into v_hall;
  else
    update public.zorbas_floor_areas set code='hall',name='ЗАЛА',map_width=100,map_height=70,sort_order=10,active=true,updated_at=now() where id=v_hall;
  end if;

  select id into v_garden from public.zorbas_floor_areas
  where restaurant_id=v_restaurant and code in ('garden','terrace')
  order by case when code='garden' then 0 else 1 end limit 1;
  if v_garden is null then
    insert into public.zorbas_floor_areas(restaurant_id,code,name,map_width,map_height,sort_order,active)
    values(v_restaurant,'garden','ГРАДИНА',100,70,20,true) returning id into v_garden;
  else
    update public.zorbas_floor_areas set code='garden',name='ГРАДИНА',map_width=100,map_height=70,sort_order=20,active=true,updated_at=now() where id=v_garden;
  end if;

  select id into v_upper from public.zorbas_floor_areas
  where restaurant_id=v_restaurant and code in ('upper_hall','upstairs')
  order by case when code='upper_hall' then 0 else 1 end limit 1;
  if v_upper is null then
    insert into public.zorbas_floor_areas(restaurant_id,code,name,map_width,map_height,sort_order,active)
    values(v_restaurant,'upper_hall','ГОРНА ЗАЛА',100,70,30,true) returning id into v_upper;
  else
    update public.zorbas_floor_areas set code='upper_hall',name='ГОРНА ЗАЛА',map_width=100,map_height=70,sort_order=30,active=true,updated_at=now() where id=v_upper;
  end if;

  update public.zorbas_floor_areas set active=false,updated_at=now()
  where restaurant_id=v_restaurant and id not in (v_hall,v_garden,v_upper);

  update public.zorbas_restaurant_tables set area_id=v_garden,active=true,updated_at=now()
  where restaurant_id=v_restaurant and table_number in ('1','2','3','4','5','6','7','8');
  update public.zorbas_restaurant_tables set area_id=v_hall,active=true,updated_at=now()
  where restaurant_id=v_restaurant and table_number='10';
  update public.zorbas_restaurant_tables set area_id=v_upper,active=true,updated_at=now()
  where restaurant_id=v_restaurant and table_number in ('100','110','120','130');

  insert into public.zorbas_restaurant_tables(restaurant_id,area_id,table_number,seats,shape,x,y,width,height,rotation,status,active)
  select v_restaurant,v_hall,v.table_number,v.seats,'rectangle',v.x,v.y,18,13,0,'free',true
  from (values ('20',4,41::numeric,14::numeric),('30',4,68,14),('40',4,14,48),('50',4,41,48),('60',4,68,48),('70',4,41,76)) v(table_number,seats,x,y)
  where not exists(select 1 from public.zorbas_restaurant_tables t where t.restaurant_id=v_restaurant and t.area_id=v_hall and t.table_number=v.table_number);

  insert into public.zorbas_restaurant_tables(restaurant_id,area_id,table_number,seats,shape,x,y,width,height,rotation,status,active)
  select v_restaurant,v_garden,v.table_number,v.seats,'custom',v.x,v.y,15,13,0,'free',true
  from (values ('ТЕРАСА',6,62::numeric,58::numeric),('НАВЕС',6,81,58)) v(table_number,seats,x,y)
  where not exists(select 1 from public.zorbas_restaurant_tables t where t.restaurant_id=v_restaurant and t.area_id=v_garden and t.table_number=v.table_number);

  insert into public.zorbas_restaurant_tables(restaurant_id,area_id,table_number,seats,shape,x,y,width,height,rotation,status,active)
  select v_restaurant,v_upper,'ПАКЕТ',1,'custom',62,55,20,14,0,'free',true
  where not exists(select 1 from public.zorbas_restaurant_tables t where t.restaurant_id=v_restaurant and t.area_id=v_upper and t.table_number='ПАКЕТ');

  update public.zorbas_restaurant_tables set
    x=case table_number when '10' then 14 when '20' then 41 when '30' then 68 when '40' then 14 when '50' then 41 when '60' then 68 when '70' then 41 end,
    y=case table_number when '10' then 14 when '20' then 14 when '30' then 14 when '40' then 48 when '50' then 48 when '60' then 48 when '70' then 76 end,
    width=18,height=13,shape='rectangle',active=true,updated_at=now()
  where restaurant_id=v_restaurant and area_id=v_hall and table_number in ('10','20','30','40','50','60','70');

  update public.zorbas_restaurant_tables set
    x=case table_number when '1' then 5 when '2' then 24 when '3' then 43 when '4' then 62 when '5' then 81 when '6' then 5 when '7' then 24 when '8' then 43 when 'ТЕРАСА' then 62 when 'НАВЕС' then 81 end,
    y=case when table_number in ('1','2','3','4','5') then 18 else 58 end,
    width=15,height=13,active=true,updated_at=now()
  where restaurant_id=v_restaurant and area_id=v_garden and table_number in ('1','2','3','4','5','6','7','8','ТЕРАСА','НАВЕС');

  update public.zorbas_restaurant_tables set
    x=case table_number when '100' then 12 when '110' then 39 when '120' then 66 when '130' then 25 when 'ПАКЕТ' then 62 end,
    y=case when table_number in ('100','110','120') then 18 else 55 end,
    width=case when table_number='ПАКЕТ' then 20 else 18 end,height=14,active=true,updated_at=now()
  where restaurant_id=v_restaurant and area_id=v_upper and table_number in ('100','110','120','130','ПАКЕТ');

  update public.zorbas_restaurant_tables t set active=false,updated_at=now()
  where t.restaurant_id=v_restaurant and not (
    (t.area_id=v_hall and t.table_number in ('10','20','30','40','50','60','70')) or
    (t.area_id=v_garden and t.table_number in ('1','2','3','4','5','6','7','8','ТЕРАСА','НАВЕС')) or
    (t.area_id=v_upper and t.table_number in ('100','110','120','130','ПАКЕТ'))
  );

  update public.zorbas_kitchen_stations set printer_key='print_2',updated_at=now()
  where restaurant_id=v_restaurant and active;

  update public.zorbas_menu_items mi set
    send_to_kitchen=not(c.code in ('soft_drinks','beer','draft_wine','rakia','ouzo','vodka','whisky','gin','drinks')),
    updated_at=now()
  from public.zorbas_menu_categories c
  where mi.restaurant_id=v_restaurant and mi.category_id=c.id and mi.active and mi.deleted_at is null;

  update public.zorbas_menu_items set price_pending=true,updated_at=now()
  where restaurant_id=v_restaurant and active and deleted_at is null and coalesce(price,0)<=0;

  update public.zorbas_menu_items mi set price=v.price,price_pending=false,updated_at=now()
  from (values
    ('ДЗАДЗИКИ'::text,4.09::numeric),('ПРЕСНИ ПЪРЖЕНИ КАРТОФИ СЪС СИРЕНЕ',4.45),
    ('КАЛМАРИ ПАНЕ',11.56),('МИДИ ПАНЕ',6.60),('ПОР. ПИЛ. ПЪРЖОЛА',9.15),
    ('ВОДА БАНКЯ 1 Л',1.99),('КОКА КОЛА',1.84),('ЧАША БЯЛО ВИНО',3.12)
  ) v(name,price)
  where mi.restaurant_id=v_restaurant and upper(trim(mi.name))=v.name;

  update public.zorbas_printers set name='Принтер 1 · БАР / сервитьори',destination='staff',connection_type='system',connection_value='POS-80C',model='POS-80C',paper_width_mm=80,active=true,updated_at=now()
  where restaurant_id=v_restaurant and code='print_1';
  update public.zorbas_printers set name='Принтер 2 · КУХНЯ · 192.168.0.98:9100',destination='kitchen',connection_type='system',connection_value='kitchen',model='POS-80C',paper_width_mm=80,active=true,updated_at=now()
  where restaurant_id=v_restaurant and code='print_2';

  update public.sf_restaurants set table_count=22,printer_count=2,
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('floor_profile','icash-exact-v1','print_profile','bar-full-kitchen-food-v1','price_source','supplied-receipt-only'),updated_at=now()
  where id=v_restaurant;

  insert into public.zorbas_live_updates(restaurant_id,version,updated_at) values(v_restaurant,1,now())
  on conflict(restaurant_id) do update set version=public.zorbas_live_updates.version+1,updated_at=excluded.updated_at;
end;
$$;

-- Every order: one full copy to BAR, plus one food-only copy to KITCHEN.
create or replace function public.zorbas_private_queue_prints(p_order_id uuid,p_route text,p_job_type text)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare
  v_template uuid;
  v_restaurant uuid;
  v_batch text;
begin
  select restaurant_id into v_restaurant from public.zorbas_orders where id=p_order_id;
  if v_restaurant is null then raise exception 'Поръчката няма ресторант'; end if;
  select id into v_template from public.zorbas_print_templates where restaurant_id=v_restaurant and active order by created_at limit 1;
  v_batch:=encode(extensions.gen_random_bytes(12),'hex');

  insert into public.zorbas_print_jobs(restaurant_id,order_id,printer_id,template_id,job_type,destination,payload,status,idempotency_key)
  select v_restaurant,o.id,p.id,v_template,p_job_type,'staff',jsonb_build_object(
    'destination','staff','order_id',o.id,'order_number',o.order_number,'public_code',o.public_code,
    'table_number',t.table_number,'order_type',o.order_type,'ready_at',o.ready_at,'actor',o.created_by_name,
    'note',o.note,'subtotal',o.subtotal,'created_at',o.created_at,'cancel_reason',o.cancel_reason,
    'items',coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'unit_price',oi.unit_price,'note',oi.note,'meta',oi.item_meta) order by oi.created_at)
      from public.zorbas_order_items oi where oi.order_id=o.id and (p_job_type='cancellation' or oi.status<>'cancelled')),'[]'::jsonb)
  ),'pending',p_order_id::text||':'||p_job_type||':staff:'||v_batch
  from public.zorbas_orders o
  left join public.zorbas_restaurant_tables t on t.id=o.table_id
  left join public.zorbas_printers p on p.restaurant_id=v_restaurant and p.code='print_1' and p.active
  where o.id=p_order_id;

  if p_job_type='cancellation' or exists(
    select 1 from public.zorbas_order_items oi join public.zorbas_menu_items mi on mi.id=oi.menu_item_id
    where oi.order_id=p_order_id and mi.send_to_kitchen and oi.status<>'cancelled'
  ) then
    insert into public.zorbas_print_jobs(restaurant_id,order_id,printer_id,template_id,job_type,destination,payload,status,idempotency_key)
    select v_restaurant,o.id,p.id,v_template,p_job_type,'kitchen',jsonb_build_object(
      'destination','kitchen','order_id',o.id,'order_number',o.order_number,'public_code',o.public_code,
      'table_number',t.table_number,'order_type',o.order_type,'ready_at',o.ready_at,'actor',o.created_by_name,
      'note',o.note,'created_at',o.created_at,'cancel_reason',o.cancel_reason,
      'items',coalesce((select jsonb_agg(jsonb_build_object('id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'note',oi.note,'meta',oi.item_meta,'station_id',oi.station_id) order by oi.created_at)
        from public.zorbas_order_items oi join public.zorbas_menu_items mi on mi.id=oi.menu_item_id
        where oi.order_id=o.id and mi.send_to_kitchen and (p_job_type='cancellation' or oi.status<>'cancelled')),'[]'::jsonb)
    ),'pending',p_order_id::text||':'||p_job_type||':kitchen:'||v_batch
    from public.zorbas_orders o
    left join public.zorbas_restaurant_tables t on t.id=o.table_id
    left join public.zorbas_printers p on p.restaurant_id=v_restaurant and p.code='print_2' and p.active
    where o.id=p_order_id;
  end if;
end;
$$;

revoke all on function public.zorbas_private_queue_prints(uuid,text,text) from public,anon,authenticated;
