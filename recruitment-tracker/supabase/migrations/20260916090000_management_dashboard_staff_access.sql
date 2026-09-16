create table public.staff_access_audit (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff_profiles(id) on delete cascade,
  changed_by uuid not null references public.staff_profiles(id) on delete restrict,
  action text not null check (action in ('profile_updated', 'role_changed', 'activated', 'deactivated', 'access_updated')),
  previous_role public.staff_role,
  new_role public.staff_role,
  previous_is_active boolean not null,
  new_is_active boolean not null,
  previous_full_name text,
  new_full_name text,
  changed_at timestamptz not null default now()
);

comment on table public.staff_access_audit is
  'Immutable history of staff access changes made through the IT Admin workflow.';

create index staff_access_audit_staff_changed_idx
  on public.staff_access_audit (staff_id, changed_at desc);

create index staff_access_audit_actor_changed_idx
  on public.staff_access_audit (changed_by, changed_at desc);

alter table public.staff_access_audit enable row level security;

revoke all privileges on table public.staff_access_audit from public, anon, authenticated;
grant select on table public.staff_access_audit to authenticated;
grant insert (
  staff_id,
  changed_by,
  action,
  previous_role,
  new_role,
  previous_is_active,
  new_is_active,
  previous_full_name,
  new_full_name
) on table public.staff_access_audit to authenticated;

create policy "IT Admin can view staff access audit"
  on public.staff_access_audit
  for select
  to authenticated
  using ((select private.current_staff_role()) = 'it_admin');

create policy "Staff access RPC can write audit"
  on public.staff_access_audit
  for insert
  to authenticated
  with check (
    (select private.current_staff_role()) = 'it_admin'
    and changed_by = (select auth.uid())
    and current_setting('app.staff_access_operation', true) = 'allowed'
  );

drop policy if exists "IT Admin can update staff access" on public.staff_profiles;

create policy "Staff access RPC can update staff profiles"
  on public.staff_profiles
  for update
  to authenticated
  using (
    (select private.current_staff_role()) = 'it_admin'
    and current_setting('app.staff_access_operation', true) = 'allowed'
  )
  with check (
    (select private.current_staff_role()) = 'it_admin'
    and current_setting('app.staff_access_operation', true) = 'allowed'
  );

create or replace function public.update_staff_access(
  p_staff_id uuid,
  p_full_name text,
  p_role public.staff_role,
  p_is_active boolean
)
returns public.staff_profiles
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before public.staff_profiles%rowtype;
  v_after public.staff_profiles%rowtype;
  v_action text;
begin
  if (select private.current_staff_role()) <> 'it_admin' then
    raise exception 'Only an active IT Admin can manage staff access.' using errcode = '42501';
  end if;

  if p_staff_id is null or p_role is null then
    raise exception 'A staff account and role are required.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_full_name, '')), '') is null
     or char_length(trim(p_full_name)) < 2
     or char_length(trim(p_full_name)) > 120 then
    raise exception 'Full name must contain between 2 and 120 characters.' using errcode = '22023';
  end if;

  select *
  into v_before
  from public.staff_profiles
  where id = p_staff_id
  for update;

  if not found then
    raise exception 'Staff account not found.' using errcode = 'P0002';
  end if;

  if p_staff_id = (select auth.uid())
     and (p_is_active is false or p_role <> 'it_admin') then
    raise exception 'You cannot deactivate or remove your own IT Admin access.' using errcode = '42501';
  end if;

  if v_before.is_active
     and v_before.role = 'it_admin'
     and (p_is_active is false or p_role <> 'it_admin') then
    perform pg_advisory_xact_lock(hashtext('altrium_active_it_admin'));
    if not exists (
      select 1
      from public.staff_profiles
      where id <> p_staff_id
        and role = 'it_admin'
        and is_active = true
    ) then
      raise exception 'At least one active IT Admin must remain.' using errcode = '23514';
    end if;
  end if;

  if v_before.is_active is false and p_is_active then
    v_action := 'activated';
  elsif v_before.is_active and p_is_active is false then
    v_action := 'deactivated';
  elsif v_before.role is distinct from p_role then
    v_action := 'role_changed';
  elsif v_before.full_name is distinct from trim(p_full_name) then
    v_action := 'profile_updated';
  else
    v_action := 'access_updated';
  end if;

  perform set_config('app.staff_access_operation', 'allowed', true);

  update public.staff_profiles
  set full_name = trim(p_full_name),
      role = p_role,
      is_active = p_is_active
  where id = p_staff_id
  returning * into v_after;

  insert into public.staff_access_audit (
    staff_id,
    changed_by,
    action,
    previous_role,
    new_role,
    previous_is_active,
    new_is_active,
    previous_full_name,
    new_full_name
  ) values (
    p_staff_id,
    (select auth.uid()),
    v_action,
    v_before.role,
    v_after.role,
    v_before.is_active,
    v_after.is_active,
    v_before.full_name,
    v_after.full_name
  );

  return v_after;
end;
$$;

revoke all on function public.update_staff_access(uuid, text, public.staff_role, boolean)
  from public, anon, authenticated;
grant execute on function public.update_staff_access(uuid, text, public.staff_role, boolean)
  to authenticated;
