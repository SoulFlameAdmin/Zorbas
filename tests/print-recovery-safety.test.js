const fs = require('fs');
const assert = require('assert');

const read = path => fs.readFileSync(path, 'utf8');

const browserSafety = read('print-browser-safety.js');
const printHtml = read('print.html');
const printJs = read('print.js');
const sw = read('sw.js');
const networkPrinter = read('bridge/ZorbasBridge/NetworkPrinterService.cs');
const windowsPrinter = read('bridge/ZorbasBridge/WindowsPrinterService.cs');
const deliveryError = read('bridge/ZorbasBridge/PrinterDeliveryException.cs');
const guardMigration = read('supabase/migrations/20260905012611_zorbas_print_ambiguous_delivery_guard_v1.sql');
const retryMigration = read('supabase/migrations/20260905012759_zorbas_print_retry_ambiguity_gate_v1.sql');
const restartMigration = read('supabase/migrations/20260906090000_zorbas_print_cross_session_ambiguity_recovery_v1.sql');

assert(browserSafety.includes('window.confirm('), 'browser fallback must require physical confirmation');
assert(browserSafety.includes('[AMBIGUOUS_PRINT]'), 'unconfirmed browser print must be ambiguous, not successful');
assert(printHtml.indexOf('print-browser-safety.js') < printHtml.indexOf('/print.js'), 'browser safety guard must load before print.js');

assert(networkPrinter.includes('[SAFE_NO_OUTPUT]'), 'LAN connect failure must be explicitly safe to retry');
assert(networkPrinter.includes('[AMBIGUOUS_PRINT]'), 'LAN write failure must be explicitly ambiguous');
assert(networkPrinter.includes('outputMayExist = true'), 'LAN adapter must mark the physical-output boundary');
assert(windowsPrinter.includes('[AMBIGUOUS_PRINT]'), 'Windows spool errors must not be blindly retried');
assert(deliveryError.includes('MayHaveProducedOutput'), 'printer delivery error must preserve physical ambiguity');

assert(guardMigration.includes("j.status in ('claimed','preparing')"), 'expired safe leases may be reclaimed');
assert(guardMigration.includes("j.status in ('sending','printing')"), 'expired physical stages must be quarantined');
assert(guardMigration.includes("status='failed'"), 'ambiguous physical stages must become manual-review failures');
assert(guardMigration.includes("'auto_retry',false"), 'ambiguous lease recovery must disable automatic retry');

assert(retryMigration.includes("v_current_status in ('sending','printing')"), 'retry gate must inspect physical stage');
assert(retryMigration.includes("not like '[SAFE_NO_OUTPUT]%'"), 'only proven no-output failures may auto retry');
assert(retryMigration.includes("v_effective_status := 'failed'"), 'unknown physical outcome must fail closed');
assert(retryMigration.includes('physical_retry_guard'), 'print attempts must record retry-guard metadata');

assert(restartMigration.includes("j.status in ('sending','printing')"), 'replacement session must detect expired physical-stage leases');
assert(restartMigration.includes('original_session_id'), 'ambiguity audit must preserve the original claiming session when possible');
assert(restartMigration.includes("status = 'failed'"), 'expired physical stage after restart must quarantine instead of auto retry');
assert(restartMigration.includes('[AMBIGUOUS_PRINT]'), 'cross-session quarantine must remain visibly ambiguous');
assert(!restartMigration.includes("status = 'retrying'"), 'cross-session physical ambiguity must never be changed directly to retrying');

assert(printJs.includes("['pending', 'retrying'].includes(job.status)"), 'AUTO mode may only select safe pending/retrying jobs');
assert(!/\['pending',\s*'retrying',\s*'failed'\]\.includes\(job\.status\)/.test(printJs), 'AUTO mode must never include failed/ambiguous jobs');

assert(sw.includes('zorbas-v62-white-ui-20260906'), 'service worker cache must include the current white UI generation');
assert(sw.includes('ignoreSearch:true'), 'offline fallback must tolerate cache-bust query changes');
assert(sw.includes("url.pathname.startsWith('/print')"), 'print surface must be network-first');
assert(sw.includes("url.pathname==='/live-sync.js'"), 'live sync must be network-first');
assert(sw.includes('/reserve-live.js?v=20260905-stable1'), 'current reservation realtime helper must be cached for emergency offline load');

console.log('PASS print recovery safety: no silent browser success, no blind ambiguous retry, replacement sessions quarantine expired physical leases, live PWA is network-first.');
