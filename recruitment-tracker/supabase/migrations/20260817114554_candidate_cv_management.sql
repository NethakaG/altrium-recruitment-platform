-- Function 3: candidate records, CV access, workflow progress, and extracted profile data.

alter table public.cv_submissions
  add column if not exists candidate_name text,
  add column if not exists candidate_email text,
  add column if not exists candidate_phone text,
  add column if not exists current_stage_id uuid references public.recruitment_stages(id) on delete restrict,
  add column if not exists application_status text not null default 'Active',
  add column if not exists extracted_profile jsonb not null default '{}'::jsonb,
  add column if not exists extraction_model text;

alter table public.cv_submissions
  drop constraint if exists cv_submissions_candidate_name_check,
  add constraint cv_submissions_candidate_name_check check (
    candidate_name is null or char_length(trim(candidate_name)) between 2 and 120
  ),
  drop constraint if exists cv_submissions_candidate_email_check,
  add constraint cv_submissions_candidate_email_check check (
    candidate_email is null or (
      char_length(candidate_email) between 5 and 254
      and candidate_email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    )
  ),
  drop constraint if exists cv_submissions_candidate_phone_check,
  add constraint cv_submissions_candidate_phone_check check (
    candidate_phone is null or char_length(trim(candidate_phone)) between 7 and 30
  ),
  drop constraint if exists cv_submissions_application_status_check,
  add constraint cv_submissions_application_status_check check (
    application_status in ('Active', 'Rejected', 'Hired', 'Withdrawn')
  ),
  drop constraint if exists cv_submissions_extracted_profile_check,
  add constraint cv_submissions_extracted_profile_check check (
    jsonb_typeof(extracted_profile) = 'object'
  );

update public.cv_submissions submission
set current_stage_id = first_stage.id
from public.recruitment_stages first_stage
where submission.current_stage_id is null
  and first_stage.position_id = submission.position_id
  and first_stage.stage_order = 1;

create index if not exists cv_submissions_stage_status_idx
  on public.cv_submissions (current_stage_id, application_status, submitted_at desc);

comment on column public.cv_submissions.candidate_name is
  'Candidate-provided name. Nullable only for submissions received before Function 3.';
comment on column public.cv_submissions.extracted_profile is
  'Validated structured CV details extracted server-side; never used as the sole source of candidate identity.';

revoke all privileges on table public.cv_submissions from public, anon, authenticated;
grant select (
  id, position_id, original_filename, mime_type, file_size, processing_status,
  submitted_at, processed_at, candidate_name, candidate_email, candidate_phone,
  current_stage_id, application_status, extracted_profile, extraction_model
) on table public.cv_submissions to authenticated;
grant update (current_stage_id, application_status) on table public.cv_submissions to authenticated;

drop policy if exists "Active staff can view permitted candidates" on public.cv_submissions;
drop policy if exists "HR and IT can update candidate progress" on public.cv_submissions;

create policy "Active staff can view permitted candidates"
  on public.cv_submissions
  for select
  to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or exists (
      select 1
      from public.recruitment_stages stage
      where stage.id = current_stage_id
        and (
          ((select private.current_staff_role()) = 'interviewer' and stage.stage_type in (
            'hr_interview', 'technical_interview', 'hiring_manager_interview',
            'engineering_manager_interview', 'executive_interview'
          ))
          or ((select private.current_staff_role()) = 'hiring_manager' and stage.stage_type in (
            'technical_assessment', 'technical_interview', 'hiring_manager_interview',
            'engineering_manager_interview', 'executive_interview', 'final_decision'
          ))
          or ((select private.current_staff_role()) = 'management_user' and stage.stage_type in (
            'executive_interview', 'final_decision'
          ))
        )
    )
  );

create policy "HR and IT can update candidate progress"
  on public.cv_submissions
  for update
  to authenticated
  using ((select private.current_staff_role()) in ('it_admin', 'hr_recruiter'))
  with check ((select private.current_staff_role()) in ('it_admin', 'hr_recruiter'));

create or replace function public.advance_candidate(p_submission_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submission public.cv_submissions%rowtype;
  next_stage public.recruitment_stages%rowtype;
  result jsonb;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can advance candidates.' using errcode = '42501';
  end if;

  select * into submission
  from public.cv_submissions
  where id = p_submission_id
  for update;

  if not found then
    raise exception 'Candidate submission not found.' using errcode = 'P0002';
  end if;
  if submission.application_status <> 'Active' then
    raise exception 'Only active candidates can move through the workflow.' using errcode = '23514';
  end if;

  select stage.* into next_stage
  from public.recruitment_stages current_stage
  join public.recruitment_stages stage
    on stage.position_id = current_stage.position_id
   and stage.stage_order = current_stage.stage_order + 1
  where current_stage.id = submission.current_stage_id;

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

create or replace function public.set_candidate_status(
  p_submission_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can change candidate status.' using errcode = '42501';
  end if;
  if p_status not in ('Active', 'Rejected', 'Hired', 'Withdrawn') then
    raise exception 'Unsupported candidate status.' using errcode = '22023';
  end if;

  update public.cv_submissions
  set application_status = p_status
  where id = p_submission_id
  returning jsonb_build_object(
    'id', id,
    'current_stage_id', current_stage_id,
    'application_status', application_status
  ) into result;

  if result is null then
    raise exception 'Candidate submission not found.' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

revoke all on function public.advance_candidate(uuid) from public, anon, authenticated;
revoke all on function public.set_candidate_status(uuid, text) from public, anon, authenticated;
grant execute on function public.advance_candidate(uuid) to authenticated;
grant execute on function public.set_candidate_status(uuid, text) to authenticated;

create or replace function private.prevent_workflow_change_with_candidates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected_position_id uuid;
begin
  affected_position_id := case when tg_op = 'DELETE' then old.position_id else new.position_id end;
  if exists (
    select 1 from public.cv_submissions where position_id = affected_position_id
  ) then
    raise exception 'This workflow is locked because candidates have already applied.' using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists lock_workflow_after_candidate on public.recruitment_stages;
create trigger lock_workflow_after_candidate
  before insert or update or delete on public.recruitment_stages
  for each row execute function private.prevent_workflow_change_with_candidates();

revoke all on function private.prevent_workflow_change_with_candidates() from public, anon, authenticated;

notify pgrst, 'reload schema';
