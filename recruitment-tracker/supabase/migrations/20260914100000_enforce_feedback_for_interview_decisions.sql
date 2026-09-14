-- Interview stages must always be resolved through reviewed interviewer
-- feedback, even before an interview record exists.

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
  update public.cv_submissions set application_status = p_status where id = p_submission_id
  returning jsonb_build_object(
    'id', id, 'current_stage_id', current_stage_id,
    'application_status', application_status
  ) into result;
  return result;
end;
$$;

notify pgrst, 'reload schema';
