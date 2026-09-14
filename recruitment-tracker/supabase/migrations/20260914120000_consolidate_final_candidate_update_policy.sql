-- Keep candidate updates under one policy so Postgres evaluates a single
-- permission expression for HR/IT workflow actions and Executive approvals.

drop policy if exists "HR and IT can update candidate progress" on public.cv_submissions;
drop policy if exists "Final decision RPC can update candidate outcome" on public.cv_submissions;

create policy "Authorized staff can update candidate workflow"
  on public.cv_submissions for update to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or (
      (select current_setting('app.final_decision_operation', true)) = 'allowed'
      and (select private.current_staff_role()) = 'management_user'
    )
  )
  with check (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or (
      (select current_setting('app.final_decision_operation', true)) = 'allowed'
      and (select private.current_staff_role()) = 'management_user'
    )
  );

notify pgrst, 'reload schema';
