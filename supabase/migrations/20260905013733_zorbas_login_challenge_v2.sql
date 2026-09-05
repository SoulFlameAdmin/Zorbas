create table if not exists public.zorbas_login_challenges(
  id uuid primary key default extensions.gen_random_uuid(),
  rate_key_hash text not null,
  subject_hash text not null,
  device_hash text not null,
  challenge_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table public.zorbas_login_challenges enable row level security;
revoke all privileges on table public.zorbas_login_challenges from public, anon, authenticated;
create index if not exists zorbas_login_challenges_rate_idx on public.zorbas_login_challenges(rate_key_hash,created_at desc);
create index if not exists zorbas_login_challenges_expiry_idx on public.zorbas_login_challenges(expires_at);

create or replace function public.zorbas_login_challenge(p_username text, p_device_id text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  v_username text:=lower(trim(coalesce(p_username,'')));
  v_device text:=coalesce(nullif(trim(coalesce(p_device_id,'')),''),'unknown-device');
  v_headers jsonb:='{}'::jsonb;
  v_ip text;
  v_subject_hash text;
  v_device_hash text;
  v_rate_key text;
  v_raw text;
  v_count integer;
begin
  if length(v_username)<1 or length(v_username)>80 then
    return jsonb_build_object('error','Въведете валиден потребител.');
  end if;

  begin
    v_headers:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  exception when others then
    v_headers:='{}'::jsonb;
  end;

  v_ip:=nullif(trim(split_part(coalesce(v_headers->>'cf-connecting-ip',v_headers->>'x-forwarded-for',''),',',1)),'');
  v_subject_hash:=encode(extensions.digest(v_username,'sha256'),'hex');
  v_device_hash:=encode(extensions.digest(v_device,'sha256'),'hex');
  v_rate_key:=encode(extensions.digest(v_username||'|'||coalesce(v_ip,v_device),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended('zorbas-login:'||v_rate_key,0));
  delete from public.zorbas_login_challenges where expires_at<now()-interval '1 day';

  select count(*) into v_count
  from public.zorbas_login_challenges
  where rate_key_hash=v_rate_key and created_at>now()-interval '15 minutes';

  if v_count>=12 then
    return jsonb_build_object('error','Твърде много опити за вход. Изчакайте 15 минути и опитайте отново.','rate_limited',true);
  end if;

  v_raw:=encode(extensions.gen_random_bytes(24),'hex');
  insert into public.zorbas_login_challenges(rate_key_hash,subject_hash,device_hash,challenge_hash,expires_at)
  values(v_rate_key,v_subject_hash,v_device_hash,encode(extensions.digest(v_raw,'sha256'),'hex'),now()+interval '2 minutes');

  return jsonb_build_object('challenge',v_raw,'expires_at',now()+interval '2 minutes');
end;
$function$;

create or replace function public.zorbas_staff_login_v2(
  p_username text,
  p_password text,
  p_display_name text,
  p_device_id text default null::text,
  p_challenge text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare
  a public.zorbas_staff_accounts%rowtype;
  v_token text;
  v_session uuid;
  v_username text:=lower(trim(coalesce(p_username,'')));
  v_device text:=coalesce(nullif(trim(coalesce(p_device_id,'')),''),'unknown-device');
  v_challenge_id uuid;
begin
  if nullif(trim(coalesce(p_challenge,'')),'') is null then
    return jsonb_build_object('error','Липсва защитена сесия за вход. Обновете приложението и опитайте отново.');
  end if;

  select id into v_challenge_id
  from public.zorbas_login_challenges
  where challenge_hash=encode(extensions.digest(trim(p_challenge),'sha256'),'hex')
    and subject_hash=encode(extensions.digest(v_username,'sha256'),'hex')
    and device_hash=encode(extensions.digest(v_device,'sha256'),'hex')
    and used_at is null
    and expires_at>now()
  for update;

  if v_challenge_id is null then
    return jsonb_build_object('error','Сесията за вход изтече. Опитайте отново.');
  end if;

  update public.zorbas_login_challenges set used_at=now() where id=v_challenge_id;

  select * into a from public.zorbas_staff_accounts
  where lower(username)=v_username and active limit 1;

  if a.id is null or extensions.crypt(coalesce(p_password,''),a.password_hash)<>a.password_hash then
    perform pg_sleep(0.35);
    return jsonb_build_object('error','Грешен потребител или парола');
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.zorbas_app_sessions(account_id,token_hash,display_name,device_id,expires_at)
  values(a.id,encode(extensions.digest(v_token,'sha256'),'hex'),coalesce(nullif(trim(p_display_name),''),a.display_name),p_device_id,now()+interval '16 hours')
  returning id into v_session;

  insert into public.zorbas_audit_log(session_id,actor_name,action,payload)
  values(v_session,coalesce(nullif(trim(p_display_name),''),a.display_name),'login',jsonb_build_object('device_id',p_device_id,'challenge_v2',true));

  return jsonb_build_object('token',v_token,'display_name',coalesce(nullif(trim(p_display_name),''),a.display_name),'role',a.role,'expires_at',now()+interval '16 hours');
end;
$function$;

revoke all on function public.zorbas_login_challenge(text,text) from public;
revoke all on function public.zorbas_staff_login_v2(text,text,text,text,text) from public;
grant execute on function public.zorbas_login_challenge(text,text) to anon,authenticated;
grant execute on function public.zorbas_staff_login_v2(text,text,text,text,text) to anon,authenticated;
