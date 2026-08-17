create type public.staff_role as enum (
  'it_admin',
  'hr_recruiter',
  'interviewer',
  'hiring_manager',
  'management_user'
);

create table public.staff_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role public.staff_role,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profiles_email_not_blank check (char_length(trim(email)) > 0),
  constraint staff_profiles_name_not_blank check (
    full_name is null or char_length(trim(full_name)) > 0
  )
);

comment on table public.staff_profiles is
  'Private staff access profiles. New Auth users remain inactive and roleless until an IT Admin assigns access.';
comment on column public.staff_profiles.role is
  'Server-managed Altrium application role; never sourced from user-editable metadata.';

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.staff_profiles
  where id = (select auth.uid())
    and is_active = true
  limit 1;
$$;

revoke all on function private.current_staff_role() from public, anon, authenticated;
grant execute on function private.current_staff_role() to authenticated;

create or replace function private.handle_new_staff_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.staff_profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_staff_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_staff_user();

create trigger set_staff_profiles_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

alter table public.staff_profiles enable row level security;

revoke all privileges on table public.staff_profiles from public, anon, authenticated;
grant select on table public.staff_profiles to authenticated;
grant update (full_name, role, is_active) on table public.staff_profiles to authenticated;

create policy "Staff can view their own access profile"
  on public.staff_profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy "IT Admin can view all staff profiles"
  on public.staff_profiles
  for select
  to authenticated
  using ((select private.current_staff_role()) = 'it_admin');

create policy "IT Admin can update staff access"
  on public.staff_profiles
  for update
  to authenticated
  using ((select private.current_staff_role()) = 'it_admin')
  with check ((select private.current_staff_role()) = 'it_admin');
