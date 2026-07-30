-- Applied to production through Supabase migration: expand_zorbas_print_job_statuses_v4.
-- The v4 constraint already contains all allowed states; remove the older narrower constraint.

alter table public.zorbas_print_jobs drop constraint if exists zorbas_print_jobs_status_check;