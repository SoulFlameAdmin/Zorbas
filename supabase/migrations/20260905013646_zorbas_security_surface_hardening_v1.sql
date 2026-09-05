-- Keep internal live-state helpers internal. They are called by SECURITY DEFINER Zorbas RPCs.
revoke execute on function public.zorbas_private_table_has_live_records(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.zorbas_private_visit_is_live(uuid,uuid) from public, anon, authenticated;

-- The public web app writes through SECURITY DEFINER RPCs. Anonymous table writes are unnecessary.
do $block$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname like 'zorbas_%'
  loop
    execute format('revoke all privileges on table public.%I from anon', r.relname);
  end loop;

  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='S' and c.relname like 'zorbas_%'
  loop
    execute format('revoke all privileges on sequence public.%I from anon', r.relname);
  end loop;
end
$block$;

-- Preserve only the explicitly public, RLS-protected read surfaces used by the website/realtime layer.
grant select on table public.zorbas_delivery_poll to anon;
grant select on table public.zorbas_floor_areas to anon;
grant select on table public.zorbas_live_updates to anon;
grant select on table public.zorbas_menu_categories to anon;
grant select on table public.zorbas_menu_item_stations to anon;
grant select on table public.zorbas_menu_items to anon;
grant select on table public.zorbas_restaurant_tables to anon;
