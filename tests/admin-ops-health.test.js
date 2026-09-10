const fs = require('fs');
const assert = require('assert');

const loader = fs.readFileSync('admin.js', 'utf8');
const health = fs.readFileSync('admin-ops-health.js', 'utf8');

assert(loader.includes('/admin-ops-health.js?v=20260906-ops1'), 'admin loader must include ops health module');
assert(loader.indexOf('/admin-core.js') < loader.indexOf('/admin-ops-health.js'), 'ops health must load after admin core');
assert(health.includes("Z.rpc('zorbas_ops_health_v1'"), 'ops health must call manager-authenticated health RPC');
assert(health.includes("Z.rpc('zorbas_bridge_version_health_v1'"), 'ops health must check Bridge version safety');
assert(health.includes('{ p_token: Z.token() }'), 'ops health must use the existing staff token in-memory API');
assert(health.includes("button.dataset.view = 'ops'"), 'ops navigation entry must be installed');
assert(health.includes("section.id = 'view-ops'"), 'ops view must be installed');
assert(health.includes('ambiguous_last_48h'), 'ambiguous physical print state must be visible');
assert(health.includes('expired_leases'), 'expired print leases must be visible');
assert(health.includes('recent_dinein_without_visit'), 'service integrity failures must be visible');
assert(health.includes('live_table_mismatch'), 'table/live-state mismatch must be visible');
assert(health.includes("card('Bridge версия'"), 'Bridge version must be visible');
assert(health.includes('safe_test_no_print_ready'), 'System view must expose safe no-print readiness');
assert(health.includes('ОБНОВИ до'), 'old Bridge must have an explicit update warning');
assert(health.includes("BRIDGE_RELEASE_BASE = 'https://github.com/SoulFlameAdmin/Zorbas/releases/download'"), 'outdated Bridge guidance must use the official repository release path');
assert(health.includes('Zorbas-Bridge-Setup.exe'), 'System view must link to the installer asset');
assert(health.includes('validVersion(requiredVersion)'), 'installer link must only be built for a validated semantic version');
assert(health.includes("download.rel = 'noopener noreferrer'"), 'external installer link must be opened safely');
assert(health.includes('actions.hidden = false'), 'upgrade action must become visible when Bridge is outdated');
assert(health.includes('textContent'), 'health values must be rendered as text');
assert(!health.includes('innerHTML = data'), 'RPC response must never be inserted as raw HTML');
assert(!health.includes('customer_name'), 'ops view must not request/render customer PII');
assert(!health.includes('customer_phone'), 'ops view must not request/render customer phone data');

console.log('admin ops health regression: PASS');
