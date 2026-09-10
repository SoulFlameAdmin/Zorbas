-- ZORBAS global test_no_print safety gate v1
-- Safety must hold across every print consumer, not only the Windows Bridge UI.
--
-- Invariants:
-- 1) entering test_no_print is rejected until every active Bridge is >= 1.2.4;
-- 2) entering test_no_print is rejected while any unresolved print job or ambiguous
--    physical outcome exists;
-- 3) Bridge claims, browser claims/ACKs and operating-mode changes share an advisory
--    lock so a physical claim/state transition cannot race entry into test_no_print;
-- 4) an unsafe/unknown Bridge cannot claim even a TEST job in test_no_print;
-- 5) browser/session Print Center claims are disabled in test_no_print;
-- 6) a stale browser/session claim cannot advance into a physical print state while
--    test_no_print is active.

create or replace function public.sf_bridge_set_operating_mode(
  p_device_id text,
  p_device_token text,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_device uuid;
  v_restaurant uuid;
  v_current_mode text;
  v_required_version text := '1.2.4';
  v_required_number integer := 1002004;
  v_active_devices integer := 0;
  v_unsafe_devices integer := 0;
  v_unresolved_jobs integer := 0;
  v_ambiguous_jobs integer := 0;
begin
  if p_mode not in ('legacy','test_no_print','parallel','soulflame') then
    raise exception 'Невалиден режим';
  end if;

  v_device := public.sf_private_bridge_device(p_device_id, p_device_token);

  select d.restaurant_id into v_restaurant
  from public.sf_restaurant_devices d
  where d.id = v_device;

  perform pg_advisory_xact_lock(
    hashtextextended('zorbas-print-mode:' || v_restaurant::text, 0)
  );

  select r.operating_mode into v_current_mode
  from public.sf_restaurants r
  where r.id = v_restaurant
  for update;

  if p_mode = v_current_mode then
    return jsonb_build_object(
      'ok', true,
      'restaurant_id', v_restaurant,
      'operating_mode', v_current_mode,
      'unchanged', true,
      'updated_at', now()
    );
  end if;

  if p_mode = 'test_no_print' then
    with versions as (
      select split_part(
        coalesce(nullif(h.app_version,''), nullif(d.app_version,''), ''),
        '+', 1
      ) as version_text
      from public.sf_restaurant_devices d
      left join public.sf_device_heartbeats h on h.device_id = d.id
      where d.restaurant_id = v_restaurant
        and d.status = 'active'
        and d.revoked_at is null
    ), parsed as (
      select case
        when version_text ~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
          split_part(version_text,'.',1)::int * 1000000
          + split_part(version_text,'.',2)::int * 1000
          + split_part(version_text,'.',3)::int
        else null
      end as version_number
      from versions
    )
    select
      count(*),
      count(*) filter (
        where version_number is null or version_number < v_required_number
      )
    into v_active_devices, v_unsafe_devices
    from parsed;

    if v_active_devices = 0 or v_unsafe_devices > 0 then
      raise exception 'TEST_NO_PRINT_REQUIRES_BRIDGE_%: обнови или отмени старите/неизвестни Bridge устройства преди безопасен тест', v_required_version;
    end if;

    select count(*) into v_unresolved_jobs
    from public.zorbas_print_jobs j
    where j.restaurant_id = v_restaurant
      and j.status in ('pending','retrying','claimed','preparing','sending','printing');

    if v_unresolved_jobs > 0 then
      raise exception 'TEST_NO_PRINT_REQUIRES_EMPTY_QUEUE: има % незавършени печатни задачи', v_unresolved_jobs;
    end if;

    select count(*) into v_ambiguous_jobs
    from public.zorbas_print_jobs j
    where j.restaurant_id = v_restaurant
      and j.status = 'failed'
      and coalesce(j.last_error,'') like '[AMBIGUOUS_PRINT]%';

    if v_ambiguous_jobs > 0 then
      raise exception 'TEST_NO_PRINT_REQUIRES_NO_AMBIGUOUS_PRINT: провери и приключи % непотвърдени физически печата', v_ambiguous_jobs;
    end if;
  end if;

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
$function$;

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
  v_version_text text;
  v_version_number integer;
  v_required_number integer := 1002004;
  v_job public.zorbas_print_jobs%rowtype;
begin
  if p_destination not in ('staff','kitchen') then
    raise exception 'Невалидна печатна дестинация';
  end if;

  v_device := public.sf_private_bridge_device(p_device_id,p_device_token);

  select d.restaurant_id into v_restaurant
  from public.sf_restaurant_devices d
  where d.id = v_device;

  perform pg_advisory_xact_lock(
    hashtextextended('zorbas-print-mode:' || v_restaurant::text, 0)
  );

  select
    r.operating_mode,
    split_part(
      coalesce(nullif(h.app_version,''), nullif(d.app_version,''), ''),
      '+', 1
    )
  into v_mode, v_version_text
  from public.sf_restaurant_devices d
  join public.sf_restaurants r on r.id = d.restaurant_id
  left join public.sf_device_heartbeats h on h.device_id = d.id
  where d.id = v_device;

  if v_mode = 'legacy' then
    return null;
  end if;

  if v_version_text ~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
    v_version_number :=
      split_part(v_version_text,'.',1)::int * 1000000
      + split_part(v_version_text,'.',2)::int * 1000
      + split_part(v_version_text,'.',3)::int;
  else
    v_version_number := null;
  end if;

  -- Defense in depth: even if operating_mode was changed outside the guarded RPC,
  -- an old/unknown Bridge receives no TEST job and therefore cannot produce output.
  if v_mode = 'test_no_print'
     and (v_version_number is null or v_version_number < v_required_number) then
    return null;
  end if;

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
  insert into public.sf_print_job_attempts(
    restaurant_id,print_job_id,device_id,attempt_no,status,error_message,metadata
  )
  select
    v_restaurant,a.id,coalesce(a.claimed_by_device_id,v_device),a.attempts,'failed',
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

  if v_job.id is null then
    return null;
  end if;

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

create or replace function public.zorbas_claim_print_job_v4(
  p_token text,
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session uuid;
  v_restaurant uuid;
  v_mode text;
  v_job public.zorbas_print_jobs%rowtype;
begin
  v_session := public.zorbas_private_session_id(p_token,false);

  select s.restaurant_id into v_restaurant
  from public.zorbas_app_sessions s
  where s.id = v_session;

  perform pg_advisory_xact_lock(
    hashtextextended('zorbas-print-mode:' || v_restaurant::text, 0)
  );

  select r.operating_mode into v_mode
  from public.sf_restaurants r
  where r.id = v_restaurant;

  if v_mode = 'test_no_print' then
    raise exception 'TEST_NO_PRINT_BROWSER_CLAIM_BLOCKED: безопасният тест се обработва само от съвместимия Windows Bridge';
  end if;

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
      or (
        j.status in ('claimed','preparing')
        and j.claim_expires_at is not null
        and j.claim_expires_at < now()
      )
    )
  returning j.* into v_job;

  if v_job.id is null then
    raise exception 'Задачата вече е взета, има непотвърден физически печат или е изчерпала опитите';
  end if;

  insert into public.sf_print_job_attempts(
    restaurant_id, print_job_id, session_id, attempt_no, status
  )
  values(v_restaurant, v_job.id, v_session, v_job.attempts, 'claimed');

  return to_jsonb(v_job);
end;
$function$;

create or replace function public.zorbas_ack_print_job_v4(
  p_token text,
  p_job_id uuid,
  p_status text,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_session uuid;
  v_restaurant uuid;
  v_mode text;
  v_job public.zorbas_print_jobs%rowtype;
begin
  v_session := public.zorbas_private_session_id(p_token,false);

  select s.restaurant_id into v_restaurant
  from public.zorbas_app_sessions s
  where s.id = v_session;

  if p_status not in ('preparing','sending','printing','printed','failed','retrying','cancelled') then
    raise exception 'Невалиден печатен статус';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('zorbas-print-mode:' || v_restaurant::text, 0)
  );

  select r.operating_mode into v_mode
  from public.sf_restaurants r
  where r.id = v_restaurant;

  if v_mode = 'test_no_print'
     and p_status in ('preparing','sending','printing','printed') then
    raise exception 'TEST_NO_PRINT_BROWSER_PHYSICAL_STATE_BLOCKED: web Print Center няма право на физически печатен статус';
  end if;

  update public.zorbas_print_jobs j
  set status = p_status,
      last_error = nullif(trim(coalesce(p_error,'')),''),
      printed_at = case when p_status = 'printed' then now() else j.printed_at end,
      available_at = case when p_status = 'retrying' then now() + interval '5 seconds' else j.available_at end,
      claim_expires_at = case
        when p_status='preparing' then now()+interval '45 seconds'
        when p_status in ('sending','printing') then now()+interval '120 seconds'
        else null
      end,
      claimed_by_session_id = case
        when p_status in ('preparing','sending','printing') then v_session
        else null
      end,
      claimed_by_device_id = null,
      updated_at = now()
  where j.id = p_job_id
    and j.restaurant_id = v_restaurant
    and j.claimed_by_session_id = v_session
  returning j.* into v_job;

  if v_job.id is null then
    raise exception 'Задачата не е взета от тази сесия';
  end if;

  insert into public.sf_print_job_attempts(
    restaurant_id, print_job_id, session_id, attempt_no, status, error_message
  )
  values(
    v_restaurant, v_job.id, v_session, v_job.attempts, p_status,
    nullif(trim(coalesce(p_error,'')),'')
  );

  return jsonb_build_object('ok',true,'job',to_jsonb(v_job));
end;
$function$;

-- Explicit role grants; do not leave generic PUBLIC execution on these security-definer RPCs.
revoke all on function public.sf_bridge_set_operating_mode(text,text,text) from public;
revoke all on function public.sf_bridge_claim_next_print_job(text,text,text) from public;
revoke all on function public.zorbas_claim_print_job_v4(text,uuid) from public;
revoke all on function public.zorbas_ack_print_job_v4(text,uuid,text,text) from public;

grant execute on function public.sf_bridge_set_operating_mode(text,text,text) to anon, authenticated, service_role;
grant execute on function public.sf_bridge_claim_next_print_job(text,text,text) to anon, authenticated, service_role;
grant execute on function public.zorbas_claim_print_job_v4(text,uuid) to anon, authenticated, service_role;
grant execute on function public.zorbas_ack_print_job_v4(text,uuid,text,text) to anon, authenticated, service_role;
