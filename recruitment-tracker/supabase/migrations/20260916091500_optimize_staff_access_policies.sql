drop policy if exists "Staff access RPC can update staff profiles" on public.staff_profiles;
create policy "Staff access RPC can update staff profiles"
  on public.staff_profiles
  for update
  to authenticated
  using (
    (select private.current_staff_role()) = 'it_admin'
    and (select current_setting('app.staff_access_operation', true)) = 'allowed'
  )
  with check (
    (select private.current_staff_role()) = 'it_admin'
    and (select current_setting('app.staff_access_operation', true)) = 'allowed'
  );

drop policy if exists "Staff access RPC can write audit" on public.staff_access_audit;
create policy "Staff access RPC can write audit"
  on public.staff_access_audit
  for insert
  to authenticated
  with check (
    (select private.current_staff_role()) = 'it_admin'
    and changed_by = (select auth.uid())
    and (select current_setting('app.staff_access_operation', true)) = 'allowed'
  );
