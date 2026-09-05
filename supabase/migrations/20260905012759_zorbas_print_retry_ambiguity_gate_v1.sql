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
  v_current_status text;
  v_effective_status text;
  v_effective_error text;
begin
  if p_status not in ('preparing','sending','printing','printed','failed','retrying','cancelled') then raise exception 'Невалиден печатен статус'; end if;
  v_device := public.sf_private_bridge_device(p_device_id, p_device_token);
  select restaurant_id into v_restaurant from public.sf_restaurant_devices where id = v_device;

  select j.status into v_current_status
  from public.zorbas_print_jobs j
  where j.id=p_job_id and j.restaurant_id=v_restaurant and j.claimed_by_device_id=v_device
  for update;
  if v_current_status is null then raise exception 'Задачата не е взета от това Bridge устройство'; end if;

  v_effective_status := p_status;
  v_effective_error := nullif(trim(coalesce(p_error,'')),'');

  if p_status='retrying'
     and v_current_status in ('sending','printing')
     and coalesce(v_effective_error,'') not like '[SAFE_NO_OUTPUT]%' then
    v_effective_status := 'failed';
    if coalesce(v_effective_error,'') not like '[AMBIGUOUS_PRINT]%' then
      v_effective_error := '[AMBIGUOUS_PRINT] ' || coalesce(v_effective_error,'Крайният физически резултат не е потвърден.');
    end if;
  end if;

  update public.zorbas_print_jobs j
  set status = v_effective_status,
      last_error = v_effective_error,
      printed_at = case when v_effective_status = 'printed' then now() else j.printed_at end,
      available_at = case when v_effective_status = 'retrying' then now() + interval '5 seconds' else j.available_at end,
      claim_expires_at = case
        when v_effective_status='preparing' then now()+interval '45 seconds'
        when v_effective_status in ('sending','printing') then now()+interval '120 seconds'
        else null end,
      claimed_by_device_id = case when v_effective_status in ('preparing','sending','printing') then v_device else null end,
      claimed_by_session_id = null,
      updated_at = now()
  where j.id = p_job_id and j.restaurant_id = v_restaurant and j.claimed_by_device_id = v_device
  returning j.* into v_job;

  insert into public.sf_print_job_attempts(restaurant_id, print_job_id, device_id, attempt_no, status, error_message, metadata)
  values(v_restaurant, v_job.id, v_device, v_job.attempts, v_effective_status, v_effective_error,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object(
      'requested_status',p_status,
      'physical_retry_guard',v_effective_status<>p_status
    ));
  return jsonb_build_object('ok',true,'job',to_jsonb(v_job));
end;
$function$;
