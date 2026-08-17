-- Keep the public careers portal on the narrowest possible database surface.
-- The future internal tracker must add its own authenticated policies/grants.

revoke all privileges on table public.positions from anon, authenticated;
grant select (id, title, department, status, archived_at)
  on table public.positions
  to anon;

revoke all privileges on table public.recruitment_stages from anon, authenticated;
revoke all privileges on table public.cv_submissions from anon, authenticated;

alter function public.set_updated_at()
  set search_path = pg_catalog;
