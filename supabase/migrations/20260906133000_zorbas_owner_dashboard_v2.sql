create or replace function public.zorbas_admin_dashboard_v1(
  p_token text,
  p_from timestamptz,
  p_to timestamptz
) returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_session uuid;
  v_restaurant uuid;
begin
  v_session:=public.zorbas_private_require_manager(p_token,true);
  select restaurant_id into v_restaurant from public.zorbas_app_sessions where id=v_session;

  return jsonb_build_object(
    'from',p_from,'to',p_to,
    'orders_count',(select count(*) from public.zorbas_orders o where o.restaurant_id=v_restaurant and o.created_at>=p_from and o.created_at<p_to),
    'completed_orders',(select count(*) from public.zorbas_orders o where o.restaurant_id=v_restaurant and o.manager_state='completed' and coalesce(o.manager_completed_at,o.updated_at)>=p_from and coalesce(o.manager_completed_at,o.updated_at)<p_to),
    'visits_count',(select count(*) from public.zorbas_table_visits v where v.restaurant_id=v_restaurant and v.opened_at>=p_from and v.opened_at<p_to),
    'completed_visits',(select count(*) from public.zorbas_table_visits v where v.restaurant_id=v_restaurant and v.status='completed' and coalesce(v.closed_at,v.updated_at)>=p_from and coalesce(v.closed_at,v.updated_at)<p_to),
    'gross_total',(select coalesce(sum(o.subtotal),0) from public.zorbas_orders o where o.restaurant_id=v_restaurant and o.created_at>=p_from and o.created_at<p_to and o.status<>'cancelled'),
    'cancelled_total',(select coalesce(sum(o.subtotal),0) from public.zorbas_orders o where o.restaurant_id=v_restaurant and o.created_at>=p_from and o.created_at<p_to and o.status='cancelled'),
    'net_total',(select coalesce(sum(o.subtotal),0) from public.zorbas_orders o where o.restaurant_id=v_restaurant and o.created_at>=p_from and o.created_at<p_to and o.status not in ('cancelled','returned')),
    'average_bill',(select coalesce(avg(o.subtotal),0) from public.zorbas_orders o where o.restaurant_id=v_restaurant and o.created_at>=p_from and o.created_at<p_to and o.status not in ('cancelled','returned')),
    'dine_in_count',(select count(*) from public.zorbas_orders o where o.restaurant_id=v_restaurant and o.created_at>=p_from and o.created_at<p_to and o.order_type='dine_in'),
    'pickup_count',(select count(*) from public.zorbas_orders o where o.restaurant_id=v_restaurant and o.created_at>=p_from and o.created_at<p_to and o.order_type='pickup'),
    'corrections_count',(select count(*) from public.zorbas_order_revisions r where r.restaurant_id=v_restaurant and r.created_at>=p_from and r.created_at<p_to),
    'tables',(select coalesce(jsonb_agg(to_jsonb(x) order by x.visits desc,x.table_number),'[]'::jsonb) from (
      select t.id,t.table_number,count(v.id) visits,
        coalesce(sum(extract(epoch from (coalesce(v.closed_at,p_to)-v.opened_at))/60),0)::integer occupied_minutes,
        coalesce(avg(extract(epoch from (coalesce(v.closed_at,p_to)-v.opened_at))/60),0)::numeric(12,1) avg_minutes,
        coalesce(sum(o.total),0) total
      from public.zorbas_restaurant_tables t
      left join public.zorbas_table_visits v on v.table_id=t.id and v.opened_at>=p_from and v.opened_at<p_to
      left join lateral (
        select coalesce(sum(ord.subtotal),0) total
        from public.zorbas_orders ord
        where ord.visit_id=v.id and ord.status not in ('cancelled','returned')
      ) o on true
      where t.restaurant_id=v_restaurant
      group by t.id,t.table_number
    ) x),
    'top_items',(select coalesce(jsonb_agg(to_jsonb(x) order by x.quantity desc),'[]'::jsonb) from (
      select oi.item_name,sum(oi.quantity) quantity,sum(oi.quantity*oi.unit_price) total
      from public.zorbas_order_items oi
      join public.zorbas_orders o on o.id=oi.order_id
      where o.restaurant_id=v_restaurant and o.created_at>=p_from and o.created_at<p_to
        and oi.status<>'cancelled' and o.status not in ('cancelled','returned')
      group by oi.item_name
      order by sum(oi.quantity) desc
      limit 30
    ) x),
    'by_hour',(select coalesce(jsonb_agg(to_jsonb(x) order by x.hour_key),'[]'::jsonb) from (
      select extract(hour from o.created_at at time zone 'Europe/Sofia')::int hour_key,
        count(*) orders,coalesce(sum(o.subtotal),0) total
      from public.zorbas_orders o
      where o.restaurant_id=v_restaurant and o.created_at>=p_from and o.created_at<p_to
      group by 1
    ) x),
    'by_waiter',(select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc,x.waiter_name),'[]'::jsonb) from (
      select
        o.created_by_name waiter_name,
        count(*)::integer notes,
        coalesce(sum((select coalesce(sum(oi.quantity),0) from public.zorbas_order_items oi where oi.order_id=o.id and oi.status<>'cancelled')),0) item_quantity,
        coalesce(sum(o.subtotal) filter (where o.status not in ('cancelled','returned')),0) total,
        coalesce(avg(o.subtotal) filter (where o.status not in ('cancelled','returned')),0) average_note,
        coalesce(sum((select count(*) from public.zorbas_order_revisions r where r.order_id=o.id)),0)::integer corrections,
        count(*) filter (where o.status='cancelled')::integer cancelled_notes
      from public.zorbas_orders o
      where o.restaurant_id=v_restaurant
        and o.created_at>=p_from and o.created_at<p_to
        and o.source_channel='restaurant'
        and nullif(trim(coalesce(o.created_by_name,'')),'') is not null
      group by o.created_by_name
    ) x)
  );
end;
$$;
