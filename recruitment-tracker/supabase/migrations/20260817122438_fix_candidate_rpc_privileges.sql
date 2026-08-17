-- Keep private storage metadata hidden while allowing the workflow RPC to lock
-- and read only the candidate fields it actually needs.

create or replace function public.advance_candidate(p_submission_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission_stage_id uuid;
  submission_status text;
  next_stage public.recruitment_stages%rowtype;
  result jsonb;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can advance candidates.' using errcode = '42501';
  end if;

  select current_stage_id, application_status
  into submission_stage_id, submission_status
  from public.cv_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Candidate submission not found.' using errcode = 'P0002';
  end if;
  if submission_status <> 'Active' then
    raise exception 'Only active candidates can move through the workflow.' using errcode = '23514';
  end if;

  select stage.* into next_stage
  from public.recruitment_stages current_stage
  join public.recruitment_stages stage
    on stage.position_id = current_stage.position_id
   and stage.stage_order = current_stage.stage_order + 1
  where current_stage.id = submission_stage_id;

  if not found then
    raise exception 'This candidate is already at the final workflow stage.' using errcode = '23514';
  end if;

  update public.cv_submissions
  set current_stage_id = next_stage.id
  where id = p_submission_id;

  select jsonb_build_object(
    'id', cv.id,
    'current_stage_id', cv.current_stage_id,
    'application_status', cv.application_status,
    'stage_name', next_stage.name,
    'stage_order', next_stage.stage_order
  ) into result
  from public.cv_submissions cv
  where cv.id = p_submission_id;

  return result;
end;
$$;

revoke all on function public.advance_candidate(uuid) from public, anon, authenticated;
grant execute on function public.advance_candidate(uuid) to authenticated;

notify pgrst, 'reload schema';
