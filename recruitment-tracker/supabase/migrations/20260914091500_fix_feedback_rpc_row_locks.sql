-- The feedback RPCs use SELECT FOR UPDATE. Set their transaction-local RLS
-- markers before acquiring those row locks so authenticated callers can reach
-- only the rows that the RPC has already authorised.

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
  select interview.* into target_interview
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
        existing_feedback, 'Interviewer edited submitted feedback', (select auth.uid())
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

notify pgrst, 'reload schema';
