-- Keep feedback review within the intentionally exposed candidate columns.
-- cv_submissions contains private storage metadata, so RPCs must not SELECT *.

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
  set feedback_status = 'reviewed', review_decision = p_decision,
      review_note = nullif(trim(coalesce(p_review_note, '')), ''),
      reviewed_by = (select auth.uid()), reviewed_at = now(),
      version = target_feedback.version + 1
  where id = target_feedback.id;
  update public.interviews set status = 'completed' where id = p_interview_id;

  if p_decision = 'proceed' then
    update public.cv_submissions
    set current_stage_id = next_stage.id, application_status = 'Active'
    where id = submission_id;
  elsif p_decision = 'hold' then
    update public.cv_submissions set application_status = 'On Hold'
    where id = submission_id;
  else
    update public.cv_submissions set application_status = 'Rejected'
    where id = submission_id;
  end if;

  return jsonb_build_object(
    'interview_id', p_interview_id, 'submission_id', submission_id,
    'decision', p_decision,
    'application_status', case when p_decision = 'proceed' then 'Active'
      when p_decision = 'hold' then 'On Hold' else 'Rejected' end,
    'current_stage_id', case when p_decision = 'proceed'
      then next_stage.id else submission_stage_id end
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
  select stage.stage_type into stage_type
  from public.recruitment_stages stage where stage.id = submission_stage_id;
  if p_status = 'Rejected' and stage_type = 'cv_review' and not exists (
    select 1 from public.candidate_screenings screening
    where screening.submission_id = p_submission_id and screening.decision = 'Rejected'
  ) then
    raise exception 'CV Review rejection is controlled by automatic screening after the position closes.' using errcode = '23514';
  end if;
  if p_status in ('On Hold', 'Rejected') and stage_type in (
    'hr_interview', 'technical_interview', 'hiring_manager_interview',
    'engineering_manager_interview', 'executive_interview'
  ) then
    raise exception 'Interview-stage decisions must be applied from submitted interviewer feedback.' using errcode = '23514';
  end if;
  update public.cv_submissions
  set application_status = p_status where id = p_submission_id
  returning jsonb_build_object(
    'id', id, 'current_stage_id', current_stage_id,
    'application_status', application_status
  ) into result;
  return result;
end;
$$;

notify pgrst, 'reload schema';
