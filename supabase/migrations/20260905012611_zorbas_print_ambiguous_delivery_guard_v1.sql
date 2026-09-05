create or replace function public.sf_bridge_claim_next_print_job(p_device_id text, p_device_token text, p_destination text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_device uuid;
  v_restaurant uuid;
  v_mode text;
  v_job public.zorbas_print_jobs%rowtype;
begin
  if p_destination not in ('staff','kitchen') then
    raise exception 'Невалидна печатна дестинация';
  end if;

  v_device := public.sf_private_bridge_device(p_device_id,p_device_token);

  select d.restaurant_id,r.operating_mode
    into v_restaurant,v_mode
  from public.sf_restaurant_devices d
  join public.sf_restaurants r on r.id=d.restaurant_id
  where d.id=v_device;

  if v_mode='legacy' then return null; end if;

  with ambiguous as (
    update public.zorbas_print_jobs j
    set status='failed',
        last_error='[AMBIGUOUS_PRINT] Печатът е стигнал до изпращане/печат, но крайният резултат не е потвърден. Провери физическия принтер преди ръчно повторение.',
        claimed_by_device_id=null,
        claimed_by_session_id=null,
        claim_expires_at=null,
        updated_at=now()
    where j.restaurant_id=v_restaurant
      and j.destination=p_destination
      and j.status in ('sending','printing')
      and j.claimed_by_device_id is not null
      and j.claim_expires_at is not null
      and j.claim_expires_at<now()
    returning j.id,j.attempts,j.claimed_by_device_id
  )
  insert into public.sf_print_job_attempts(restaurant_id,print_job_id,device_id,attempt_no,status,error_message,metadata)
  select v_restaurant,a.id,coalesce(a.claimed_by_device_id,v_device),a.attempts,'failed',
         '[AMBIGUOUS_PRINT] Изтекъл lease след физическо изпращане/печат.',
         jsonb_build_object('ambiguity','unknown_physical_outcome','auto_retry',false)
  from ambiguous a;

  with candidate as (
    select j.id
    from public.zorbas_print_jobs j
    where j.restaurant_id=v_restaurant
      and j.destination=p_destination
      and j.available_at<=now()
      and j.attempts<j.max_attempts
      and (
        v_mode in ('parallel','soulflame')
        or (v_mode='test_no_print' and j.job_type='test')
      )
      and (
        j.status in ('pending','retrying')
        or (
          j.status in ('claimed','preparing')
          and j.claim_expires_at is not null
          and j.claim_expires_at<now()
        )
      )
    order by j.priority desc,j.created_at
    for update skip locked
    limit 1
  )
  update public.zorbas_print_jobs j
  set status='claimed',
      claimed_by_device_id=v_device,
      claimed_by_session_id=null,
      claimed_at=now(),
      claim_expires_at=now()+interval '45 seconds',
      attempts=j.attempts+1,
      updated_at=now(),
      last_error=null
  where j.id=(select id from candidate)
  returning j.* into v_job;

  if v_job.id is null then return null; end if;

  insert into public.sf_print_job_attempts(restaurant_id,print_job_id,device_id,attempt_no,status)
  values(v_restaurant,v_job.id,v_device,v_job.attempts,'claimed');

  return to_jsonb(v_job);
end;
$function$;

create or replace function public.sf_bridge_ack_print_job(p_device_id text, p_device_token text, p_job_id uuid, p_status text, p_error text default null::text, p_metadata jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_device uuid;
  v_restaurant uuid;
  v_job public.zorbas_print_jobs%rowtype;
begin
  if p_status not in ('preparing','sending','printing','printed','failed','retrying','cancelled') then raise exception 'Невалиден печатен статус'; end if;
  v_device := public.sf_private_bridge_device(p_device_id, p_device_token);
  select restaurant_id into v_restaurant from public.sf_restaurant_devices where id = v_device;
  update public.zorbas_print_jobs j
  set status = p_status,
      last_error = nullif(trim(coalesce(p_error,'')),''),
      printed_at = case when p_status = 'printed' then now() else j.printed_at end,
      available_at = case when p_status = 'retrying' then now() + interval '5 seconds' else j.available_at end,
      claim_expires_at = case
        when p_status='preparing' then now()+interval '45 seconds'
        when p_status in ('sending','printing') then now()+interval '120 seconds'
        else null end,
      claimed_by_device_id = case when p_status in ('preparing','sending','printing') then v_device else null end,
      claimed_by_session_id = null,
      updated_at = now()
  where j.id = p_job_id and j.restaurant_id = v_restaurant and j.claimed_by_device_id = v_device
  returning j.* into v_job;
  if v_job.id is null then raise exception 'Задачата не е взета от това Bridge устройство'; end if;
  insert into public.sf_print_job_attempts(restaurant_id, print_job_id, device_id, attempt_no, status, error_message, metadata)
  values(v_restaurant, v_job.id, v_device, v_job.attempts, p_status, nullif(trim(coalesce(p_error,'')),''), coalesce(p_metadata,'{}'::jsonb));
  return jsonb_build_object('ok',true,'job',to_jsonb(v_job));
end;
$function$;

create or replace function public.zorbas_claim_print_job_v4(p_token text, p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session uuid;
  v_restaurant uuid;
  v_job public.zorbas_print_jobs%rowtype;
begin
  v_session := public.zorbas_private_session_id(p_token,false);
  select restaurant_id into v_restaurant from public.zorbas_app_sessions where id = v_session;
  update public.zorbas_print_jobs j
  set status = 'claimed',
      claimed_by_session_id = v_session,
      claimed_by_device_id = null,
      claimed_at = now(),
      claim_expires_at = now() + interval '45 seconds',
      attempts = j.attempts + 1,
      last_error = null,
      updated_at = now()
  where j.id = p_job_id
    and j.restaurant_id = v_restaurant
    and j.attempts < j.max_attempts
    and (
      j.status in ('pending','retrying','failed')
      or (j.status in ('claimed','preparing') and j.claim_expires_at is not null and j.claim_expires_at < now())
    )
  returning j.* into v_job;
  if v_job.id is null then raise exception 'Задачата вече е взета, има непотвърден физически печат или е изчерпала опитите'; end if;
  insert into public.sf_print_job_attempts(restaurant_id, print_job_id, session_id, attempt_no, status)
  values(v_restaurant, v_job.id, v_session, v_job.attempts, 'claimed');
  return to_jsonb(v_job);
end;
$function$;

create or replace function public.zorbas_ack_print_job_v4(p_token text, p_job_id uuid, p_status text, p_error text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session uuid;
  v_restaurant uuid;
  v_job public.zorbas_print_jobs%rowtype;
begin
  v_session := public.zorbas_private_session_id(p_token,false);
  select restaurant_id into v_restaurant from public.zorbas_app_sessions where id = v_session;
  if p_status not in ('preparing','sending','printing','printed','failed','retrying','cancelled') then raise exception 'Невалиден печатен статус'; end if;
  update public.zorbas_print_jobs j
  set status = p_status,
      last_error = nullif(trim(coalesce(p_error,'')),''),
      printed_at = case when p_status = 'printed' then now() else j.printed_at end,
      available_at = case when p_status = 'retrying' then now() + interval '5 seconds' else j.available_at end,
      claim_expires_at = case
        when p_status='preparing' then now()+interval '45 seconds'
        when p_status in ('sending','printing') then now()+interval '120 seconds'
        else null end,
      claimed_by_session_id = case when p_status in ('preparing','sending','printing') then v_session else null end,
      claimed_by_device_id = null,
      updated_at = now()
  where j.id = p_job_id and j.restaurant_id = v_restaurant and j.claimed_by_session_id = v_session
  returning j.* into v_job;
  if v_job.id is null then raise exception 'Задачата не е взета от тази сесия'; end if;
  insert into public.sf_print_job_attempts(restaurant_id, print_job_id, session_id, attempt_no, status, error_message)
  values(v_restaurant, v_job.id, v_session, v_job.attempts, p_status, nullif(trim(coalesce(p_error,'')),''));
  return jsonb_build_object('ok',true,'job',to_jsonb(v_job));
end;
$function$;

create or replace function public.zorbas_list_print_jobs_v4(p_token text, p_destination text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session uuid;
  v_restaurant uuid;
begin
  v_session := public.zorbas_private_session_id(p_token,false);
  select restaurant_id into v_restaurant from public.zorbas_app_sessions where id = v_session;

  with ambiguous as (
    update public.zorbas_print_jobs j
    set status='failed',
        last_error='[AMBIGUOUS_PRINT] Браузърният печат не е потвърден. Провери физическия принтер преди ръчно повторение.',
        claimed_by_session_id=null,
        claim_expires_at=null,
        updated_at=now()
    where j.restaurant_id=v_restaurant
      and j.destination=p_destination
      and j.claimed_by_session_id=v_session
      and j.status in ('sending','printing')
      and j.claim_expires_at is not null
      and j.claim_expires_at<now()
    returning j.id,j.attempts
  )
  insert into public.sf_print_job_attempts(restaurant_id,print_job_id,session_id,attempt_no,status,error_message)
  select v_restaurant,a.id,v_session,a.attempts,'failed','[AMBIGUOUS_PRINT] Изтекъл browser print lease.'
  from ambiguous a;

  return coalesce((
    select jsonb_agg(to_jsonb(j) order by j.priority desc, j.created_at)
    from public.zorbas_print_jobs j
    where j.restaurant_id = v_restaurant
      and j.destination = p_destination
      and j.created_at > now() - interval '48 hours'
      and (
        j.status in ('pending','retrying','failed')
        or (j.claimed_by_session_id = v_session and j.status in ('claimed','preparing','sending','printing'))
      )
  ), '[]'::jsonb);
end;
$function$;
