-- Route drinks only to Print 1 (BAR) and food only to Print 2 (KITCHEN).
-- Print 2 is a LAN ESC/POS printer at 192.168.0.98:9100.

update public.zorbas_printers
set name='Принтер 2 · КУХНЯ · 192.168.0.98:9100',
    destination='kitchen',
    connection_type='lan',
    connection_value='192.168.0.98:9100',
    model='POS-80C',
    paper_width_mm=80,
    active=true,
    updated_at=now()
where code='print_2'
  and restaurant_id=(select id from public.sf_restaurants where code='sf-zorbas' limit 1);

create or replace function public.zorbas_private_queue_prints(p_order_id uuid,p_route text,p_job_type text)
returns void
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_template uuid;
  v_restaurant uuid;
  v_batch text;
  v_route text := lower(coalesce(nullif(trim(p_route),''),'both'));
begin
  select restaurant_id into v_restaurant
  from public.zorbas_orders
  where id=p_order_id;

  if v_restaurant is null then
    raise exception 'Поръчката няма ресторант';
  end if;

  select id into v_template
  from public.zorbas_print_templates
  where restaurant_id=v_restaurant and active
  order by created_at
  limit 1;

  v_batch:=encode(extensions.gen_random_bytes(12),'hex');

  -- Print 1 / BAR: drinks and all other non-kitchen items only.
  if v_route in ('both','staff','bar','print_1') and exists(
    select 1
    from public.zorbas_order_items oi
    where oi.order_id=p_order_id
      and not coalesce(oi.send_to_kitchen_snapshot,false)
      and (p_job_type='cancellation' or oi.status<>'cancelled')
  ) then
    insert into public.zorbas_print_jobs(
      restaurant_id,order_id,printer_id,template_id,job_type,destination,payload,status,idempotency_key
    )
    select v_restaurant,o.id,p.id,v_template,p_job_type,'staff',
      jsonb_build_object(
        'destination','staff','order_id',o.id,'order_number',o.order_number,'public_code',o.public_code,
        'table_number',t.table_number,'area_name',a.name,'order_type',o.order_type,'ready_at',o.ready_at,
        'actor',o.created_by_name,'note',o.note,'subtotal',o.subtotal,'created_at',o.created_at,
        'cancel_reason',o.cancel_reason,'visit_id',o.visit_id,'visit_number',v.visit_number,
        'guest_label',v.guest_label,'visit_sequence',o.visit_sequence,'order_kind',o.order_kind,
        'bread_required',(o.order_type='dine_in' and o.order_kind='new'),
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'unit_price',oi.unit_price,
            'note',oi.note,'meta',oi.item_meta,'send_to_kitchen',oi.send_to_kitchen_snapshot
          ) order by oi.created_at)
          from public.zorbas_order_items oi
          where oi.order_id=o.id
            and not coalesce(oi.send_to_kitchen_snapshot,false)
            and (p_job_type='cancellation' or oi.status<>'cancelled')
        ),'[]'::jsonb)
      ),'pending',p_order_id::text||':'||p_job_type||':staff:'||v_batch
    from public.zorbas_orders o
    left join public.zorbas_restaurant_tables t on t.id=o.table_id
    left join public.zorbas_floor_areas a on a.id=t.area_id
    left join public.zorbas_table_visits v on v.id=o.visit_id
    left join public.zorbas_printers p on p.restaurant_id=v_restaurant and p.code='print_1' and p.active
    where o.id=p_order_id;
  end if;

  -- Print 2 / KITCHEN: food items only.
  if v_route in ('both','kitchen','print_2') and exists(
    select 1
    from public.zorbas_order_items oi
    where oi.order_id=p_order_id
      and coalesce(oi.send_to_kitchen_snapshot,false)
      and (p_job_type='cancellation' or oi.status<>'cancelled')
  ) then
    insert into public.zorbas_print_jobs(
      restaurant_id,order_id,printer_id,template_id,job_type,destination,payload,status,idempotency_key
    )
    select v_restaurant,o.id,p.id,v_template,p_job_type,'kitchen',
      jsonb_build_object(
        'destination','kitchen','order_id',o.id,'order_number',o.order_number,'public_code',o.public_code,
        'table_number',t.table_number,'area_name',a.name,'order_type',o.order_type,'ready_at',o.ready_at,
        'actor',o.created_by_name,'note',o.note,'created_at',o.created_at,'cancel_reason',o.cancel_reason,
        'visit_id',o.visit_id,'visit_number',v.visit_number,'guest_label',v.guest_label,
        'visit_sequence',o.visit_sequence,'order_kind',o.order_kind,
        'bread_required',(o.order_type='dine_in' and o.order_kind='new'),
        'items',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',oi.id,'name',oi.item_name,'quantity',oi.quantity,'note',oi.note,
            'meta',oi.item_meta,'station_id',oi.station_id
          ) order by oi.created_at)
          from public.zorbas_order_items oi
          where oi.order_id=o.id
            and coalesce(oi.send_to_kitchen_snapshot,false)
            and (p_job_type='cancellation' or oi.status<>'cancelled')
        ),'[]'::jsonb)
      ),'pending',p_order_id::text||':'||p_job_type||':kitchen:'||v_batch
    from public.zorbas_orders o
    left join public.zorbas_restaurant_tables t on t.id=o.table_id
    left join public.zorbas_floor_areas a on a.id=t.area_id
    left join public.zorbas_table_visits v on v.id=o.visit_id
    left join public.zorbas_printers p on p.restaurant_id=v_restaurant and p.code='print_2' and p.active
    where o.id=p_order_id;
  end if;
end;
$$;

revoke all on function public.zorbas_private_queue_prints(uuid,text,text) from public,anon,authenticated;
