-- ZORBAS public pickup hardening v1
-- Backend is authoritative: website orders cannot contain pending/zero-priced items
-- and public quantities are limited to the same 1..99 range as the UI.

create or replace function public.zorbas_public_pickup(
  p_name text,
  p_phone text,
  p_ready_at timestamptz,
  p_items jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_order uuid;
  v_item record;
  v_menu record;
  v_code text;
  v_restaurant uuid := public.sf_default_restaurant_id();
  v_phone text := regexp_replace(coalesce(p_phone,''),'[^0-9+]','','g');
  v_quantity numeric;
begin
  if length(trim(coalesce(p_name,''))) < 2 or length(trim(coalesce(p_name,''))) > 120 or length(v_phone) < 8 or length(v_phone) > 24 then
    raise exception 'Въведете валидно име и телефон';
  end if;

  if p_ready_at is null or p_ready_at < now() then
    raise exception 'Часът за вземане е минал';
  end if;

  if p_ready_at > now() + interval '14 days' then
    raise exception 'Часът за вземане е твърде далеч напред';
  end if;

  if length(trim(coalesce(p_note,''))) > 500 then
    raise exception 'Бележката е твърде дълга';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Добавете поне един продукт';
  end if;

  if jsonb_array_length(p_items) > 100 then
    raise exception 'Твърде много позиции в една поръчка';
  end if;

  if (
    select count(*)
    from public.zorbas_orders o
    where o.restaurant_id = v_restaurant
      and o.order_type = 'pickup'
      and o.source_channel = 'website'
      and o.created_at > now() - interval '15 minutes'
      and regexp_replace(coalesce(o.customer_phone,''),'[^0-9+]','','g') = v_phone
  ) >= 5 then
    raise exception 'Твърде много поръчки за кратко време. Опитайте отново след 15 минути.';
  end if;

  -- Validate and lock every menu row before the order is created. This keeps
  -- an invalid cart from leaving a partial order and prevents a concurrent
  -- price edit between validation and insertion.
  for v_item in
    select *
    from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity numeric, note text, meta jsonb)
  loop
    if v_item.menu_item_id is null then
      raise exception 'Невалиден продукт';
    end if;

    v_quantity := coalesce(v_item.quantity, 1);
    if v_quantity < 1 or v_quantity > 99 or v_quantity <> trunc(v_quantity) then
      raise exception 'Невалидно количество. Позволени са цели бройки от 1 до 99.';
    end if;

    if length(trim(coalesce(v_item.note,''))) > 160 then
      raise exception 'Уточнението към продукт е твърде дълго';
    end if;

    select mi.id, mi.name, mi.price, mi.price_pending
      into v_menu
    from public.zorbas_menu_items mi
    where mi.id = v_item.menu_item_id
      and mi.restaurant_id = v_restaurant
      and mi.active
      and mi.available_for_pickup
    for share;

    if v_menu.id is null then
      raise exception 'Невалиден продукт';
    end if;

    if coalesce(v_menu.price_pending, false) or coalesce(v_menu.price, 0) <= 0 then
      raise exception 'Продуктът "%" няма потвърдена цена', v_menu.name;
    end if;
  end loop;

  v_code := upper(substr(encode(gen_random_bytes(6),'hex'),1,8));

  insert into public.zorbas_orders(
    restaurant_id, order_type, status, customer_name, customer_phone, note,
    source_channel, ready_at, public_code, print_route, created_by_name
  )
  values(
    v_restaurant, 'pickup', 'sent', trim(p_name), trim(p_phone),
    nullif(trim(coalesce(p_note,'')),''), 'website', p_ready_at, v_code,
    'both', 'Онлайн · За вкъщи'
  )
  returning id into v_order;

  for v_item in
    select *
    from jsonb_to_recordset(p_items) as x(menu_item_id uuid, quantity numeric, note text, meta jsonb)
  loop
    select
      mi.id,
      mi.name,
      mi.price,
      (
        select mis.station_id
        from public.zorbas_menu_item_stations mis
        where mis.menu_item_id = mi.id and mis.is_primary
        limit 1
      ) as station_id
      into v_menu
    from public.zorbas_menu_items mi
    where mi.id = v_item.menu_item_id
      and mi.restaurant_id = v_restaurant;

    insert into public.zorbas_order_items(
      restaurant_id, order_id, menu_item_id, station_id, item_name,
      quantity, unit_price, note, item_meta, status
    )
    values(
      v_restaurant, v_order, v_menu.id, v_menu.station_id, v_menu.name,
      coalesce(v_item.quantity, 1), v_menu.price,
      nullif(trim(coalesce(v_item.note,'')),''), coalesce(v_item.meta,'{}'::jsonb), 'sent'
    );
  end loop;

  update public.zorbas_orders o
  set subtotal = (
        select coalesce(sum(quantity * unit_price), 0)
        from public.zorbas_order_items
        where restaurant_id = v_restaurant and order_id = o.id
      ),
      updated_at = now()
  where id = v_order and restaurant_id = v_restaurant;

  perform public.zorbas_private_queue_prints(v_order, 'both', 'pickup');

  return jsonb_build_object(
    'order_id', v_order,
    'code', v_code,
    'status', 'sent',
    'ready_at', p_ready_at
  );
end;
$function$;
