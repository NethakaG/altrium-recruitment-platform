-- Sprint 2 / Feature 1: interview scheduling, internal availability and
-- notification outbox. Gmail delivery is performed by a protected Edge Function.

create extension if not exists btree_gist with schema extensions;

do $$
begin
  create type public.interview_format as enum ('online', 'physical');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.interview_status as enum (
    'scheduled', 'in_progress', 'awaiting_feedback', 'completed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.interview_notification_status as enum (
    'pending', 'sending', 'sent', 'failed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.interview_notification_type as enum (
    'scheduled', 'rescheduled', 'cancelled', 'reminder_24h', 'reminder_1h'
  );
exception when duplicate_object then null;
end $$;

create table public.interviewer_profiles (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid unique references public.staff_profiles(id) on delete set null,
  display_name text not null,
  contact_email text,
  years_experience integer not null,
  role_title text not null,
  professional_summary text not null,
  specializations text[] not null default '{}',
  eligible_stage_types public.recruitment_stage_type[] not null default '{}',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interviewer_profiles_name_check check (char_length(trim(display_name)) between 2 and 120),
  constraint interviewer_profiles_email_check check (
    contact_email is null or contact_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
  ),
  constraint interviewer_profiles_experience_check check (years_experience between 0 and 60),
  constraint interviewer_profiles_active_account_check check (
    is_active = false or (staff_id is not null and contact_email is not null)
  )
);

create trigger set_interviewer_profiles_updated_at
  before update on public.interviewer_profiles
  for each row execute function public.set_updated_at();

create table public.interviewer_availability (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null references public.interviewer_profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Colombo',
  created_at timestamptz not null default now(),
  constraint interviewer_availability_range_check check (ends_at > starts_at),
  constraint interviewer_availability_timezone_check check (timezone = 'Asia/Colombo')
);

create index interviewer_availability_lookup_idx
  on public.interviewer_availability (interviewer_id, starts_at, ends_at);

alter table public.interviewer_availability
  add constraint interviewer_availability_no_overlap
  exclude using gist (
    interviewer_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  );

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.cv_submissions(id) on delete cascade,
  stage_id uuid not null references public.recruitment_stages(id) on delete restrict,
  interviewer_id uuid not null references public.interviewer_profiles(id) on delete restrict,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  buffer_minutes integer not null default 15,
  format public.interview_format not null,
  meeting_url text,
  location text,
  instructions text,
  status public.interview_status not null default 'scheduled',
  actual_start timestamptz,
  actual_end timestamptz,
  cancellation_reason text,
  created_by uuid not null references public.staff_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interviews_scheduled_range_check check (scheduled_end > scheduled_start),
  constraint interviews_buffer_check check (buffer_minutes = 15),
  constraint interviews_format_details_check check (
    (format = 'online' and char_length(trim(coalesce(meeting_url, ''))) > 0 and location is null)
    or
    (format = 'physical' and char_length(trim(coalesce(location, ''))) > 0 and meeting_url is null)
  ),
  constraint interviews_actual_range_check check (
    actual_end is null or (actual_start is not null and actual_end >= actual_start)
  ),
  constraint interviews_cancellation_reason_check check (
    status <> 'cancelled' or char_length(trim(coalesce(cancellation_reason, ''))) >= 3
  )
);

create trigger set_interviews_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

create index interviews_submission_stage_idx
  on public.interviews (submission_id, stage_id, created_at desc);
create index interviews_interviewer_time_idx
  on public.interviews (interviewer_id, scheduled_start);

create index interviews_active_schedule_idx
  on public.interviews (interviewer_id, scheduled_start, scheduled_end)
  where status in ('scheduled', 'in_progress', 'awaiting_feedback');

create table public.interview_email_notifications (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  recipient_email text not null,
  recipient_kind text not null,
  notification_type public.interview_notification_type not null,
  scheduled_for timestamptz not null,
  status public.interview_notification_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  deduplication_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_email_recipient_check check (
    recipient_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
  ),
  constraint interview_email_recipient_kind_check check (
    recipient_kind in ('candidate', 'interviewer')
  ),
  constraint interview_email_attempts_check check (attempts between 0 and 10)
);

create trigger set_interview_email_notifications_updated_at
  before update on public.interview_email_notifications
  for each row execute function public.set_updated_at();

create index interview_email_due_idx
  on public.interview_email_notifications (scheduled_for, status)
  where status in ('pending', 'failed');

alter table public.interviewer_profiles enable row level security;
alter table public.interviewer_availability enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_email_notifications enable row level security;

revoke all on table public.interviewer_profiles from public, anon, authenticated;
revoke all on table public.interviewer_availability from public, anon, authenticated;
revoke all on table public.interviews from public, anon, authenticated;
revoke all on table public.interview_email_notifications from public, anon, authenticated;

grant select on table public.interviewer_profiles to authenticated;
grant select, insert, delete on table public.interviewer_availability to authenticated;
grant select, insert, update on table public.interviews to authenticated;
grant select, insert, update on table public.interview_email_notifications to authenticated;

create policy "Recruiters can view interviewer profiles"
  on public.interviewer_profiles for select to authenticated
  using ((select private.current_staff_role()) in ('it_admin', 'hr_recruiter'));

create policy "Interviewers can view their own profile"
  on public.interviewer_profiles for select to authenticated
  using (staff_id = (select auth.uid()));

create policy "Recruiters can view availability"
  on public.interviewer_availability for select to authenticated
  using ((select private.current_staff_role()) in ('it_admin', 'hr_recruiter'));

create policy "Interviewers can view their availability"
  on public.interviewer_availability for select to authenticated
  using (exists (
    select 1 from public.interviewer_profiles profile
    where profile.id = interviewer_id and profile.staff_id = (select auth.uid())
  ));

create policy "Interviewers can add their availability"
  on public.interviewer_availability for insert to authenticated
  with check (exists (
    select 1 from public.interviewer_profiles profile
    where profile.id = interviewer_id and profile.staff_id = (select auth.uid()) and profile.is_active
  ));

create policy "Interviewers can remove their availability"
  on public.interviewer_availability for delete to authenticated
  using (exists (
    select 1 from public.interviewer_profiles profile
    where profile.id = interviewer_id and profile.staff_id = (select auth.uid())
  ));

create policy "Recruiters can view interviews"
  on public.interviews for select to authenticated
  using ((select private.current_staff_role()) in ('it_admin', 'hr_recruiter'));

create policy "Interviewers can view assigned interviews"
  on public.interviews for select to authenticated
  using (exists (
    select 1 from public.interviewer_profiles profile
    where profile.id = interviewer_id and profile.staff_id = (select auth.uid())
  ));

-- Mutations are deliberately limited to the RPC transaction. Data API clients
-- cannot set this transaction-local marker themselves.
create policy "Scheduling RPC can insert interviews"
  on public.interviews for insert to authenticated
  with check (
    current_setting('app.interview_operation', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

create policy "Scheduling RPC can update interviews"
  on public.interviews for update to authenticated
  using (current_setting('app.interview_operation', true) = 'allowed')
  with check (current_setting('app.interview_operation', true) = 'allowed');

create policy "Recruiters can view interview emails"
  on public.interview_email_notifications for select to authenticated
  using ((select private.current_staff_role()) in ('it_admin', 'hr_recruiter'));

create policy "Interviewers can view their interview emails"
  on public.interview_email_notifications for select to authenticated
  using (exists (
    select 1
    from public.interviews interview
    join public.interviewer_profiles profile on profile.id = interview.interviewer_id
    where interview.id = interview_id and profile.staff_id = (select auth.uid())
  ));

create policy "Scheduling RPC can insert interview emails"
  on public.interview_email_notifications for insert to authenticated
  with check (
    current_setting('app.interview_operation', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

create policy "Scheduling RPC can update interview emails"
  on public.interview_email_notifications for update to authenticated
  using (
    current_setting('app.interview_operation', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  )
  with check (
    current_setting('app.interview_operation', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

create or replace function private.queue_interview_emails(
  p_interview_id uuid,
  p_event public.interview_notification_type
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  interview_record record;
  event_key text := gen_random_uuid()::text;
begin
  select candidate.candidate_email, profile.contact_email, interview.scheduled_start
  into interview_record
  from public.interviews interview
  join public.cv_submissions candidate on candidate.id = interview.submission_id
  join public.interviewer_profiles profile on profile.id = interview.interviewer_id
  where interview.id = p_interview_id;

  if interview_record.candidate_email is null or interview_record.contact_email is null then
    raise exception 'Candidate and interviewer email addresses are required.' using errcode = '23514';
  end if;

  insert into public.interview_email_notifications (
    interview_id, recipient_email, recipient_kind, notification_type,
    scheduled_for, deduplication_key
  ) values
    (p_interview_id, lower(interview_record.candidate_email), 'candidate', p_event, now(),
      p_interview_id::text || ':' || p_event::text || ':candidate:' || event_key),
    (p_interview_id, lower(interview_record.contact_email), 'interviewer', p_event, now(),
      p_interview_id::text || ':' || p_event::text || ':interviewer:' || event_key);

  if p_event in ('scheduled', 'rescheduled') then
    insert into public.interview_email_notifications (
      interview_id, recipient_email, recipient_kind, notification_type,
      scheduled_for, deduplication_key
    )
    select p_interview_id, recipient.email, recipient.kind, reminder.type,
      interview_record.scheduled_start - reminder.lead_time,
      p_interview_id::text || ':' || reminder.type::text || ':' || recipient.kind || ':' || event_key
    from (values
      (lower(interview_record.candidate_email), 'candidate'),
      (lower(interview_record.contact_email), 'interviewer')
    ) recipient(email, kind)
    cross join (values
      ('reminder_24h'::public.interview_notification_type, interval '24 hours'),
      ('reminder_1h'::public.interview_notification_type, interval '1 hour')
    ) reminder(type, lead_time)
    where interview_record.scheduled_start - reminder.lead_time > now();
  end if;
end;
$$;

revoke all on function private.queue_interview_emails(uuid, public.interview_notification_type)
  from public, anon, authenticated;
grant execute on function private.queue_interview_emails(uuid, public.interview_notification_type)
  to authenticated;

create or replace function public.create_interview(
  p_submission_id uuid,
  p_interviewer_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_format public.interview_format,
  p_meeting_url text default null,
  p_location text default null,
  p_instructions text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate_record record;
  profile_record public.interviewer_profiles%rowtype;
  new_interview_id uuid;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can schedule interviews.' using errcode = '42501';
  end if;
  if p_scheduled_start <= now() or p_scheduled_end <= p_scheduled_start then
    raise exception 'Choose a valid future interview period.' using errcode = '23514';
  end if;
  perform set_config('app.interview_operation', 'allowed', true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_interviewer_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_submission_id::text, 1));

  select candidate.id, candidate.current_stage_id, candidate.application_status,
    candidate.candidate_email, stage.stage_type
  into candidate_record
  from public.cv_submissions candidate
  join public.recruitment_stages stage on stage.id = candidate.current_stage_id
  where candidate.id = p_submission_id
  for update of candidate;

  if not found or candidate_record.application_status <> 'Active' then
    raise exception 'Only an active candidate can be scheduled.' using errcode = '23514';
  end if;
  if candidate_record.stage_type not in (
    'hr_interview', 'technical_interview', 'hiring_manager_interview',
    'engineering_manager_interview', 'executive_interview'
  ) then
    raise exception 'The candidate is not currently at an interview stage.' using errcode = '23514';
  end if;
  if candidate_record.candidate_email is null then
    raise exception 'A candidate email address is required before scheduling.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.interviews
    where submission_id = p_submission_id
      and stage_id = candidate_record.current_stage_id
      and status <> 'cancelled'
  ) then
    raise exception 'This candidate already has an interview for the current stage.' using errcode = '23505';
  end if;

  select * into profile_record
  from public.interviewer_profiles
  where id = p_interviewer_id and is_active = true;

  if not found or not (candidate_record.stage_type = any(profile_record.eligible_stage_types)) then
    raise exception 'The selected interviewer is not eligible for this interview.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.interviewer_availability
    where interviewer_id = p_interviewer_id
      and starts_at <= p_scheduled_start
      and ends_at >= p_scheduled_end + interval '15 minutes'
  ) then
    raise exception 'The selected time is outside the interviewer availability.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.interviews
    where status in ('scheduled', 'in_progress', 'awaiting_feedback')
      and (
        (interviewer_id = p_interviewer_id and tstzrange(scheduled_start, scheduled_end + interval '15 minutes', '[)') && tstzrange(p_scheduled_start, p_scheduled_end + interval '15 minutes', '[)'))
        or (submission_id = p_submission_id and tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange(p_scheduled_start, p_scheduled_end, '[)'))
      )
  ) then
    raise exception 'The candidate or interviewer already has a conflicting interview.' using errcode = '23P01';
  end if;

  insert into public.interviews (
    submission_id, stage_id, interviewer_id, scheduled_start, scheduled_end,
    format, meeting_url, location, instructions, created_by
  ) values (
    p_submission_id, candidate_record.current_stage_id, p_interviewer_id,
    p_scheduled_start, p_scheduled_end, p_format,
    case when p_format = 'online' then nullif(trim(coalesce(p_meeting_url, '')), '') end,
    case when p_format = 'physical' then nullif(trim(coalesce(p_location, '')), '') end,
    nullif(trim(coalesce(p_instructions, '')), ''), (select auth.uid())
  ) returning id into new_interview_id;

  perform private.queue_interview_emails(new_interview_id, 'scheduled');
  return new_interview_id;
end;
$$;

create or replace function public.reschedule_interview(
  p_interview_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_format public.interview_format,
  p_meeting_url text default null,
  p_location text default null,
  p_instructions text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  interview_record public.interviews%rowtype;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can reschedule interviews.' using errcode = '42501';
  end if;
  perform set_config('app.interview_operation', 'allowed', true);
  select * into interview_record from public.interviews where id = p_interview_id for update;
  if not found or interview_record.status <> 'scheduled' then
    raise exception 'Only a scheduled interview can be rescheduled.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(interview_record.interviewer_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(interview_record.submission_id::text, 1));
  if p_scheduled_start <= now() or p_scheduled_end <= p_scheduled_start then
    raise exception 'Choose a valid future interview period.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.interviewer_availability
    where interviewer_id = interview_record.interviewer_id
      and starts_at <= p_scheduled_start
      and ends_at >= p_scheduled_end + interval '15 minutes'
  ) then
    raise exception 'The selected time is outside the interviewer availability.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.interviews
    where id <> p_interview_id
      and status in ('scheduled', 'in_progress', 'awaiting_feedback')
      and (
        (interviewer_id = interview_record.interviewer_id and tstzrange(scheduled_start, scheduled_end + interval '15 minutes', '[)') && tstzrange(p_scheduled_start, p_scheduled_end + interval '15 minutes', '[)'))
        or (submission_id = interview_record.submission_id and tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange(p_scheduled_start, p_scheduled_end, '[)'))
      )
  ) then
    raise exception 'The candidate or interviewer already has a conflicting interview.' using errcode = '23P01';
  end if;

  update public.interview_email_notifications
  set status = 'cancelled'
  where interview_id = p_interview_id and status in ('pending', 'failed');

  update public.interviews
  set scheduled_start = p_scheduled_start,
      scheduled_end = p_scheduled_end,
      format = p_format,
      meeting_url = case when p_format = 'online' then nullif(trim(coalesce(p_meeting_url, '')), '') end,
      location = case when p_format = 'physical' then nullif(trim(coalesce(p_location, '')), '') end,
      instructions = nullif(trim(coalesce(p_instructions, '')), '')
  where id = p_interview_id;

  perform private.queue_interview_emails(p_interview_id, 'rescheduled');
  return p_interview_id;
end;
$$;

create or replace function public.cancel_interview(p_interview_id uuid, p_reason text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can cancel interviews.' using errcode = '42501';
  end if;
  perform set_config('app.interview_operation', 'allowed', true);
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Provide a cancellation reason.' using errcode = '23514';
  end if;

  update public.interviews
  set status = 'cancelled', cancellation_reason = trim(p_reason)
  where id = p_interview_id and status = 'scheduled';
  if not found then
    raise exception 'Only a scheduled interview can be cancelled.' using errcode = '23514';
  end if;

  update public.interview_email_notifications
  set status = 'cancelled'
  where interview_id = p_interview_id and status in ('pending', 'failed');
  perform private.queue_interview_emails(p_interview_id, 'cancelled');
  return p_interview_id;
end;
$$;

create or replace function public.start_interview(p_interview_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare started_at timestamptz := now();
begin
  perform set_config('app.interview_operation', 'allowed', true);
  update public.interviews interview
  set status = 'in_progress', actual_start = started_at
  where interview.id = p_interview_id
    and interview.status = 'scheduled'
    and exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interview.interviewer_id and profile.staff_id = (select auth.uid())
    );
  if not found then
    raise exception 'Only the assigned interviewer can start this interview.' using errcode = '42501';
  end if;
  return started_at;
end;
$$;

create or replace function public.end_interview(
  p_interview_id uuid,
  p_actual_end timestamptz default now()
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('app.interview_operation', 'allowed', true);
  update public.interviews interview
  set status = 'awaiting_feedback', actual_end = p_actual_end
  where interview.id = p_interview_id
    and interview.status = 'in_progress'
    and p_actual_end >= interview.actual_start
    and (
      exists (
        select 1 from public.interviewer_profiles profile
        where profile.id = interview.interviewer_id and profile.staff_id = (select auth.uid())
      )
      or (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    );
  if not found then
    raise exception 'This interview cannot be ended by the current user.' using errcode = '42501';
  end if;
  return p_actual_end;
end;
$$;

revoke all on function public.create_interview(uuid, uuid, timestamptz, timestamptz, public.interview_format, text, text, text) from public, anon, authenticated;
revoke all on function public.reschedule_interview(uuid, timestamptz, timestamptz, public.interview_format, text, text, text) from public, anon, authenticated;
revoke all on function public.cancel_interview(uuid, text) from public, anon, authenticated;
revoke all on function public.start_interview(uuid) from public, anon, authenticated;
revoke all on function public.end_interview(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.create_interview(uuid, uuid, timestamptz, timestamptz, public.interview_format, text, text, text) to authenticated;
grant execute on function public.reschedule_interview(uuid, timestamptz, timestamptz, public.interview_format, text, text, text) to authenticated;
grant execute on function public.cancel_interview(uuid, text) to authenticated;
grant execute on function public.start_interview(uuid) to authenticated;
grant execute on function public.end_interview(uuid, timestamptz) to authenticated;

-- Interviewers can only see candidate records that belong to their assignments.
drop policy if exists "Active staff can view permitted candidates" on public.cv_submissions;
create policy "Active staff can view permitted candidates"
  on public.cv_submissions for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or (
      (select private.current_staff_role()) = 'interviewer'
      and exists (
        select 1
        from public.interviews interview
        join public.interviewer_profiles profile on profile.id = interview.interviewer_id
        where interview.submission_id = cv_submissions.id
          and profile.staff_id = (select auth.uid())
          and interview.status <> 'cancelled'
      )
    )
    or exists (
      select 1 from public.recruitment_stages stage
      where stage.id = current_stage_id
        and (
          ((select private.current_staff_role()) = 'hiring_manager' and stage.stage_type in (
            'technical_assessment', 'technical_interview', 'hiring_manager_interview',
            'engineering_manager_interview', 'executive_interview', 'final_decision'
          ))
          or ((select private.current_staff_role()) = 'management_user' and stage.stage_type in (
            'executive_interview', 'final_decision'
          ))
        )
    )
  );

-- Seed a stable demonstration vacancy. It remains open until test CVs are submitted.
insert into public.positions (
  title, department, description, requirements, qualifications,
  hiring_manager, opening_date, status, workflow_configured, rubric_configured
)
select
  'Cloud Platform Engineer',
  'Engineering',
  'Build and operate dependable cloud platforms, backend services and deployment systems for Altrium products.',
  'Experience with backend development, APIs, cloud infrastructure, databases, DevOps and production reliability.',
  'A degree or equivalent professional experience in software engineering, computer science or a related field.',
  'Engineering Manager',
  current_date,
  'Open', true, false
where not exists (
  select 1 from public.positions where title = 'Cloud Platform Engineer' and archived_at is null
);

insert into public.recruitment_stages (position_id, name, stage_order, stage_type)
select position.id, stage.name, stage.stage_order, stage.stage_type::public.recruitment_stage_type
from public.positions position
cross join (values
  ('CV Review', 1, 'cv_review'),
  ('Technical Interview', 2, 'technical_interview'),
  ('Final Decision', 3, 'final_decision')
) stage(name, stage_order, stage_type)
where position.title = 'Cloud Platform Engineer'
  and position.archived_at is null
  and not exists (
    select 1 from public.recruitment_stages existing where existing.position_id = position.id
  );

insert into public.position_screening_rubrics (position_id, criteria, shortlist_count, created_by)
select position.id, jsonb_build_array(
  jsonb_build_object('id','backend_apis','name','Backend and API engineering','description','Evidence of building dependable backend services, integrations and production APIs.','weight',25),
  jsonb_build_object('id','cloud_devops','name','Cloud and DevOps','description','Evidence of cloud platforms, containers, deployment pipelines and infrastructure operations.','weight',25),
  jsonb_build_object('id','databases','name','Databases and data reliability','description','Evidence of relational databases, data modelling, performance and operational reliability.','weight',20),
  jsonb_build_object('id','system_reliability','name','Architecture and reliability','description','Evidence of scalable architecture, observability, security and incident-aware engineering.','weight',20),
  jsonb_build_object('id','collaboration','name','Communication and collaboration','description','Evidence of ownership, teamwork and clear technical communication.','weight',10)
), 3, admin.id
from public.positions position
cross join lateral (
  select id from public.staff_profiles
  where role = 'it_admin' and is_active = true
  order by created_at limit 1
) admin
where position.title = 'Cloud Platform Engineer'
  and position.archived_at is null
on conflict (position_id) do nothing;

update public.positions position
set rubric_configured = true
where position.title = 'Cloud Platform Engineer'
  and exists (
    select 1 from public.position_screening_rubrics rubric where rubric.position_id = position.id
  );

insert into public.interviewer_profiles (
  staff_id, display_name, contact_email, years_experience, role_title,
  professional_summary, specializations, eligible_stage_types, is_active
)
select staff.id, 'Purnod Abeyasinghe', lower(staff.email), 9,
  'Senior Engineering Interviewer',
  'Senior engineer experienced in cloud platforms, system architecture, DevOps and engineering leadership.',
  array['Cloud infrastructure','System architecture','DevOps','Containers','Backend systems','Engineering leadership'],
  array['technical_interview'::public.recruitment_stage_type], true
from public.staff_profiles staff
where staff.role = 'interviewer'
order by staff.created_at
limit 1
on conflict (staff_id) do update set
  display_name = excluded.display_name,
  contact_email = excluded.contact_email,
  years_experience = excluded.years_experience,
  role_title = excluded.role_title,
  professional_summary = excluded.professional_summary,
  specializations = excluded.specializations,
  eligible_stage_types = excluded.eligible_stage_types,
  is_active = excluded.is_active;

insert into public.interviewer_profiles (
  display_name, years_experience, role_title, professional_summary,
  specializations, eligible_stage_types, is_active
)
select seed.display_name, seed.years_experience, seed.role_title, seed.professional_summary,
  seed.specializations, seed.eligible_stage_types, false
from (values
  (
    'Hovindi', 4, 'Marketing Interviewer',
    'Marketing specialist experienced in content strategy, campaigns, social media and digital analytics.',
    array['Digital marketing','Content strategy','Campaign management','Social media analytics'],
    array['hr_interview'::public.recruitment_stage_type]
  ),
  (
    'Chathumina', 5, 'Software Engineering Interviewer',
    'Software engineer experienced in backend development, TypeScript, APIs, PostgreSQL and automated testing.',
    array['Backend development','REST APIs','TypeScript','Node.js','PostgreSQL','Testing'],
    array['technical_interview'::public.recruitment_stage_type]
  )
) seed(display_name, years_experience, role_title, professional_summary, specializations, eligible_stage_types)
where not exists (
  select 1 from public.interviewer_profiles existing where lower(existing.display_name) = lower(seed.display_name)
);

-- Practical demo availability for Purnod: weekday 09:00-17:00 Sri Lanka time
-- over the next fourteen days. Interview duration plus the 15-minute buffer
-- must fit inside one of these windows.
insert into public.interviewer_availability (interviewer_id, starts_at, ends_at)
select profile.id,
  ((day::date + time '09:00') at time zone 'Asia/Colombo'),
  ((day::date + time '17:00') at time zone 'Asia/Colombo')
from public.interviewer_profiles profile
cross join generate_series(current_date + 1, current_date + 14, interval '1 day') day
where profile.display_name = 'Purnod Abeyasinghe'
  and profile.is_active
  and extract(isodow from day) between 1 and 5
  and not exists (
    select 1 from public.interviewer_availability existing
    where existing.interviewer_id = profile.id
      and existing.starts_at = ((day::date + time '09:00') at time zone 'Asia/Colombo')
  );

notify pgrst, 'reload schema';
