-- Keep workflow write checks as one-time RLS initialization plans and avoid
-- overlapping permissive UPDATE policies on positions.

drop policy if exists "Workflow save can insert stages" on public.recruitment_stages;
drop policy if exists "Workflow save can delete stages" on public.recruitment_stages;

create policy "Workflow save can insert stages"
  on public.recruitment_stages
  for insert
  to authenticated
  with check (
    (select current_setting('app.workflow_save', true)) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

create policy "Workflow save can delete stages"
  on public.recruitment_stages
  for delete
  to authenticated
  using (
    (select current_setting('app.workflow_save', true)) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

drop policy if exists "HR and IT can close open positions" on public.positions;
drop policy if exists "HR and IT can publish configured workflows" on public.positions;

create policy "HR and IT can manage position state"
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
    and archived_at is null
    and (
      status = 'Closed'
      or (
        status = 'Open'
        and workflow_configured = true
        and (select current_setting('app.workflow_save', true)) = 'allowed'
      )
    )
  );

notify pgrst, 'reload schema';
