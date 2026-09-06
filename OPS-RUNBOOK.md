# ZORBAS Restaurant OS 1.0 — Production Operations Runbook

This runbook defines the minimum operational checks required before calling a release production-ready. It intentionally contains no credentials, customer PII, staff passwords, or private keys.

## 1. Pre-shift health check

Open **Admin → Система** and press **Провери**.

Release/shift start is blocked when the health result is `action_required`.

Investigate before service when any of these are non-zero:

- ambiguous physical print jobs;
- expired print leases;
- exhausted print attempts;
- current dine-in orders without a table visit;
- live table/state mismatches.

A historical stale active visit is informational only. Do not delete or rewrite historical visits merely to make the counter zero.

## 2. Physical printer recovery

Never assume a print succeeded only because the browser/bridge lost its response.

For an ambiguous physical print:

1. Check the physical printer and paper first.
2. Check the ZORBAS print job state and attempt history.
3. If paper already exists, do not blindly retry.
4. If no paper exists and the job is eligible for retry, restore network/printer connectivity and retry once.
5. Confirm exactly one physical receipt/ticket and then confirm the job state.

A job must never be marked `printed` merely because it was claimed or sent to a local bridge.

## 3. Physical printer acceptance test

Required before the printing phase is accepted:

- phone → production ZORBAS → correct staff/kitchen destination → physical paper;
- disconnect printer/network before send: no false `printed` state;
- restore connectivity and retry: exactly one paper output;
- paper-out → reload → retry: exactly one paper output;
- restart browser/print agent around a claimed job: lease/recovery does not duplicate paper;
- verify both staff and kitchen/bar routing on the actual restaurant hardware.

Record PASS/FAIL and the time of the test. Do not award the production printing milestone on simulated output alone.

## 4. Network/offline recovery

When a waiter device loses network:

1. Do not repeatedly tap Send while the result is unknown.
2. Allow the client to reconnect and reuse the unresolved idempotency key.
3. Confirm a single order exists after recovery.
4. Confirm print side effects are not duplicated.
5. If the client is stale after a deployment, reload only after unresolved operations are reconciled.

## 5. Database backup acceptance

The application repository does not contain database credentials or backup files. Backup configuration must be verified in the database hosting control plane.

Before release freeze, verify and record:

- automated backups are enabled for the production project;
- retention is appropriate for the restaurant's recovery requirements;
- point-in-time recovery is enabled when the selected plan supports/requires it;
- the newest backup timestamp is recent enough for the agreed RPO;
- restore access is limited to authorized operators.

Do not treat "backup enabled" as sufficient proof. A restore drill is required.

## 6. Restore drill

Never test a destructive restore over production.

Required drill:

1. Restore/copy the latest production backup into an isolated non-production database/project.
2. Use non-production application credentials only.
3. Verify schema/functions are present.
4. Verify representative counts/integrity for tables, visits, orders, order items, reservations and print jobs without exposing PII in the drill report.
5. Run a smoke flow against the isolated restore.
6. Record restore start/end time and PASS/FAIL.
7. Destroy or restrict the temporary restore according to the data-retention policy after verification.

Release acceptance target: documented successful isolated restore within the agreed RTO. The target is not considered achieved until a real restore has completed.

## 7. Incident severity

- **P0** — restaurant cannot safely take/route/close orders, data loss/duplication is occurring, or security compromise is suspected. Stop affected workflow and use the established fallback.
- **P1** — major function degraded with material service risk, including repeated printer ambiguity or inability to reconcile a table/bill.
- **P2** — localized defect with a safe workaround and no data-integrity risk.

For P0/P1, preserve evidence before changing historical records: timestamp, screen, affected table/order/job IDs, and the observed state. Do not include customer phone/name in public issue reports.

## 8. Release acceptance shifts

ZORBAS Restaurant OS 1.0 reaches final acceptance only after **2–3 real restaurant shifts** complete without unresolved P0/P1 incidents.

During each shift confirm:

- reservation → arrival → visit → order → kitchen → correction/cancel if needed → bill → close;
- multiple simultaneous waiter devices;
- printer routing and recovery;
- brief network interruption/reconnect where safe to test;
- no duplicate orders, no lost orders, no false printed state;
- end-of-shift tables and active visits reconcile correctly.

After successful acceptance shifts, freeze release changes except for release-blocking fixes and tag the accepted production commit.
