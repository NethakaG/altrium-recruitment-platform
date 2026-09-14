-- Sprint 2 / Feature 2: structured interview feedback, scoring,
-- recommendations, HR review decisions and immutable change history.

create table public.interview_feedback (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references public.interviews(id) on delete cascade,
  interviewer_id uuid not null references public.interviewer_profiles(id) on delete restrict,
  scores jsonb not null default '{}'::jsonb,
  notes text not null default '',
  recommendation text,
  feedback_status text not null default 'draft',
  submitted_at timestamptz,
  review_decision text,
  review_note text,
  reviewed_by uuid references public.staff_profiles(id) on delete restrict,
  reviewed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interview_feedback_scores_object_check check (jsonb_typeof(scores) = 'object'),
  constraint interview_feedback_notes_length_check check (char_length(notes) <= 5000),
  constraint interview_feedback_recommendation_check check (
    recommendation is null or recommendation in ('proceed', 'hold', 'reject')
  ),
  constraint interview_feedback_status_check check (
    feedback_status in ('draft', 'submitted', 'reviewed')
  ),
  constraint interview_feedback_submission_check check (
    (feedback_status = 'draft' and submitted_at is null)
    or (feedback_status in ('submitted', 'reviewed') and submitted_at is not null and recommendation is not null)
  ),
  constraint interview_feedback_review_check check (
    (review_decision is null and reviewed_by is null and reviewed_at is null)
    or (
      feedback_status = 'reviewed'
      and review_decision in ('proceed', 'hold', 'reject')
      and reviewed_by is not null
      and reviewed_at is not null
    )
  ),
  constraint interview_feedback_version_check check (version > 0)
);

create table public.interview_feedback_history (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.interview_feedback(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  change_reason text not null,
  changed_by uuid not null references public.staff_profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint interview_feedback_history_reason_check check (char_length(trim(change_reason)) between 3 and 240),
  unique (feedback_id, version)
);

create trigger set_interview_feedback_updated_at
  before update on public.interview_feedback
  for each row execute function public.set_updated_at();

create index interview_feedback_interviewer_idx
  on public.interview_feedback (interviewer_id, updated_at desc);
create index interview_feedback_review_idx
  on public.interview_feedback (feedback_status, reviewed_at, updated_at desc);
create index interview_feedback_history_lookup_idx
  on public.interview_feedback_history (feedback_id, version desc);
create index interview_feedback_reviewed_by_idx
  on public.interview_feedback (reviewed_by);
create index interview_feedback_history_changed_by_idx
  on public.interview_feedback_history (changed_by);

alter table public.cv_submissions
  drop constraint if exists cv_submissions_application_status_check;
alter table public.cv_submissions
  add constraint cv_submissions_application_status_check check (
    application_status in ('Active', 'On Hold', 'Rejected', 'Hired', 'Withdrawn')
  );

alter table public.interview_feedback enable row level security;
alter table public.interview_feedback_history enable row level security;

revoke all on table public.interview_feedback from public, anon, authenticated;
revoke all on table public.interview_feedback_history from public, anon, authenticated;
grant select, insert, update on table public.interview_feedback to authenticated;
grant select, insert on table public.interview_feedback_history to authenticated;

create policy "Permitted staff can view interview feedback"
  on public.interview_feedback for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or exists (
      select 1
      from public.interviews interview
      join public.interviewer_profiles profile on profile.id = interview.interviewer_id
      where interview.id = interview_feedback.interview_id
        and profile.staff_id = (select auth.uid())
    )
  );

create policy "Feedback RPC can insert feedback"
  on public.interview_feedback for insert to authenticated
  with check (
    (select current_setting('app.feedback_operation', true)) = 'allowed'
    and exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interview_feedback.interviewer_id and profile.staff_id = (select auth.uid())
    )
  );

create policy "Feedback RPC can update feedback"
  on public.interview_feedback for update to authenticated
  using ((select current_setting('app.feedback_operation', true)) = 'allowed')
  with check ((select current_setting('app.feedback_operation', true)) = 'allowed');

create policy "Permitted staff can view feedback history"
  on public.interview_feedback_history for select to authenticated
  using (
    exists (
      select 1 from public.interview_feedback feedback
      where feedback.id = interview_feedback_history.feedback_id
    )
  );

create policy "Feedback RPC can insert history"
  on public.interview_feedback_history for insert to authenticated
  with check ((select current_setting('app.feedback_operation', true)) = 'allowed');

create or replace function private.interview_scores_are_valid(
  p_scores jsonb,
  p_require_complete boolean default false
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  allowed_keys constant text[] := array[
    'communication', 'role_knowledge', 'relevant_experience',
    'problem_solving', 'overall_suitability'
  ];
  score_entry record;
begin
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
    return false;
  end if;

  for score_entry in select key, value from jsonb_each(p_scores)
  loop
    if not (score_entry.key = any(allowed_keys))
      or jsonb_typeof(score_entry.value) <> 'number'
      or (score_entry.value #>> '{}')::numeric <> trunc((score_entry.value #>> '{}')::numeric)
      or (score_entry.value #>> '{}')::integer not between 1 and 5
    then
      return false;
    end if;
  end loop;

  if p_require_complete then
    return array_length(allowed_keys, 1) = (select count(*) from jsonb_object_keys(p_scores))
      and p_scores ?& allowed_keys;
  end if;

  return true;
exception when invalid_text_representation or numeric_value_out_of_range then
  return false;
end;
$$;

revoke all on function private.interview_scores_are_valid(jsonb, boolean)
  from public, anon, authenticated;
grant execute on function private.interview_scores_are_valid(jsonb, boolean)
  to authenticated;

alter table public.interview_feedback
  add constraint interview_feedback_scores_check check (
    private.interview_scores_are_valid(scores, feedback_status in ('submitted', 'reviewed'))
  );

create or replace function private.record_feedback_history(
  p_feedback public.interview_feedback,
  p_reason text,
  p_changed_by uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.interview_feedback_history (
    feedback_id, version, snapshot, change_reason, changed_by
  ) values (
    p_feedback.id,
    p_feedback.version,
    to_jsonb(p_feedback),
    trim(p_reason),
    p_changed_by
  );
end;
$$;

revoke all on function private.record_feedback_history(public.interview_feedback, text, uuid)
  from public, anon, authenticated;
grant execute on function private.record_feedback_history(public.interview_feedback, text, uuid)
  to authenticated;

create or replace function public.save_interview_feedback(
  p_interview_id uuid,
  p_scores jsonb,
  p_notes text,
  p_recommendation text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_interview public.interviews%rowtype;
  existing_feedback public.interview_feedback%rowtype;
  feedback_id uuid;
begin
  perform set_config('app.interview_operation', 'allowed', true);
  perform set_config('app.feedback_operation', 'allowed', true);
  select interview.*
  into target_interview
  from public.interviews interview
  where interview.id = p_interview_id
    and exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interview.interviewer_id
        and profile.staff_id = (select auth.uid())
    )
  for update of interview;

  if not found then
    raise exception 'Only the assigned interviewer can edit this feedback.' using errcode = '42501';
  end if;
  if target_interview.actual_start is null
    or target_interview.status not in ('in_progress', 'awaiting_feedback')
  then
    raise exception 'Feedback is available only after this interview has started.' using errcode = '23514';
  end if;
  if not private.interview_scores_are_valid(coalesce(p_scores, '{}'::jsonb), false) then
    raise exception 'Every saved score must be a whole number from 1 to 5.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_notes, '')) > 5000 then
    raise exception 'Interview notes cannot exceed 5000 characters.' using errcode = '22023';
  end if;
  if p_recommendation is not null and p_recommendation not in ('proceed', 'hold', 'reject') then
    raise exception 'Choose Proceed, Hold or Reject.' using errcode = '22023';
  end if;

  select * into existing_feedback
  from public.interview_feedback feedback
  where feedback.interview_id = p_interview_id
  for update;

  if found and existing_feedback.review_decision is not null then
    raise exception 'Reviewed feedback is locked.' using errcode = '23514';
  end if;
  if found and existing_feedback.feedback_status = 'submitted' and (
    not private.interview_scores_are_valid(coalesce(p_scores, '{}'::jsonb), true)
    or char_length(trim(coalesce(p_notes, ''))) < 20
    or p_recommendation is null
  ) then
    raise exception 'Submitted feedback must keep all five scores, detailed notes and a recommendation.' using errcode = '23514';
  end if;

  if found then
    if existing_feedback.feedback_status = 'submitted' then
      perform private.record_feedback_history(
        existing_feedback,
        'Interviewer edited submitted feedback',
        (select auth.uid())
      );
    end if;
    update public.interview_feedback
    set scores = coalesce(p_scores, '{}'::jsonb),
        notes = coalesce(p_notes, ''),
        recommendation = p_recommendation,
        version = case when existing_feedback.feedback_status = 'submitted'
          then existing_feedback.version + 1 else existing_feedback.version end
    where id = existing_feedback.id
    returning id into feedback_id;
  else
    insert into public.interview_feedback (
      interview_id, interviewer_id, scores, notes, recommendation
    ) values (
      p_interview_id, target_interview.interviewer_id,
      coalesce(p_scores, '{}'::jsonb), coalesce(p_notes, ''), p_recommendation
    ) returning id into feedback_id;
  end if;

  return feedback_id;
end;
$$;

create or replace function public.submit_interview_feedback(p_interview_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_feedback public.interview_feedback%rowtype;
begin
  perform set_config('app.feedback_operation', 'allowed', true);
  select feedback.* into target_feedback
  from public.interview_feedback feedback
  join public.interviews interview on interview.id = feedback.interview_id
  join public.interviewer_profiles profile on profile.id = interview.interviewer_id
  where feedback.interview_id = p_interview_id
    and profile.staff_id = (select auth.uid())
    and interview.status = 'awaiting_feedback'
  for update of feedback;

  if not found then
    raise exception 'End the interview and save feedback before submitting it.' using errcode = '23514';
  end if;
  if target_feedback.review_decision is not null then
    raise exception 'Reviewed feedback is locked.' using errcode = '23514';
  end if;
  if not private.interview_scores_are_valid(target_feedback.scores, true) then
    raise exception 'Score all five evaluation criteria before submitting.' using errcode = '23514';
  end if;
  if char_length(trim(target_feedback.notes)) < 20 then
    raise exception 'Add at least 20 characters of interview feedback.' using errcode = '23514';
  end if;
  if target_feedback.recommendation is null then
    raise exception 'Choose Proceed, Hold or Reject before submitting.' using errcode = '23514';
  end if;

  perform set_config('app.feedback_operation', 'allowed', true);
  update public.interview_feedback
  set feedback_status = 'submitted', submitted_at = coalesce(submitted_at, now())
  where id = target_feedback.id;
  return target_feedback.id;
end;
$$;

create or replace function public.review_interview_feedback(
  p_interview_id uuid,
  p_decision text,
  p_review_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_interview public.interviews%rowtype;
  target_feedback public.interview_feedback%rowtype;
  submission_id uuid;
  submission_stage_id uuid;
  submission_status text;
  current_stage public.recruitment_stages%rowtype;
  next_stage public.recruitment_stages%rowtype;
begin
  perform set_config('app.feedback_operation', 'allowed', true);
  perform set_config('app.interview_operation', 'allowed', true);
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can review interview feedback.' using errcode = '42501';
  end if;
  if p_decision not in ('proceed', 'hold', 'reject') then
    raise exception 'Choose Proceed, Hold or Reject.' using errcode = '22023';
  end if;

  select * into target_interview from public.interviews
  where id = p_interview_id for update;
  select * into target_feedback from public.interview_feedback
  where interview_id = p_interview_id for update;
  if not found or target_feedback.feedback_status not in ('submitted', 'reviewed') then
    raise exception 'Submitted interviewer feedback is required.' using errcode = '23514';
  end if;
  if target_feedback.review_decision is not null and target_feedback.review_decision <> 'hold' then
    raise exception 'This feedback decision is already final.' using errcode = '23514';
  end if;
  if p_decision = 'hold' and target_feedback.review_decision = 'hold' then
    raise exception 'This candidate is already on hold.' using errcode = '23514';
  end if;
  if p_decision <> target_feedback.recommendation
    and char_length(trim(coalesce(p_review_note, ''))) < 10
  then
    raise exception 'Explain in at least 10 characters why the decision differs from the interviewer recommendation.' using errcode = '23514';
  end if;

  select candidate.id, candidate.current_stage_id, candidate.application_status
  into submission_id, submission_stage_id, submission_status
  from public.cv_submissions candidate
  where candidate.id = target_interview.submission_id for update;
  if submission_stage_id <> target_interview.stage_id
    or submission_status not in ('Active', 'On Hold')
  then
    raise exception 'The candidate is no longer awaiting a decision for this interview.' using errcode = '23514';
  end if;
  select * into current_stage from public.recruitment_stages
  where id = submission_stage_id;

  if p_decision = 'proceed' then
    select * into next_stage from public.recruitment_stages
    where position_id = current_stage.position_id
      and stage_order = current_stage.stage_order + 1;
    if not found then
      raise exception 'The candidate is already at the final workflow stage.' using errcode = '23514';
    end if;
  end if;

  perform private.record_feedback_history(
    target_feedback,
    case when target_feedback.review_decision = 'hold'
      then 'HR resolved held recommendation' else 'HR reviewed interviewer recommendation' end,
    (select auth.uid())
  );

  update public.interview_feedback
  set feedback_status = 'reviewed',
      review_decision = p_decision,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      version = target_feedback.version + 1
  where id = target_feedback.id;

  update public.interviews
  set status = 'completed'
  where id = p_interview_id;

  if p_decision = 'proceed' then
    update public.cv_submissions
    set current_stage_id = next_stage.id, application_status = 'Active'
    where id = submission_id;
  elsif p_decision = 'hold' then
    update public.cv_submissions
    set application_status = 'On Hold'
    where id = submission_id;
  else
    update public.cv_submissions
    set application_status = 'Rejected'
    where id = submission_id;
  end if;

  return jsonb_build_object(
    'interview_id', p_interview_id,
    'submission_id', submission_id,
    'decision', p_decision,
    'application_status', case
      when p_decision = 'proceed' then 'Active'
      when p_decision = 'hold' then 'On Hold'
      else 'Rejected'
    end,
    'current_stage_id', case when p_decision = 'proceed'
      then next_stage.id else submission_stage_id end
  );
end;
$$;

revoke all on function public.save_interview_feedback(uuid, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.submit_interview_feedback(uuid)
  from public, anon, authenticated;
revoke all on function public.review_interview_feedback(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.save_interview_feedback(uuid, jsonb, text, text)
  to authenticated;
grant execute on function public.submit_interview_feedback(uuid)
  to authenticated;
grant execute on function public.review_interview_feedback(uuid, text, text)
  to authenticated;

-- Prevent the older general workflow controls from bypassing interview feedback.
create or replace function public.advance_candidate(p_submission_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission_stage_id uuid;
  submission_status text;
  current_stage_type public.recruitment_stage_type;
  current_position_id uuid;
  current_stage_order integer;
  next_stage_id uuid;
  next_stage_name text;
  next_stage_order integer;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can advance candidates.' using errcode = '42501';
  end if;
  select candidate.current_stage_id, candidate.application_status
  into submission_stage_id, submission_status
  from public.cv_submissions candidate
  where candidate.id = p_submission_id for update;
  if not found then raise exception 'Candidate submission not found.' using errcode = 'P0002'; end if;
  if submission_status <> 'Active' then
    raise exception 'Only active candidates can move through the workflow.' using errcode = '23514';
  end if;
  select stage.stage_type, stage.position_id, stage.stage_order
  into current_stage_type, current_position_id, current_stage_order
  from public.recruitment_stages stage where stage.id = submission_stage_id;
  if not found then raise exception 'The candidate workflow stage is unavailable.' using errcode = 'P0002'; end if;
  if current_stage_type = 'cv_review' and not exists (
    select 1 from public.candidate_screenings screening
    where screening.submission_id = p_submission_id and screening.decision = 'Shortlisted'
  ) then
    raise exception 'CV Review progression is controlled by automatic screening after the position closes.' using errcode = '23514';
  end if;
  if current_stage_type in (
    'hr_interview', 'technical_interview', 'hiring_manager_interview',
    'engineering_manager_interview', 'executive_interview'
  ) then
    raise exception 'Interview-stage progression requires submitted feedback and an HR Proceed decision.' using errcode = '23514';
  end if;
  select stage.id, stage.name, stage.stage_order
  into next_stage_id, next_stage_name, next_stage_order
  from public.recruitment_stages stage
  where stage.position_id = current_position_id and stage.stage_order = current_stage_order + 1;
  if not found then raise exception 'This candidate is already at the final workflow stage.' using errcode = '23514'; end if;
  update public.cv_submissions set current_stage_id = next_stage_id where id = p_submission_id;
  return jsonb_build_object(
    'id', p_submission_id, 'current_stage_id', next_stage_id,
    'application_status', submission_status, 'stage_name', next_stage_name,
    'stage_order', next_stage_order
  );
end;
$$;

create or replace function public.set_candidate_status(p_submission_id uuid, p_status text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission_stage_id uuid;
  submission_status text;
  stage_type public.recruitment_stage_type;
  result jsonb;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can change candidate status.' using errcode = '42501';
  end if;
  if p_status not in ('Active', 'On Hold', 'Rejected', 'Hired', 'Withdrawn') then
    raise exception 'Unsupported candidate status.' using errcode = '22023';
  end if;
  select candidate.current_stage_id, candidate.application_status
  into submission_stage_id, submission_status
  from public.cv_submissions candidate
  where candidate.id = p_submission_id for update;
  if not found then raise exception 'Candidate submission not found.' using errcode = 'P0002'; end if;
  select recruitment_stages.stage_type into stage_type
  from public.recruitment_stages where id = submission_stage_id;
  if p_status = 'Rejected' and stage_type = 'cv_review' and not exists (
    select 1 from public.candidate_screenings
    where submission_id = p_submission_id and decision = 'Rejected'
  ) then
    raise exception 'CV Review rejection is controlled by automatic screening after the position closes.' using errcode = '23514';
  end if;
  if p_status in ('On Hold', 'Rejected') and stage_type in (
    'hr_interview', 'technical_interview', 'hiring_manager_interview',
    'engineering_manager_interview', 'executive_interview'
  ) then
    raise exception 'Interview-stage decisions must be applied from submitted interviewer feedback.' using errcode = '23514';
  end if;
  update public.cv_submissions set application_status = p_status where id = p_submission_id
  returning jsonb_build_object(
    'id', id, 'current_stage_id', current_stage_id,
    'application_status', application_status
  ) into result;
  return result;
end;
$$;

revoke all on function public.advance_candidate(uuid) from public, anon, authenticated;
revoke all on function public.set_candidate_status(uuid, text) from public, anon, authenticated;
grant execute on function public.advance_candidate(uuid) to authenticated;
grant execute on function public.set_candidate_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
