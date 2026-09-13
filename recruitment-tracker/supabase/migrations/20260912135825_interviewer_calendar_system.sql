-- Sprint 2 / Feature 1 refinement: calculated interviewer availability.
-- Availability = working hours - holidays - personal events - interviews.

do $$
begin
  create type public.calendar_event_type as enum ('meeting', 'unavailable');
exception when duplicate_object then null;
end $$;

create table public.interviewer_working_hours (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null references public.interviewer_profiles(id) on delete cascade,
  weekday smallint not null,
  starts_at time not null default time '09:00',
  ends_at time not null default time '17:00',
  is_working boolean not null default true,
  constraint interviewer_working_hours_weekday_check check (weekday between 1 and 7),
  constraint interviewer_working_hours_range_check check (ends_at > starts_at),
  constraint interviewer_working_hours_unique unique (interviewer_id, weekday)
);

create table public.calendar_holidays (
  holiday_date date primary key,
  name text not null,
  country_code text not null default 'LK',
  created_at timestamptz not null default now(),
  constraint calendar_holidays_country_check check (country_code = 'LK'),
  constraint calendar_holidays_name_check check (char_length(trim(name)) between 2 and 180)
);

create table public.interviewer_calendar_events (
  id uuid primary key default gen_random_uuid(),
  interviewer_id uuid not null references public.interviewer_profiles(id) on delete cascade,
  title text not null,
  event_type public.calendar_event_type not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text,
  created_by uuid references public.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interviewer_calendar_events_title_check check (char_length(trim(title)) between 2 and 120),
  constraint interviewer_calendar_events_range_check check (ends_at > starts_at),
  constraint interviewer_calendar_events_notes_check check (notes is null or char_length(notes) <= 1000)
);

create trigger set_interviewer_calendar_events_updated_at
  before update on public.interviewer_calendar_events
  for each row execute function public.set_updated_at();

create index interviewer_calendar_events_lookup_idx
  on public.interviewer_calendar_events (interviewer_id, starts_at, ends_at);
create index interviewer_calendar_events_created_by_idx
  on public.interviewer_calendar_events (created_by);

alter table public.interviewer_working_hours enable row level security;
alter table public.calendar_holidays enable row level security;
alter table public.interviewer_calendar_events enable row level security;

revoke all on table public.interviewer_working_hours from public, anon, authenticated;
revoke all on table public.calendar_holidays from public, anon, authenticated;
revoke all on table public.interviewer_calendar_events from public, anon, authenticated;
grant select on table public.interviewer_working_hours to authenticated;
grant select on table public.calendar_holidays to authenticated;
grant select, insert, update, delete on table public.interviewer_calendar_events to authenticated;

create policy "Permitted staff can view working hours"
  on public.interviewer_working_hours for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interviewer_id and profile.staff_id = (select auth.uid())
    )
  );

create policy "Active staff can view Sri Lankan holidays"
  on public.calendar_holidays for select to authenticated
  using ((select private.current_staff_role()) is not null);

create policy "Permitted staff can view calendar events"
  on public.interviewer_calendar_events for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interviewer_id and profile.staff_id = (select auth.uid())
    )
  );

create policy "Calendar RPC can insert own events"
  on public.interviewer_calendar_events for insert to authenticated
  with check (
    (select current_setting('app.calendar_operation', true)) = 'allowed'
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interviewer_id and profile.staff_id = (select auth.uid()) and profile.is_active
    )
  );

create policy "Calendar RPC can update own events"
  on public.interviewer_calendar_events for update to authenticated
  using (
    (select current_setting('app.calendar_operation', true)) = 'allowed'
    and created_by = (select auth.uid())
  )
  with check (
    (select current_setting('app.calendar_operation', true)) = 'allowed'
    and created_by = (select auth.uid())
  );

create policy "Calendar RPC can delete own events"
  on public.interviewer_calendar_events for delete to authenticated
  using (
    (select current_setting('app.calendar_operation', true)) = 'allowed'
    and created_by = (select auth.uid())
  );

create or replace function private.interviewer_period_is_available(
  p_interviewer_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_buffer_minutes integer default 0,
  p_exclude_event_id uuid default null,
  p_exclude_interview_id uuid default null
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  local_start timestamp := p_starts_at at time zone 'Asia/Colombo';
  local_end timestamp := p_ends_at at time zone 'Asia/Colombo';
begin
  if p_starts_at >= p_ends_at
    or local_start::date <> local_end::date
    or extract(isodow from local_start)::integer not between 1 and 5
    or exists (
      select 1 from public.calendar_holidays holiday
      where holiday.holiday_date = local_start::date
    )
    or not exists (
      select 1 from public.interviewer_working_hours hours
      where hours.interviewer_id = p_interviewer_id
        and hours.weekday = extract(isodow from local_start)::integer
        and hours.is_working
        and local_start::time >= hours.starts_at
        and (local_end + make_interval(mins => p_buffer_minutes))::time <= hours.ends_at
        and (local_end + make_interval(mins => p_buffer_minutes))::date = local_start::date
    )
  then return false;
  end if;

  if exists (
    select 1 from public.interviewer_calendar_events event
    where event.interviewer_id = p_interviewer_id
      and event.id <> coalesce(p_exclude_event_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and tstzrange(event.starts_at, event.ends_at, '[)')
        && tstzrange(p_starts_at, p_ends_at + make_interval(mins => p_buffer_minutes), '[)')
  ) then return false;
  end if;

  if exists (
    select 1 from public.interviews interview
    where interview.interviewer_id = p_interviewer_id
      and interview.id <> coalesce(p_exclude_interview_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and interview.status in ('scheduled', 'in_progress', 'awaiting_feedback')
      and tstzrange(interview.scheduled_start, interview.scheduled_end + interval '15 minutes', '[)')
        && tstzrange(p_starts_at, p_ends_at + make_interval(mins => p_buffer_minutes), '[)')
  ) then return false;
  end if;

  return true;
end;
$$;

revoke all on function private.interviewer_period_is_available(uuid,timestamptz,timestamptz,integer,uuid,uuid)
  from public, anon, authenticated;
grant execute on function private.interviewer_period_is_available(uuid,timestamptz,timestamptz,integer,uuid,uuid)
  to authenticated;

create or replace function public.create_calendar_event(
  p_title text,
  p_event_type public.calendar_event_type,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  profile_id uuid;
  new_event_id uuid;
begin
  if (select private.current_staff_role()) <> 'interviewer' then
    raise exception 'Only an interviewer can manage their calendar.' using errcode = '42501';
  end if;
  select id into profile_id from public.interviewer_profiles
  where staff_id = (select auth.uid()) and is_active;
  if profile_id is null then
    raise exception 'Your interviewer profile is not active.' using errcode = '42501';
  end if;
  if p_starts_at <= now() then
    raise exception 'Calendar events must start in the future.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(profile_id::text, 2));
  if not private.interviewer_period_is_available(profile_id, p_starts_at, p_ends_at, 0, null, null) then
    raise exception 'This period is outside working hours or conflicts with another event, holiday or interview.' using errcode = '23P01';
  end if;
  perform set_config('app.calendar_operation', 'allowed', true);
  insert into public.interviewer_calendar_events (
    interviewer_id, title, event_type, starts_at, ends_at, notes, created_by
  ) values (
    profile_id, trim(p_title), p_event_type, p_starts_at, p_ends_at,
    nullif(trim(coalesce(p_notes, '')), ''), (select auth.uid())
  ) returning id into new_event_id;
  return new_event_id;
end;
$$;

create or replace function public.update_calendar_event(
  p_event_id uuid,
  p_title text,
  p_event_type public.calendar_event_type,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.interviewer_calendar_events%rowtype;
begin
  select event.* into target
  from public.interviewer_calendar_events event
  join public.interviewer_profiles profile on profile.id = event.interviewer_id
  where event.id = p_event_id
    and event.created_by = (select auth.uid())
    and profile.staff_id = (select auth.uid())
  for update of event;
  if not found then
    raise exception 'This calendar event is not available to you.' using errcode = '42501';
  end if;
  if p_starts_at <= now() then
    raise exception 'Calendar events must start in the future.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target.interviewer_id::text, 2));
  if not private.interviewer_period_is_available(target.interviewer_id, p_starts_at, p_ends_at, 0, p_event_id, null) then
    raise exception 'This period is outside working hours or conflicts with another event, holiday or interview.' using errcode = '23P01';
  end if;
  perform set_config('app.calendar_operation', 'allowed', true);
  update public.interviewer_calendar_events
  set title = trim(p_title), event_type = p_event_type,
      starts_at = p_starts_at, ends_at = p_ends_at,
      notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_event_id;
  return p_event_id;
end;
$$;

create or replace function public.delete_calendar_event(p_event_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('app.calendar_operation', 'allowed', true);
  delete from public.interviewer_calendar_events event
  using public.interviewer_profiles profile
  where event.id = p_event_id
    and event.interviewer_id = profile.id
    and event.created_by = (select auth.uid())
    and profile.staff_id = (select auth.uid());
  if not found then
    raise exception 'This calendar event is not available to you.' using errcode = '42501';
  end if;
  return p_event_id;
end;
$$;

revoke all on function public.create_calendar_event(text,public.calendar_event_type,timestamptz,timestamptz,text) from public, anon, authenticated;
revoke all on function public.update_calendar_event(uuid,text,public.calendar_event_type,timestamptz,timestamptz,text) from public, anon, authenticated;
revoke all on function public.delete_calendar_event(uuid) from public, anon, authenticated;
grant execute on function public.create_calendar_event(text,public.calendar_event_type,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.update_calendar_event(uuid,text,public.calendar_event_type,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.delete_calendar_event(uuid) to authenticated;

-- Replace manual availability checks in interview scheduling with the calendar.
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

  select * into profile_record from public.interviewer_profiles
  where id = p_interviewer_id and is_active;
  if not found or not (candidate_record.stage_type = any(profile_record.eligible_stage_types)) then
    raise exception 'The selected interviewer is not eligible for this interview.' using errcode = '23514';
  end if;
  if not private.interviewer_period_is_available(p_interviewer_id, p_scheduled_start, p_scheduled_end, 15, null, null) then
    raise exception 'This time is outside working hours or conflicts with an event, holiday or interview.' using errcode = '23P01';
  end if;
  if exists (
    select 1 from public.interviews
    where submission_id = p_submission_id
      and status in ('scheduled', 'in_progress', 'awaiting_feedback')
      and tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange(p_scheduled_start, p_scheduled_end, '[)')
  ) then
    raise exception 'The candidate already has a conflicting interview.' using errcode = '23P01';
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
  if p_scheduled_start <= now() or p_scheduled_end <= p_scheduled_start then
    raise exception 'Choose a valid future interview period.' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(interview_record.interviewer_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(interview_record.submission_id::text, 1));
  if not private.interviewer_period_is_available(interview_record.interviewer_id, p_scheduled_start, p_scheduled_end, 15, null, p_interview_id) then
    raise exception 'This time is outside working hours or conflicts with an event, holiday or interview.' using errcode = '23P01';
  end if;
  if exists (
    select 1 from public.interviews
    where id <> p_interview_id
      and submission_id = interview_record.submission_id
      and status in ('scheduled', 'in_progress', 'awaiting_feedback')
      and tstzrange(scheduled_start, scheduled_end, '[)') && tstzrange(p_scheduled_start, p_scheduled_end, '[)')
  ) then
    raise exception 'The candidate already has a conflicting interview.' using errcode = '23P01';
  end if;

  update public.interview_email_notifications set status = 'cancelled'
  where interview_id = p_interview_id and status in ('pending', 'failed');
  update public.interviews
  set scheduled_start = p_scheduled_start, scheduled_end = p_scheduled_end,
      format = p_format,
      meeting_url = case when p_format = 'online' then nullif(trim(coalesce(p_meeting_url, '')), '') end,
      location = case when p_format = 'physical' then nullif(trim(coalesce(p_location, '')), '') end,
      instructions = nullif(trim(coalesce(p_instructions, '')), '')
  where id = p_interview_id;
  perform private.queue_interview_emails(p_interview_id, 'rescheduled');
  return p_interview_id;
end;
$$;

-- Standard hours for all current and future seeded interviewer profiles.
insert into public.interviewer_working_hours (interviewer_id, weekday, starts_at, ends_at, is_working)
select profile.id, weekday, time '09:00', time '17:00', weekday between 1 and 5
from public.interviewer_profiles profile
cross join generate_series(1, 7) weekday
on conflict (interviewer_id, weekday) do nothing;

-- Official Sri Lankan public holidays for 2026 (Gazette Extraordinary 2438/22).
insert into public.calendar_holidays (holiday_date, name) values
  ('2026-01-03','Duruthu Full Moon Poya Day'),
  ('2026-01-15','Tamil Thai Pongal Day'),
  ('2026-02-01','Nawam Full Moon Poya Day'),
  ('2026-02-04','Independence Day'),
  ('2026-02-15','Maha Sivaratri Day'),
  ('2026-03-02','Medin Full Moon Poya Day'),
  ('2026-03-21','Id-Ul-Fitr (Ramazan Festival Day)'),
  ('2026-04-01','Bak Full Moon Poya Day'),
  ('2026-04-03','Good Friday'),
  ('2026-04-13','Day Prior to Sinhala and Tamil New Year Day'),
  ('2026-04-14','Sinhala and Tamil New Year Day'),
  ('2026-05-01','Vesak Full Moon Poya Day / May Day'),
  ('2026-05-02','Day Following Vesak Full Moon Poya Day'),
  ('2026-05-28','Id-Ul-Alha (Hadj Festival Day)'),
  ('2026-05-30','Adhi Poson Full Moon Poya Day'),
  ('2026-06-29','Poson Full Moon Poya Day'),
  ('2026-07-29','Esala Full Moon Poya Day'),
  ('2026-08-26','Milad-Un-Nabi (The Prophet''s Birthday)'),
  ('2026-08-27','Nikini Full Moon Poya Day'),
  ('2026-09-26','Binara Full Moon Poya Day'),
  ('2026-10-25','Vap Full Moon Poya Day'),
  ('2026-11-08','Deepavali Festival Day'),
  ('2026-11-24','Il Full Moon Poya Day'),
  ('2026-12-23','Unduvap Full Moon Poya Day'),
  ('2026-12-25','Christmas Day')
on conflict (holiday_date) do update set name = excluded.name;

-- Realistic prototype calendars, anchored to the next Monday after deployment.
with base as (
  select current_date + (8 - extract(isodow from current_date)::integer) as monday
), seeded(display_name, title, event_type, day_offset, start_time, end_time, notes) as (values
  ('Purnod Abeyasinghe','Platform architecture sync','meeting'::public.calendar_event_type,0,time '10:00',time '11:00','Weekly architecture alignment.'),
  ('Purnod Abeyasinghe','Cloud reliability review','meeting'::public.calendar_event_type,1,time '13:00',time '14:30','Operational reliability review.'),
  ('Purnod Abeyasinghe','Focus time','unavailable'::public.calendar_event_type,2,time '09:00',time '10:30','Reserved engineering focus block.'),
  ('Chathumina','Backend sprint planning','meeting'::public.calendar_event_type,0,time '09:30',time '10:30','Engineering sprint planning.'),
  ('Chathumina','API code review','meeting'::public.calendar_event_type,1,time '14:00',time '15:00','Backend review session.'),
  ('Chathumina','Development focus block','unavailable'::public.calendar_event_type,3,time '11:00',time '13:00','Unavailable for interviews.'),
  ('Hovindi','Marketing campaign stand-up','meeting'::public.calendar_event_type,0,time '09:30',time '10:00','Campaign progress check.'),
  ('Hovindi','Content review','meeting'::public.calendar_event_type,2,time '13:00',time '14:00','Weekly content review.'),
  ('Hovindi','Client campaign work','unavailable'::public.calendar_event_type,4,time '10:00',time '12:00','Reserved campaign work.')
)
insert into public.interviewer_calendar_events (
  interviewer_id, title, event_type, starts_at, ends_at, notes, created_by
)
select profile.id, seeded.title, seeded.event_type,
  ((base.monday + seeded.day_offset + seeded.start_time) at time zone 'Asia/Colombo'),
  ((base.monday + seeded.day_offset + seeded.end_time) at time zone 'Asia/Colombo'),
  seeded.notes, profile.staff_id
from seeded
cross join base
join public.interviewer_profiles profile on profile.display_name = seeded.display_name
where not exists (
  select 1 from public.interviewer_calendar_events existing
  where existing.interviewer_id = profile.id and existing.title = seeded.title
);

comment on table public.interviewer_availability is
  'Deprecated by calculated calendar availability. Preserved for migration compatibility only.';

notify pgrst, 'reload schema';
