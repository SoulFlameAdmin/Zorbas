-- ZORBAS Bridge claim-mode binding v1
-- The mode used by the database to select a print job travels with the claim.
-- Bridge must decide simulation vs physical output from this authoritative value,
-- never only from its periodically cached configuration.

create or replace function public.sf_bridge_claim_next_print_job(
  p_device_id text,
  p_device_token text,
  p_destination text
)
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

  insert into public.sf_print_job_attempts(
    restaurant_id,print_job_id,device_id,attempt_no,status,metadata
  )
  values(
    v_restaurant,v_job.id,v_device,v_job.attempts,'claimed',
    jsonb_build_object('operating_mode_at_claim',v_mode)
  );

  return to_jsonb(v_job) || jsonb_build_object('operating_mode',v_mode);
end;
$function$;
