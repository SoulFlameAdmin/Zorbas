const fs = require('fs');
const assert = require('assert');

const read = path => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/20260910171000_zorbas_operational_core_health_rollover_v2.sql');
const globalPrintSafety = read('supabase/migrations/20260910184500_zorbas_test_no_print_global_safety_v1.sql');
const bridgeEngine = read('bridge/ZorbasBridge/BridgeEngine.cs');
const live = read('live-sync.js');
const health = read('admin-ops-health.js');
const runbook = read('OPS-RUNBOOK.md');

// Service-day rollover must close the whole operational chain, not just the visit.
assert(migration.includes("event_type, from_state, to_state, payload"), 'rollover must leave an audit trail');
assert(migration.includes("'auto_service_day_rollover'"), 'stale dine-in rollover must be explicit in audit history');
assert(migration.includes("update public.zorbas_orders o"), 'stale visit orders must be operationally closed');
assert(migration.includes("o.status not in ('completed','cancelled','returned')"), 'final order states must remain untouched');
assert(migration.includes("o.order_type = 'pickup'"), 'old pickup orders must not remain live forever');
assert(migration.includes("Preorders are intentionally excluded"), 'future preorder lifecycle must not be auto-closed blindly');
assert(migration.includes("update public.zorbas_table_visits"), 'stale visits must still be archived');
assert(!migration.includes("bill_status = 'paid'"), 'automatic rollover must never invent payment');
assert(!migration.includes("paid_at = now()"), 'automatic rollover must not set payment timestamp');

// A delayed 05:00 cron must never close records created in the new service day.
assert((migration.match(/started_at < v_day_start/g) || []).length >= 2, 'both shift tables must protect new-day shifts');
assert(migration.includes("public.zorbas_private_table_has_live_records(t.restaurant_id,t.id) then 'occupied'"), 'table state must be recomputed from live records');
assert(migration.includes("t.status <> 'blocked'"), 'blocked tables must never be freed by rollover reconciliation');
assert(!migration.includes("set status = 'free', updated_at = now()\n  where status in ('occupied','cleaning')"), 'rollover must not blindly free every occupied table');

// Operational health must cover the physical bridge and lifecycle integrity.
assert(migration.includes('public.sf_device_heartbeats'), 'health must inspect bridge heartbeat state');
assert(migration.includes("interval '3 minutes'"), 'bridge freshness needs a bounded heartbeat window');
assert(migration.includes('v_bridge_required'), 'health must respect the restaurant operating mode');
assert(migration.includes('v_active_printers'), 'health must count active printer configuration');
assert(migration.includes('v_expected_printers'), 'health must compare configured and expected printers');
assert(migration.includes('v_stale_nonfinal_orders'), 'health must reveal stale live orders');
assert(migration.includes('v_lifecycle_conflicts'), 'health must detect impossible kitchen/order combinations');
assert(migration.includes("v_bridge_online = 0"), 'required offline bridge must be action-required');
assert(migration.includes("or v_bridge_stale > 0"), 'extra stale bridge registrations should be a warning, not silently ignored');

// Global test-no-print safety must hold across mode changes, Bridge claims and browser consumers.
assert(globalPrintSafety.includes("v_required_version text := '1.2.4'"), 'mode gate must name the minimum safe Bridge release');
assert(globalPrintSafety.includes('v_required_number integer := 1002004'), 'mode/claim gates must compare the minimum safe Bridge version numerically');
assert(globalPrintSafety.includes('v_unsafe_devices'), 'entering test_no_print must reject old or unknown active Bridges');
assert(globalPrintSafety.includes('TEST_NO_PRINT_REQUIRES_EMPTY_QUEUE'), 'test mode must require an empty unresolved print queue');
assert(globalPrintSafety.includes('TEST_NO_PRINT_REQUIRES_NO_AMBIGUOUS_PRINT'), 'test mode must reject unresolved ambiguous physical outcomes');
assert((globalPrintSafety.match(/hashtextextended\('zorbas-print-mode:'/g) || []).length >= 4, 'mode set, Bridge claim, browser claim and browser ACK must share the same advisory lock');
assert(globalPrintSafety.includes("v_mode in ('parallel','soulflame')"), 'physical operating modes must be explicit');
assert(globalPrintSafety.includes("v_mode='test_no_print' and j.job_type='test'"), 'test_no_print must claim TEST jobs only');
assert(globalPrintSafety.includes('v_version_number is null or v_version_number < v_required_number'), 'old/unknown Bridge must receive no TEST claim in test_no_print');
assert(globalPrintSafety.includes("jsonb_build_object('operating_mode',v_mode)"), 'each Bridge print claim must carry authoritative operating mode');
assert(globalPrintSafety.includes('TEST_NO_PRINT_BROWSER_CLAIM_BLOCKED'), 'web Print Center must not claim jobs in test_no_print');
assert(globalPrintSafety.includes("p_status in ('preparing','sending','printing','printed')"), 'browser physical print stages must be explicitly identified');
assert(globalPrintSafety.includes('TEST_NO_PRINT_BROWSER_PHYSICAL_STATE_BLOCKED'), 'browser/session ACK must fail closed in test_no_print');
assert(globalPrintSafety.includes('revoke all on function public.sf_bridge_set_operating_mode'), 'security-definer mode RPC must not retain generic PUBLIC execution');
assert(globalPrintSafety.includes('revoke all on function public.sf_bridge_claim_next_print_job'), 'security-definer Bridge claim RPC must not retain generic PUBLIC execution');
assert(globalPrintSafety.includes('revoke all on function public.zorbas_claim_print_job_v4'), 'security-definer browser claim RPC must not retain generic PUBLIC execution');
assert(globalPrintSafety.includes('revoke all on function public.zorbas_ack_print_job_v4'), 'security-definer browser ACK RPC must not retain generic PUBLIC execution');

// Bridge itself must still make the final physical/simulation decision from the mode bound to the claim.
assert(bridgeEngine.includes('var authoritativeMode = job.OperatingMode;'), 'Bridge must decide from the mode bound to the claim');
assert(bridgeEngine.includes('var simulateOnly = authoritativeMode == BridgeModes.TestNoPrint;'), 'test_no_print must enter simulation mode');
assert(bridgeEngine.includes('no_physical_output = true'), 'simulation ACK must explicitly state no physical output');
assert(bridgeEngine.includes('Never enter sending/printing in test_no_print'), 'simulation must stay outside physical print stages');
const simulationReturn = bridgeEngine.indexOf('TEST задача {job.Id} е симулирана успешно');
const physicalPrintingAck = bridgeEngine.indexOf('"printing"', simulationReturn);
assert(simulationReturn >= 0 && physicalPrintingAck > simulationReturn, 'simulation must return before the physical printing ACK path');
assert(runbook.includes('`test_no_print` is a print-subsystem safety test'), 'runbook must not present test_no_print as normal-order E2E proof');
assert(runbook.includes("`job_type='test'`"), 'runbook must state the TEST-only claim contract');
assert(runbook.includes('`safe_test_no_print_ready=true`'), 'runbook must require the live Bridge version gate');
assert(runbook.includes('Return the restaurant to `parallel`'), 'runbook must require returning to physical operating mode after simulation');

// Owner system view must expose the new health signals without rendering raw RPC HTML.
assert(health.includes("card('Bridge'"), 'owner system view must show bridge state');
assert(health.includes("card('Активни принтери'"), 'owner system view must show printer readiness');
assert(health.includes("card('Lifecycle конфликти'"), 'owner system view must show lifecycle conflicts');
assert(health.includes("card('Стари незатворени поръчки'"), 'owner must see stale order cleanup debt');
assert(health.includes('textContent'), 'health values must be text-rendered');
assert(!health.includes('innerHTML = data'), 'health RPC data must not be injected as raw HTML');

// Realtime is optional; polling must recover and the realtime loader must be retryable.
assert(live.includes("scriptPromise = null"), 'failed/retried realtime loader must not stay permanently rejected');
assert(live.includes('stale.remove()'), 'failed CDN script element must be replaceable on retry');
assert(live.includes("window.addEventListener('online'"), 'coming back online must trigger recovery');
assert(live.includes('ensureRealtime();'), 'online/visible events must rebuild realtime when needed');
assert(live.includes("realtimeStatus !== 'SUBSCRIBED'"), 'reconnect loop must detect degraded realtime');
assert(live.includes('lastPollOkAt'), 'polling success must participate in connection health');
assert(live.includes('isPollFresh()'), 'a fresh polling fallback must count as connected');
assert(!live.includes('get connected() { return Boolean(realtimeChannel); }'), 'channel allocation alone must not claim healthy realtime');

console.log('PASS Zorbas operational core P1: rollover, race guards, global print safety, Bridge health and reconnect invariants are protected.');
