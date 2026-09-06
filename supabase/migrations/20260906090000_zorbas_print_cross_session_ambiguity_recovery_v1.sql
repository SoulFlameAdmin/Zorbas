create or replace function public.zorbas_list_print_jobs_v4(p_token text, p_destination text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  v_restaurant uuid;
begin
  v_session := public.zorbas_private_session_id(p_token,false);
  select restaurant_id into v_restaurant
  from public.zorbas_app_sessions
  where id = v_session;

  if p_destination not in ('staff','kitchen') then
    raise exception 'Невалидна печатна дестинация';
  end if;

  -- Any expired lease after the physical-output boundary is ambiguous, even
  -- when a replacement browser/bridge uses a different staff session.
  -- Quarantine it for manual physical review; never auto-retry it.
  with candidates as (
    select j.id, j.claimed_by_session_id as original_session_id
    from public.zorbas_print_jobs j
    where j.restaurant_id = v_restaurant
      and j.destination = p_destination
      and j.status in ('sending','printing')
      and j.claim_expires_at is not null
      and j.claim_expires_at < now()
  ), ambiguous as (
    update public.zorbas_print_jobs j
    set status = 'failed',
        last_error = '[AMBIGUOUS_PRINT] Изтекъл физически print lease. Провери принтера преди ръчно повторение.',
        claimed_by_session_id = null,
        claimed_by_device_id = null,
        claim_expires_at = null,
        updated_at = now()
    from candidates c
    where j.id = c.id
      and j.restaurant_id = v_restaurant
      and j.destination = p_destination
      and j.status in ('sending','printing')
      and j.claim_expires_at is not null
      and j.claim_expires_at < now()
    returning j.id, j.attempts, c.original_session_id
  )
  insert into public.sf_print_job_attempts(
    restaurant_id, print_job_id, session_id, attempt_no, status, error_message
  )
  select v_restaurant, a.id, a.original_session_id, a.attempts, 'failed',
         '[AMBIGUOUS_PRINT] Изтекъл физически print lease след прекъсване/рестарт.'
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
$$;

revoke all on function public.zorbas_list_print_jobs_v4(text,text) from public;
grant execute on function public.zorbas_list_print_jobs_v4(text,text) to anon, authenticated, service_role;
comment on function public.zorbas_list_print_jobs_v4(text,text) is 'Lists a print destination and quarantines expired sending/printing leases across replacement sessions as ambiguous manual-review failures; never auto-retries physical ambiguity.';
