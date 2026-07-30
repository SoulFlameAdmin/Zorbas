-- Applied to production through Supabase migration: sf_bridge_operating_mode_v4.

create or replace function public.sf_bridge_set_operating_mode(
  p_device_id text,
  p_device_token text,
  p_mode text
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
  if p_mode not in ('legacy','test_no_print','parallel','soulflame') then
    raise exception 'Невалиден режим';
  end if;

  v_device := public.sf_private_bridge_device(p_device_id, p_device_token);
  select restaurant_id into v_restaurant
  from public.sf_restaurant_devices
  where id = v_device;

  update public.sf_restaurants
  set operating_mode = p_mode,
      updated_at = now()
  where id = v_restaurant;

  return jsonb_build_object(
    'ok', true,
    'restaurant_id', v_restaurant,
    'operating_mode', p_mode,
    'updated_at', now()
  );
end;
$$;

grant execute on function public.sf_bridge_set_operating_mode(text,text,text) to anon, authenticated;