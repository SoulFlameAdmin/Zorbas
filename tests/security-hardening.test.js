const fs = require('fs');
const assert = require('assert');

const read = path => fs.readFileSync(path, 'utf8');

const surface = read('supabase/migrations/20260905013646_zorbas_security_surface_hardening_v1.sql');
const loginMigration = read('supabase/migrations/20260905013733_zorbas_login_challenge_v2.sql');
const publicRateMigration = read('supabase/migrations/20260905014142_zorbas_public_submission_rate_limits_v1.sql');
const guard = read('login-challenge-guard.js');
const waiter = read('waiter.html');
const kitchen = read('kitchen.html');
const print = read('print.html');
const admin = read('admin.js');
const sw = read('sw.js');

assert(surface.includes('revoke execute on function public.zorbas_private_table_has_live_records'), 'private table live helper must not be public');
assert(surface.includes('revoke execute on function public.zorbas_private_visit_is_live'), 'private visit live helper must not be public');
assert(surface.includes("revoke all privileges on table public.%I from anon"), 'anonymous direct table privileges must be removed by default');
assert(surface.includes('grant select on table public.zorbas_live_updates to anon'), 'public realtime read must remain available');
assert(!surface.includes('grant insert'), 'anonymous direct writes must not be restored');

assert(loginMigration.includes('zorbas_login_challenges'), 'login challenge storage must exist');
assert(loginMigration.includes('enable row level security'), 'challenge storage must use RLS');
assert(loginMigration.includes('revoke all privileges on table public.zorbas_login_challenges'), 'challenge rows must not be directly readable');
assert(loginMigration.includes("v_count>=12"), 'challenge issuance must be rate limited');
assert(loginMigration.includes("now()+interval '2 minutes'"), 'login challenges must expire quickly');
assert(loginMigration.includes('used_at is null'), 'challenge must be single-use');
assert(loginMigration.includes('update public.zorbas_login_challenges set used_at=now()'), 'challenge must be consumed before credential result');
assert(loginMigration.includes("perform pg_sleep(0.35)"), 'invalid credentials must have a minimum server-side cost');
assert(loginMigration.includes("jsonb_build_object('error','Грешен потребител или парола')"), 'v2 login must fail without rolling back challenge consumption');

assert(publicRateMigration.includes(">=4 then"), 'web reservations must have burst protection');
assert(publicRateMigration.includes("r.created_at>now()-interval '15 minutes'"), 'reservation rate window must be time bounded');
assert(publicRateMigration.includes(">=5 then"), 'public pickup orders must have burst protection');
assert(publicRateMigration.includes("o.created_at>now()-interval '15 minutes'"), 'pickup rate window must be time bounded');
assert(publicRateMigration.includes('mi.restaurant_id=v_restaurant'), 'public pickup menu lookup must stay restaurant scoped');
assert(publicRateMigration.includes('insert into public.zorbas_orders(restaurant_id'), 'public pickup order must set restaurant explicitly');

assert(guard.includes("name !== 'zorbas_staff_login'"), 'guard must intercept the legacy login call transparently');
assert(guard.includes("rawRpc('zorbas_login_challenge'"), 'guard must request a one-time challenge first');
assert(guard.includes("rawRpc('zorbas_staff_login_v2'"), 'guard must use challenge-bound login v2');
assert(guard.includes('if (result?.error)'), 'database login errors must still surface as normal client errors');

for (const [name, html] of [['waiter', waiter], ['kitchen', kitchen], ['print', print]]) {
  assert(html.includes('/login-challenge-guard.js?v=20260905-1'), `${name} must load login challenge guard`);
  assert(html.indexOf('/login-challenge-guard.js') > html.indexOf('/config.js'), `${name} guard must load after config`);
}
assert(admin.indexOf('/login-challenge-guard.js?v=20260905-1') < admin.indexOf('/admin-login-stability.js'), 'admin must load login guard before login handler');

assert(sw.includes('zorbas-v62-white-ui-20260906'), 'service-worker cache must keep security rollout while adding white UI');
assert(sw.includes('/login-challenge-guard.js?v=20260905-1'), 'offline staff shell must include login guard');
assert(sw.includes("url.pathname==='/login-challenge-guard.js'"), 'login guard must be network-first while online');

console.log('PASS Zorbas security hardening: anon writes closed, login challenge is rate-limited/single-use, public submissions have burst limits.');
