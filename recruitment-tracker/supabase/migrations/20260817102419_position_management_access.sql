-- Function 1: role-aware access for Job Position Management.
-- Preserve the anonymous open-position listing used by the public CV portal.

revoke all privileges on table public.positions from authenticated;
grant select on table public.positions to authenticated;
grant insert (
  title,
  department,
  description,
  requirements,
  qualifications,
  hiring_manager,
  opening_date
) on table public.positions to authenticated;
grant update (status) on table public.positions to authenticated;

drop policy if exists "Active staff can view positions" on public.positions;
drop policy if exists "HR and IT can create positions" on public.positions;
drop policy if exists "HR and IT can close open positions" on public.positions;

create policy "Active staff can view positions"
  on public.positions
  for select
  to authenticated
  using (
    (select private.current_staff_role()) is not null
    and archived_at is null
  );

create policy "HR and IT can create positions"
  on public.positions
  for insert
  to authenticated
  with check (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and status = 'Open'
    and archived_at is null
  );

create policy "HR and IT can close open positions"
  on public.positions
  for update
  to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and status = 'Open'
    and archived_at is null
  )
  with check (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and status = 'Closed'
    and archived_at is null
  );
