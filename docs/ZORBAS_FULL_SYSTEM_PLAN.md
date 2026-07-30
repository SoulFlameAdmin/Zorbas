# Zorbas × SoulFlame Restaurant OS — full system plan

## Single source of truth
Supabase stores tables, reservations, table visits, orders, immutable revisions, Manager assignments, archive, analytics and Print 1 / Print 2 jobs. Every write uses a transactional RPC. Supabase Realtime is backed by the existing two-second live-version polling fallback.

## Roles
- Customer: sees available/reserved/occupied tables and creates reservations/preorders.
- Waiter: Tables, Order, Notes, Reservations and second-guests actions from the phone/PWA.
- Kitchen: pilot requires only physical Print 2 notes; no website status work.
- Manager: operational screen inside the waiter site, not platform Admin. Assigns work, marks sent/delivered, completes notes and manages visits.
- Restaurant Admin: PIN-protected reports for today, yesterday, 7 days, month, year and all time.
- SoulFlame Partners: multi-restaurant device pairing, printer mapping, operating mode and future cross-restaurant analytics.

## Table visits
A physical table can have independent groups: `1-ви гости`, `2-ри гости`, `3-ти гости`. The first dine-in order opens an active visit. Later notes attach to it. `Следващи гости` archives the completed visit and opens a clean one while keeping the table occupied. `Освободи масата` archives the visit and marks the table free.

## Note corrections
Management → Notes → exact note → Edit quantities → Save. The server locks the order, checks the expected revision, computes the authoritative plus/minus delta and creates one idempotent correction print job per original destination. The original note is never deleted. Before, after, delta, actor, reason and time remain in history.

Example:

```text
МАСА 7 · 2-РИ ГОСТИ
ПРОМЕНЕНО
-1 × Зорбас салата
------------------
НОВО
1 × Зорбас салата
1 × Скариди
2 × Кебап
```

## Manager lifecycle
Each item has a separate operational state:

```text
NEW → ASSIGNED → SENT → DELIVERED
```

Delivered rows stay green and crossed out. Cancelled rows stay red and crossed out. Every transition records actor, assignee, time, note and version. A note can move to Archive only after every non-cancelled item is delivered.

## Manager screen
- New orders above a clear `НОВО` divider.
- Search by table, order number, item, waiter or assigned person.
- Per-person outstanding tasks, e.g. `Митко — 2 кебапа и скариди`, `Иван — магданоз`.
- Complete note, start next guests or free table.
- Live updates from the same Supabase state.

## Archive
Filters: Today, Yesterday, Week, Month, Year, All. Search by table, visit label, order, product, waiter, Manager or assigned person. Archive preserves cancelled rows and all revisions.

## Admin dashboard
For each period: orders, visits, completed notes, gross/cancelled/net stored order value, average bill, dine-in/takeaway split, corrections, table visits/occupied minutes/value, top products and peak hours. Money initially means stored order value; exact cash/card/paid/unpaid follows payment integration.

## Stability
- Transactional RPCs.
- Realtime plus two-second polling fallback.
- Idempotent correction jobs.
- Optimistic order/item versions.
- Audit events for every edit, assignment, sent, delivered, completion and guest transition.
- No hard deletion of operational history.
- Mobile refresh pauses while an input is being edited.

## Windows tools
1. `AnalyzeZorbas.exe`: read-only printer/POS diagnostics and Desktop ZIP; no printing, setting changes, password/order collection or automatic upload.
2. `Zorbas.exe` / Bridge installer: pair with `sf-zorbas`, select exact Print 1/Print 2 queues, test each printer, start in `test_no_print`, then controlled `parallel`, then `soulflame`. Red fallback returns to `legacy` without deleting the old system.

## Delivery order
1. Visits, note revisions, correction jobs and second guests.
2. Manager board, assignments, sent/delivered, archive.
3. Admin dashboard and analytics.
4. Scanner/Bridge receipt improvements and physical printer tests.

## Acceptance scenario
Table 7 opens first visit; waiter sends 2 salads, shrimp and 2 kebabs; edits salad 2→1; exactly one correction job per destination; Manager assigns work, marks sent/delivered, completes the note; old visit archives; clean `2-ри гости` starts; Admin counts both visits separately.
