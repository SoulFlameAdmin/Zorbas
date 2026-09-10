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

Before any print acceptance test, also require:

- the Bridge is online with a fresh heartbeat;
- the Bridge version is known and is at least the version required by **Admin → Система**;
- `safe_test_no_print_ready=true`;
- the print queue has no unresolved physical outcome.

## 2. Bridge version gate and upgrade

Never switch the restaurant to `test_no_print` while an active Bridge is older than the required safe-test version or reports an unknown version.

Upgrade sequence:

1. Open **Admin → Система** and press **Провери**.
2. If the Bridge is outdated, use the displayed official **Свали Bridge X.Y.Z** installer action.
3. Install the required version on the paired restaurant PC. Do not create a second device pairing unless the existing pairing is actually lost.
4. Start/restart Zorbas Bridge and wait for a fresh heartbeat.
5. Press **Провери** again.
6. Continue only when the displayed current version is at least the required version and `safe_test_no_print_ready=true`.

Do not infer upgrade success from the installer finishing. The acceptance signal is the new version reported by the live Bridge heartbeat.

## 3. Safe print simulation (`test_no_print`)

`test_no_print` is a print-subsystem safety test. It is **not** a full normal-order E2E test.

Authoritative contract:

- in `test_no_print`, the Bridge may claim only print jobs whose `job_type='test'`;
- normal order print jobs must not be claimed in this mode;
- each claimed job carries the authoritative operating mode from the database;
- the Bridge formats the test receipt but must not call a Windows or LAN printer;
- the simulated completion is ACKed with `simulated=true` and `no_physical_output=true`;
- the simulation must not pass through a physical `printing` stage.

Safe procedure:

1. Complete the Bridge version gate in section 2.
2. Confirm there is no unresolved/ambiguous physical print job before changing mode.
3. Change the restaurant operating mode to `test_no_print`.
4. Create a dedicated test print job through the existing test-print action/RPC. Use `both` when validating both staff and kitchen destinations.
5. Confirm the Bridge claims the TEST job(s), formats them, and completes the simulated ACK.
6. Confirm there is **zero physical paper output** from both printers.
7. Confirm the attempt/job metadata records simulation and `no_physical_output=true`.
8. Return the restaurant to `parallel` immediately after the simulation.
9. Re-check **Admin → Система** and verify the Bridge is online and there is no unresolved print state.

If any physical paper is produced while the authoritative mode is `test_no_print`, stop acceptance immediately and treat it as a release-blocking print-safety defect.

## 4. Full restaurant E2E lifecycle

Do not use `test_no_print` as proof of the normal order path. The full normal flow must be validated separately.

Required controlled scenario:

1. Start from a free test table and confirm there is no existing live visit for it.
2. Seat/start one visit.
3. Add at least one BAR/staff item and one kitchen item, including a multiline note.
4. Send once and confirm exactly one server order exists for the client idempotency key.
5. Confirm the order belongs to the same table visit and the table is occupied.
6. Confirm manager/kitchen state transitions are visible without inventing payment state.
7. Mark the appropriate kitchen item flow ready/served according to the operational roles.
8. Generate the bill from the current visit and verify the server-side total matches its order items.
9. Close/pay using the intended controlled acceptance action.
10. Confirm the visit is closed, the table returns to free, and no non-final order remains for that visit.
11. Confirm no duplicate order, duplicate visit, or impossible lifecycle combination was created.

Normal-order physical routing is accepted only together with section 6 on the actual restaurant hardware.

## 5. Physical printer recovery

Never assume a print succeeded only because the browser/bridge lost its response.

For an ambiguous physical print:

1. Check the physical printer and paper first.
2. Check the ZORBAS print job state and attempt history.
3. If paper already exists, do not blindly retry.
4. If no paper exists and the job is eligible for retry, restore network/printer connectivity and retry once.
5. Confirm exactly one physical receipt/ticket and then confirm the job state.

A job must never be marked `printed` merely because it was claimed or sent to a local bridge.

## 6. Physical printer acceptance test

Run this only after the safe simulation in section 3 passes and the restaurant has been returned to `parallel`.

A person must be present at the physical printers.

Required before the printing phase is accepted:

- phone → production ZORBAS → correct staff/kitchen destination → physical paper;
- Print 1 receives the complete intended staff/BAR content;
- Print 2 receives only the intended kitchen content;
- multiline notes are complete and readable;
- exactly one physical ticket is produced for each expected destination;
- disconnect printer/network before a controlled send: no false `printed` state;
- restore connectivity and retry only after checking physical output: exactly one paper output;
- paper-out → reload → controlled retry: exactly one paper output;
- restart browser/print agent around a controlled claimed job only when the recovery scenario is explicitly being tested; lease/recovery must not duplicate paper.

Record PASS/FAIL and the time of the test. Do not award the production printing milestone on simulated output alone.

## 7. Network/offline recovery

When a waiter device loses network:

1. Do not repeatedly tap Send while the result is unknown.
2. Allow the client to reconnect and reuse the unresolved idempotency key.
3. Confirm a single order exists after recovery.
4. Confirm print side effects are not duplicated.
5. If the client is stale after a deployment, reload only after unresolved operations are reconciled.

## 8. Database backup acceptance

The application repository does not contain database credentials or backup files. Backup configuration must be verified in the database hosting control plane.

Before release freeze, verify and record:

- automated backups are enabled for the production project;
- retention is appropriate for the restaurant's recovery requirements;
- point-in-time recovery is enabled when the selected plan supports/requires it;
- the newest backup timestamp is recent enough for the agreed RPO;
- restore access is limited to authorized operators.

Do not treat "backup enabled" as sufficient proof. A restore drill is required.

## 9. Restore drill

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

## 10. Incident severity

- **P0** — restaurant cannot safely take/route/close orders, data loss/duplication is occurring, physical output is produced in `test_no_print`, or security compromise is suspected. Stop the affected workflow and use the established fallback.
- **P1** — major function degraded with material service risk, including repeated printer ambiguity or inability to reconcile a table/bill.
- **P2** — localized defect with a safe workaround and no data-integrity risk.

For P0/P1, preserve evidence before changing historical records: timestamp, screen, affected table/order/job IDs, and the observed state. Do not include customer phone/name in public issue reports.

## 11. Release acceptance shifts

ZORBAS Restaurant OS 1.0 reaches final acceptance only after **2–3 real restaurant shifts** complete without unresolved P0/P1 incidents.

During each shift confirm:

- reservation → arrival → visit → order → kitchen → correction/cancel if needed → bill → close;
- multiple simultaneous waiter devices;
- printer routing and recovery;
- brief network interruption/reconnect where safe to test;
- no duplicate orders, no lost orders, no false printed state;
- end-of-shift tables and active visits reconcile correctly.

After successful acceptance shifts, freeze release changes except for release-blocking fixes and tag the accepted production commit.
