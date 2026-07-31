-- Keep older table workflows compatible with multiple active guest groups.

create or replace function public.zorbas_private_get_or_open_visit(p_session uuid,p_table_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_restaurant uuid;
  v_actor text;
  v_visit uuid;
begin
  select restaurant_id,display_name into v_restaurant,v_actor
  from public.zorbas_app_sessions where id=p_session;
  if v_restaurant is null then raise exception 'Невалидна сесия'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text,0));

  select id into v_visit
  from public.zorbas_table_visits
  where restaurant_id=v_restaurant and table_id=p_table_id and status='active'
  order by opened_at desc limit 1
  for update;

  if v_visit is not null then return v_visit; end if;
  return public.zorbas_private_open_guest_visit(p_session,p_table_id);
end;
$$;

revoke all on function public.zorbas_private_get_or_open_visit(uuid,uuid) from public,anon,authenticated;

create or replace function public.zorbas_close_visit_v1(p_token text,p_table_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_session uuid; v_actor text; v_restaurant uuid; v_visit public.zorbas_table_visits%rowtype;
  v_remaining integer; v_table_freed boolean;
begin
  v_session:=public.zorbas_private_session_id(p_token,false);
  select display_name,restaurant_id into v_actor,v_restaurant from public.zorbas_app_sessions where id=v_session;
  perform pg_advisory_xact_lock(hashtextextended(p_table_id::text,0));

  select * into v_visit from public.zorbas_table_visits
  where restaurant_id=v_restaurant and table_id=p_table_id and status='active'
  order by opened_at desc limit 1 for update;
  if v_visit.id is null then raise exception 'Няма активно посещение'; end if;

  if exists(select 1 from public.zorbas_orders where visit_id=v_visit.id and manager_required
    and manager_state<>'completed' and status not in ('cancelled','returned')) then
    raise exception 'Първо приключи кухненските бележки в Manager';
  end if;
  if v_visit.bill_printed_at is null then raise exception 'Първо отпечатай сметката за тези гости'; end if;

  update public.zorbas_orders set status='completed',updated_at=now()
  where visit_id=v_visit.id and status not in ('completed','cancelled','returned');

  update public.zorbas_table_visits set status='completed',bill_status='paid',paid_at=now(),
    paid_by_session=v_session,paid_by_name=v_actor,closed_at=now(),archived_at=now(),
    closed_by_session=v_session,closed_by_name=v_actor,version=version+1,updated_at=now()
  where id=v_visit.id;

  select count(*) into v_remaining from public.zorbas_table_visits
  where restaurant_id=v_restaurant and table_id=p_table_id and status='active';
  v_table_freed:=v_remaining=0;

  update public.zorbas_restaurant_tables
  set status=case when v_table_freed then 'free' else 'occupied' end,updated_at=now()
  where id=p_table_id;

  if v_table_freed then
    update public.zorbas_reservations set status='completed',updated_at=now()
    where restaurant_id=v_restaurant and table_id=p_table_id and status='seated';
  end if;

  insert into public.zorbas_manager_events(restaurant_id,visit_id,session_id,actor_name,event_type,payload)
  values(v_restaurant,v_visit.id,v_session,v_actor,'paid_close_visit',
    jsonb_build_object('bill_total',v_visit.bill_total,'remaining_guests',v_remaining,'table_freed',v_table_freed));

  return jsonb_build_object('ok',true,'visit_id',v_visit.id,'table_id',p_table_id,
    'remaining_guests',v_remaining,'table_freed',v_table_freed);
end;
$$;
