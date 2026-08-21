-- Function 4: immutable position rubrics, AI-assisted screening and deterministic ranking.

alter table public.positions
  add column if not exists rubric_configured boolean not null default false,
  add column if not exists screening_status text not null default 'Not started',
  add column if not exists screening_error text,
  add column if not exists screening_started_at timestamptz,
  add column if not exists screening_completed_at timestamptz,
  add column if not exists closed_at timestamptz;

alter table public.positions
  drop constraint if exists positions_screening_status_check,
  add constraint positions_screening_status_check check (
    screening_status in ('Not started', 'Processing', 'Completed', 'Failed')
  );

create table public.position_screening_rubrics (
  position_id uuid primary key references public.positions(id) on delete restrict,
  criteria jsonb not null,
  shortlist_count integer not null default 3,
  created_by uuid not null references auth.users(id) on delete restrict,
  locked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint position_screening_rubrics_criteria_check check (
    jsonb_typeof(criteria) = 'array'
    and jsonb_array_length(criteria) between 3 and 8
  ),
  constraint position_screening_rubrics_shortlist_count_check check (
    shortlist_count between 1 and 5
  )
);

comment on table public.position_screening_rubrics is
  'Locked scoring criteria for a position. No update or delete access is exposed.';

create table public.candidate_screenings (
  submission_id uuid primary key references public.cv_submissions(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete restrict,
  criterion_scores jsonb not null,
  total_score numeric(5,2) not null,
  summary text not null,
  screening_model text not null,
  screened_at timestamptz not null default now(),
  rank integer,
  decision text,
  constraint candidate_screenings_scores_check check (
    jsonb_typeof(criterion_scores) = 'array'
  ),
  constraint candidate_screenings_total_score_check check (
    total_score between 0 and 100
  ),
  constraint candidate_screenings_rank_check check (rank is null or rank > 0),
  constraint candidate_screenings_decision_check check (
    decision is null or decision in ('Shortlisted', 'Rejected')
  ),
  constraint candidate_screenings_submission_position_unique unique (submission_id, position_id)
);

create index candidate_screenings_position_rank_idx
  on public.candidate_screenings (position_id, rank)
  where rank is not null;

alter table public.position_screening_rubrics enable row level security;
alter table public.candidate_screenings enable row level security;

revoke all on table public.position_screening_rubrics from public, anon, authenticated;
revoke all on table public.candidate_screenings from public, anon, authenticated;
grant select on table public.position_screening_rubrics to authenticated;
grant select on table public.candidate_screenings to authenticated;

create policy "Active staff can view screening rubrics"
  on public.position_screening_rubrics
  for select
  to authenticated
  using ((select private.current_staff_role()) is not null);

create policy "Staff can view permitted candidate screening"
  on public.candidate_screenings
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.cv_submissions submission
      where submission.id = submission_id
    )
  );

create or replace function public.save_position_screening_rubric(
  p_position_id uuid,
  p_criteria jsonb,
  p_shortlist_count integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  total_weight integer := 0;
  saved jsonb;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can configure screening rubrics.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_position_id::text, 1));

  perform 1
  from public.positions
  where id = p_position_id
    and status = 'Open'
    and archived_at is null
    and workflow_configured = true
    and rubric_configured = false;

  if not found then
    raise exception 'The rubric is already locked or this position is not ready.' using errcode = '23514';
  end if;

  if p_criteria is null or jsonb_typeof(p_criteria) <> 'array'
    or jsonb_array_length(p_criteria) not between 3 and 8 then
    raise exception 'A rubric requires between 3 and 8 criteria.' using errcode = '23514';
  end if;

  if p_shortlist_count not between 1 and 5 then
    raise exception 'The shortlist size must be between 1 and 5.' using errcode = '23514';
  end if;

  for item in select value from jsonb_array_elements(p_criteria)
  loop
    if jsonb_typeof(item) <> 'object'
      or char_length(trim(coalesce(item ->> 'id', ''))) = 0
      or char_length(trim(coalesce(item ->> 'name', ''))) not between 2 and 80
      or char_length(trim(coalesce(item ->> 'description', ''))) not between 10 and 500
      or coalesce(item ->> 'weight', '') !~ '^[0-9]+$'
      or (item ->> 'weight')::integer not between 5 and 80 then
      raise exception 'Every criterion requires an ID, name, description and valid weight.' using errcode = '23514';
    end if;
    total_weight := total_weight + (item ->> 'weight')::integer;
  end loop;

  if total_weight <> 100 then
    raise exception 'Criterion weights must total exactly 100 percent.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_criteria) item
    group by lower(trim(item ->> 'id'))
    having count(*) > 1
  ) then
    raise exception 'Criterion IDs must be unique.' using errcode = '23505';
  end if;

  insert into public.position_screening_rubrics (
    position_id, criteria, shortlist_count, created_by
  ) values (
    p_position_id,
    (
      select jsonb_agg(jsonb_build_object(
        'id', lower(trim(item ->> 'id')),
        'name', trim(item ->> 'name'),
        'description', trim(item ->> 'description'),
        'weight', (item ->> 'weight')::integer
      ) order by ordinality)
      from jsonb_array_elements(p_criteria) with ordinality as criterion(item, ordinality)
    ),
    p_shortlist_count,
    (select auth.uid())
  );

  update public.positions
  set rubric_configured = true
  where id = p_position_id;

  select jsonb_build_object(
    'position_id', position_id,
    'criteria', criteria,
    'shortlist_count', shortlist_count,
    'locked_at', locked_at
  ) into saved
  from public.position_screening_rubrics
  where position_id = p_position_id;

  return saved;
end;
$$;

revoke all on function public.save_position_screening_rubric(uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.save_position_screening_rubric(uuid, jsonb, integer) to authenticated;

create or replace function public.begin_position_screening(p_position_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.positions%rowtype;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can close and screen positions.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_position_id::text, 2));

  select * into target
  from public.positions
  where id = p_position_id
    and archived_at is null
  for update;

  if not found then
    raise exception 'Position not found.' using errcode = 'P0002';
  end if;
  if target.workflow_configured is not true or target.rubric_configured is not true then
    raise exception 'Complete and lock the workflow and screening rubric first.' using errcode = '23514';
  end if;
  if target.status = 'Closed'
    and target.screening_status <> 'Failed'
    and not (
      target.screening_status = 'Processing'
      and target.screening_started_at < now() - interval '10 minutes'
    ) then
    raise exception 'This position has already been closed.' using errcode = '23514';
  end if;
  if target.status not in ('Open', 'Closed') then
    raise exception 'This position cannot be screened from its current state.' using errcode = '23514';
  end if;

  update public.positions
  set status = 'Closed',
      closed_at = coalesce(closed_at, now()),
      screening_status = 'Processing',
      screening_error = null,
      screening_started_at = now(),
      screening_completed_at = null
  where id = p_position_id;

  return jsonb_build_object('position_id', p_position_id, 'screening_status', 'Processing');
end;
$$;

revoke all on function public.begin_position_screening(uuid) from public, anon, authenticated;
grant execute on function public.begin_position_screening(uuid) to authenticated;

create or replace function public.finalize_position_screening(p_position_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  applicant_count integer;
  scored_count integer;
  shortlist_size integer;
  second_stage_id uuid;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_position_id::text, 3));

  perform 1 from public.positions
  where id = p_position_id and status = 'Closed' and screening_status = 'Processing'
  for update;
  if not found then
    raise exception 'The position is not awaiting screening finalization.' using errcode = '23514';
  end if;

  select count(*) into applicant_count
  from public.cv_submissions
  where position_id = p_position_id and application_status = 'Active';

  if exists (
    select 1 from public.cv_submissions
    where position_id = p_position_id
      and application_status = 'Active'
      and processing_status <> 'Processed'
  ) then
    raise exception 'Every active CV must be processed before screening can be finalized.' using errcode = '23514';
  end if;

  select count(*) into scored_count
  from public.candidate_screenings screening
  join public.cv_submissions submission on submission.id = screening.submission_id
  where screening.position_id = p_position_id
    and submission.application_status = 'Active';

  if scored_count <> applicant_count then
    raise exception 'Every active candidate must have a valid screening score.' using errcode = '23514';
  end if;

  select least(shortlist_count, applicant_count) into shortlist_size
  from public.position_screening_rubrics
  where position_id = p_position_id;

  with ranked as (
    select screening.submission_id,
      row_number() over (
        order by screening.total_score desc, submission.submitted_at asc, screening.submission_id asc
      )::integer as candidate_rank
    from public.candidate_screenings screening
    join public.cv_submissions submission on submission.id = screening.submission_id
    where screening.position_id = p_position_id
      and submission.application_status = 'Active'
  )
  update public.candidate_screenings screening
  set rank = ranked.candidate_rank,
      decision = case when ranked.candidate_rank <= shortlist_size then 'Shortlisted' else 'Rejected' end
  from ranked
  where screening.submission_id = ranked.submission_id;

  select id into second_stage_id
  from public.recruitment_stages
  where position_id = p_position_id and stage_order = 2;

  update public.cv_submissions submission
  set application_status = case when screening.decision = 'Shortlisted' then 'Active' else 'Rejected' end,
      current_stage_id = case when screening.decision = 'Shortlisted' then second_stage_id else submission.current_stage_id end
  from public.candidate_screenings screening
  where submission.id = screening.submission_id
    and screening.position_id = p_position_id;

  update public.positions
  set screening_status = 'Completed',
      screening_error = null,
      screening_completed_at = now()
  where id = p_position_id;

  return jsonb_build_object(
    'position_id', p_position_id,
    'candidate_count', applicant_count,
    'shortlisted_count', shortlist_size,
    'rejected_count', applicant_count - shortlist_size
  );
end;
$$;

revoke all on function public.finalize_position_screening(uuid) from public, anon, authenticated;
grant execute on function public.finalize_position_screening(uuid) to service_role;

create or replace function public.advance_candidate(p_submission_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission public.cv_submissions%rowtype;
  current_stage public.recruitment_stages%rowtype;
  next_stage public.recruitment_stages%rowtype;
  result jsonb;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can advance candidates.' using errcode = '42501';
  end if;

  select * into submission from public.cv_submissions where id = p_submission_id for update;
  if not found then raise exception 'Candidate submission not found.' using errcode = 'P0002'; end if;
  if submission.application_status <> 'Active' then
    raise exception 'Only active candidates can move through the workflow.' using errcode = '23514';
  end if;

  select * into current_stage from public.recruitment_stages where id = submission.current_stage_id;
  if current_stage.stage_type = 'cv_review' and not exists (
    select 1 from public.candidate_screenings
    where submission_id = p_submission_id and decision = 'Shortlisted'
  ) then
    raise exception 'CV Review progression is controlled by automatic screening after the position closes.' using errcode = '23514';
  end if;

  select * into next_stage
  from public.recruitment_stages
  where position_id = current_stage.position_id and stage_order = current_stage.stage_order + 1;
  if not found then raise exception 'This candidate is already at the final workflow stage.' using errcode = '23514'; end if;

  update public.cv_submissions set current_stage_id = next_stage.id where id = p_submission_id;
  select jsonb_build_object(
    'id', cv.id, 'current_stage_id', cv.current_stage_id,
    'application_status', cv.application_status,
    'stage_name', next_stage.name, 'stage_order', next_stage.stage_order
  ) into result from public.cv_submissions cv where cv.id = p_submission_id;
  return result;
end;
$$;

create or replace function public.set_candidate_status(p_submission_id uuid, p_status text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission public.cv_submissions%rowtype;
  stage_type public.recruitment_stage_type;
  result jsonb;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can change candidate status.' using errcode = '42501';
  end if;
  if p_status not in ('Active', 'Rejected', 'Hired', 'Withdrawn') then
    raise exception 'Unsupported candidate status.' using errcode = '22023';
  end if;

  select * into submission from public.cv_submissions where id = p_submission_id for update;
  if not found then raise exception 'Candidate submission not found.' using errcode = 'P0002'; end if;
  select recruitment_stages.stage_type into stage_type
  from public.recruitment_stages where id = submission.current_stage_id;

  if p_status = 'Rejected' and stage_type = 'cv_review' and not exists (
    select 1 from public.candidate_screenings where submission_id = p_submission_id and decision = 'Rejected'
  ) then
    raise exception 'CV Review rejection is controlled by automatic screening after the position closes.' using errcode = '23514';
  end if;

  update public.cv_submissions set application_status = p_status where id = p_submission_id
  returning jsonb_build_object('id', id, 'current_stage_id', current_stage_id, 'application_status', application_status) into result;
  return result;
end;
$$;

-- Existing confirmed positions receive their agreed, locked rubrics so they remain publishable.
insert into public.position_screening_rubrics (position_id, criteria, shortlist_count, created_by)
select p.id, rubric.criteria, 3, admin.id
from public.positions p
cross join lateral (
  select id from public.staff_profiles
  where role = 'it_admin' and is_active = true
  order by created_at limit 1
) admin
cross join lateral (
  select case p.title
    when 'Marketing Intern' then jsonb_build_array(
      jsonb_build_object('id','marketing_knowledge','name','Marketing knowledge and tools','description','Explicit evidence of relevant marketing concepts, platforms, tools or coursework.','weight',30),
      jsonb_build_object('id','communication','name','Content and communication','description','Explicit evidence of written, verbal, presentation or content-creation ability.','weight',25),
      jsonb_build_object('id','campaigns_analytics','name','Campaign and analytics exposure','description','Explicit evidence of campaign, social media, research, analytics or reporting experience.','weight',20),
      jsonb_build_object('id','education','name','Relevant education','description','Education, training or certifications relevant to marketing and the role requirements.','weight',15),
      jsonb_build_object('id','initiative','name','Initiative and achievements','description','Relevant projects, volunteering, leadership, awards or measurable achievements.','weight',10)
    )
    when 'Senior Software Engineer' then jsonb_build_array(
      jsonb_build_object('id','engineering_experience','name','Engineering experience and seniority','description','Explicit depth, duration and responsibility in professional software engineering work.','weight',25),
      jsonb_build_object('id','technical_stack','name','Relevant technical stack','description','Evidence of technologies, languages and frameworks relevant to the position requirements.','weight',25),
      jsonb_build_object('id','system_design','name','System design and architecture','description','Evidence of designing, scaling or improving maintainable production systems.','weight',20),
      jsonb_build_object('id','leadership_delivery','name','Leadership and delivery','description','Evidence of ownership, mentoring, collaboration and reliable delivery of outcomes.','weight',15),
      jsonb_build_object('id','quality_security','name','Quality, testing and security','description','Evidence of testing, code quality, reliability, performance or security practices.','weight',15)
    )
  end as criteria
) rubric
where p.title in ('Marketing Intern', 'Senior Software Engineer')
  and p.archived_at is null
  and rubric.criteria is not null
on conflict (position_id) do nothing;

update public.positions p
set rubric_configured = true
where exists (
  select 1 from public.position_screening_rubrics rubric where rubric.position_id = p.id
);

revoke all privileges on table public.positions from anon;
grant select (id, title, department, status, archived_at, workflow_configured, rubric_configured) on public.positions to anon;

drop policy if exists "Public can view open positions" on public.positions;
create policy "Public can view open positions"
  on public.positions
  for select
  to anon
  using (
    status = 'Open'
    and archived_at is null
    and workflow_configured = true
    and rubric_configured = true
  );

grant select (
  rubric_configured, screening_status, screening_error,
  screening_started_at, screening_completed_at, closed_at
) on table public.positions to authenticated;

notify pgrst, 'reload schema';
