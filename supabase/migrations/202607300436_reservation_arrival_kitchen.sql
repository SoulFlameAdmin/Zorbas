-- Applied to production through Supabase migration: zorbas_reservation_arrival_and_kitchen_snapshot.
-- Source-of-truth marker for the reservation arrival workflow.
-- The live function public.zorbas_mark_reservation_arrived_v4:
-- 1. validates the staff session;
-- 2. marks the reservation as seated;
-- 3. marks the table as occupied;
-- 4. sends a pending preorder to the selected print route once;
-- 5. records an audit event.

select 'zorbas_mark_reservation_arrived_v4 is managed in Supabase migrations'::text;