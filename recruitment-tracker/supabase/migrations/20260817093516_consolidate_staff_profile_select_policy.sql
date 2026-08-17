drop policy if exists "Staff can view their own access profile" on public.staff_profiles;
drop policy if exists "IT Admin can view all staff profiles" on public.staff_profiles;

create policy "Staff can view permitted profiles"
  on public.staff_profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.current_staff_role()) = 'it_admin'
  );
