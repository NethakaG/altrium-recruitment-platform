-- Altrium public CV submission portal
-- The Edge Function uses the service role. Public clients receive no access to
-- submission rows or private CV objects.

create table if not exists public.cv_submissions (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.positions(id) on delete restrict,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  processing_status text not null default 'Pending' check (
    processing_status in ('Pending', 'Processing', 'Processed', 'Failed')
  ),
  submitted_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index if not exists cv_submissions_position_submitted_idx
  on public.cv_submissions (position_id, submitted_at desc);

create index if not exists cv_submissions_pending_idx
  on public.cv_submissions (submitted_at)
  where processing_status = 'Pending';

alter table public.cv_submissions enable row level security;
revoke all on table public.cv_submissions from anon, authenticated;

comment on table public.cv_submissions is
  'Private intake records for CV files received by the submit-cv Edge Function.';

-- Explicit Data API grant for the only browser-readable position fields.
-- RLS still limits rows to Open, non-archived positions.
alter table public.positions enable row level security;
grant usage on schema public to anon;
grant select (id, title, department, status, archived_at) on public.positions to anon;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'positions'
      and policyname = 'Public can view open positions'
  ) then
    create policy "Public can view open positions"
      on public.positions
      for select
      to anon
      using (status = 'Open' and archived_at is null);
  end if;
end
$$;

-- Create or harden the private bucket. No anon/authenticated object policies
-- are created; only the trusted Edge Function service role uploads CVs.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'candidate-cvs',
  'candidate-cvs',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
