-- Keep private CV and storage metadata inaccessible while allowing HR and IT Admin
-- to advance candidates using only the columns required by the workflow RPC.
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
  from public.cv_submissions as candidate
  where candidate.id = p_submission_id
  for update;

  if not found then
    raise exception 'Candidate submission not found.' using errcode = 'P0002';
  end if;
  if submission_status <> 'Active' then
    raise exception 'Only active candidates can move through the workflow.' using errcode = '23514';
  end if;

  select stage.stage_type, stage.position_id, stage.stage_order
  into current_stage_type, current_position_id, current_stage_order
  from public.recruitment_stages as stage
  where stage.id = submission_stage_id;

  if not found then
    raise exception 'The candidate workflow stage is unavailable.' using errcode = 'P0002';
  end if;

  if current_stage_type = 'cv_review' and not exists (
    select 1
    from public.candidate_screenings as screening
    where screening.submission_id = p_submission_id
      and screening.decision = 'Shortlisted'
  ) then
    raise exception 'CV Review progression is controlled by automatic screening after the position closes.' using errcode = '23514';
  end if;

  select stage.id, stage.name, stage.stage_order
  into next_stage_id, next_stage_name, next_stage_order
  from public.recruitment_stages as stage
  where stage.position_id = current_position_id
    and stage.stage_order = current_stage_order + 1;

  if not found then
    raise exception 'This candidate is already at the final workflow stage.' using errcode = '23514';
  end if;

  update public.cv_submissions as candidate
  set current_stage_id = next_stage_id
  where candidate.id = p_submission_id;

  return jsonb_build_object(
    'id', p_submission_id,
    'current_stage_id', next_stage_id,
    'application_status', submission_status,
    'stage_name', next_stage_name,
    'stage_order', next_stage_order
  );
end;
$$;

revoke all on function public.advance_candidate(uuid)
  from public, anon, authenticated;
grant execute on function public.advance_candidate(uuid)
  to authenticated;

notify pgrst, 'reload schema';
