-- Sprint 2 / Feature 3: final hiring recommendations, executive approval,
-- immutable decision history and protected final candidate outcomes.

create table public.final_hiring_decisions (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.cv_submissions(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete restrict,
  hiring_manager_id uuid not null references public.staff_profiles(id) on delete restrict,
  recommendation text not null,
  recommendation_note text not null,
  decision_status text not null default 'pending_approval',
  recommended_at timestamptz not null default now(),
  executive_id uuid references public.staff_profiles(id) on delete restrict,
  executive_note text,
  decided_at timestamptz,
  final_outcome text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint final_hiring_recommendation_check check (recommendation in ('hire', 'reject')),
  constraint final_hiring_recommendation_note_check check (
    char_length(trim(recommendation_note)) between 20 and 5000
  ),
  constraint final_hiring_decision_status_check check (
    decision_status in ('pending_approval', 'returned', 'approved')
  ),
  constraint final_hiring_executive_note_check check (
    executive_note is null or char_length(trim(executive_note)) between 20 and 5000
  ),
  constraint final_hiring_outcome_check check (
    final_outcome is null or final_outcome in ('Hired', 'Rejected')
  ),
  constraint final_hiring_approval_consistency_check check (
    (
      decision_status = 'pending_approval'
      and executive_id is null and executive_note is null
      and decided_at is null and final_outcome is null
    )
    or (
      decision_status = 'returned'
      and executive_id is not null and executive_note is not null
      and decided_at is not null and final_outcome is null
    )
    or (
      decision_status = 'approved'
      and executive_id is not null and executive_note is not null
      and decided_at is not null and final_outcome is not null
    )
  ),
  constraint final_hiring_version_check check (version > 0)
);

create table public.final_hiring_decision_history (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.final_hiring_decisions(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  change_reason text not null,
  changed_by uuid not null references public.staff_profiles(id) on delete restrict,
  changed_at timestamptz not null default now(),
  constraint final_hiring_history_reason_check check (
    char_length(trim(change_reason)) between 3 and 240
  ),
  unique (decision_id, version)
);

create trigger set_final_hiring_decisions_updated_at
  before update on public.final_hiring_decisions
  for each row execute function public.set_updated_at();

create index final_hiring_decisions_position_status_idx
  on public.final_hiring_decisions (position_id, decision_status, recommended_at desc);
create index final_hiring_decisions_manager_idx
  on public.final_hiring_decisions (hiring_manager_id);
create index final_hiring_decisions_executive_idx
  on public.final_hiring_decisions (executive_id);
create index final_hiring_history_lookup_idx
  on public.final_hiring_decision_history (decision_id, version desc);
create index final_hiring_history_changed_by_idx
  on public.final_hiring_decision_history (changed_by);

-- A position can have at most one approved hire. Other finalists remain available
-- for explicit individual decisions instead of being rejected automatically.
create unique index final_hiring_one_approved_hire_per_position
  on public.final_hiring_decisions (position_id)
  where decision_status = 'approved' and final_outcome = 'Hired';

alter table public.final_hiring_decisions enable row level security;
alter table public.final_hiring_decision_history enable row level security;

revoke all on table public.final_hiring_decisions from public, anon, authenticated;
revoke all on table public.final_hiring_decision_history from public, anon, authenticated;
grant select, insert, update on table public.final_hiring_decisions to authenticated;
grant select, insert on table public.final_hiring_decision_history to authenticated;

create policy "Decision staff can view final hiring decisions"
  on public.final_hiring_decisions for select to authenticated
  using (
    (select private.current_staff_role()) in (
      'it_admin', 'hr_recruiter', 'hiring_manager', 'management_user'
    )
  );

create policy "Final decision RPC can insert recommendations"
  on public.final_hiring_decisions for insert to authenticated
  with check (
    (select current_setting('app.final_decision_operation', true)) = 'allowed'
    and (select private.current_staff_role()) = 'hiring_manager'
    and hiring_manager_id = (select auth.uid())
  );

create policy "Final decision RPC can update recommendations"
  on public.final_hiring_decisions for update to authenticated
  using (
    (select current_setting('app.final_decision_operation', true)) = 'allowed'
    and (select private.current_staff_role()) in ('hiring_manager', 'management_user')
  )
  with check (
    (select current_setting('app.final_decision_operation', true)) = 'allowed'
    and (select private.current_staff_role()) in ('hiring_manager', 'management_user')
  );

create policy "Decision staff can view final hiring history"
  on public.final_hiring_decision_history for select to authenticated
  using (
    exists (
      select 1 from public.final_hiring_decisions decision
      where decision.id = final_hiring_decision_history.decision_id
    )
  );

create policy "Final decision RPC can insert history"
  on public.final_hiring_decision_history for insert to authenticated
  with check (
    (select current_setting('app.final_decision_operation', true)) = 'allowed'
  );

-- Executives may only update the final status from the protected approval RPC.
create policy "Final decision RPC can update candidate outcome"
  on public.cv_submissions for update to authenticated
  using (
    (select current_setting('app.final_decision_operation', true)) = 'allowed'
    and (select private.current_staff_role()) = 'management_user'
  )
  with check (
    (select current_setting('app.final_decision_operation', true)) = 'allowed'
    and (select private.current_staff_role()) = 'management_user'
  );

-- Final-stage reviewers need the interview trail that produced the recommendation.
drop policy if exists "Permitted staff can view interviews" on public.interviews;
create policy "Permitted staff can view interviews"
  on public.interviews for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interviewer_id and profile.staff_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.cv_submissions candidate
      join public.recruitment_stages stage on stage.id = candidate.current_stage_id
      where candidate.id = submission_id
        and (
          ((select private.current_staff_role()) = 'hiring_manager' and stage.stage_type = 'final_decision')
          or ((select private.current_staff_role()) = 'management_user' and stage.stage_type = 'final_decision')
        )
    )
  );

drop policy if exists "Permitted staff can view interview feedback" on public.interview_feedback;
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
    or exists (
      select 1
      from public.interviews interview
      join public.cv_submissions candidate on candidate.id = interview.submission_id
      join public.recruitment_stages stage on stage.id = candidate.current_stage_id
      where interview.id = interview_feedback.interview_id
        and stage.stage_type = 'final_decision'
        and (select private.current_staff_role()) in ('hiring_manager', 'management_user')
    )
  );

create or replace function private.record_final_hiring_history(
  p_decision public.final_hiring_decisions,
  p_reason text,
  p_changed_by uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.final_hiring_decision_history (
    decision_id, version, snapshot, change_reason, changed_by
  ) values (
    p_decision.id,
    p_decision.version,
    to_jsonb(p_decision),
    trim(p_reason),
    p_changed_by
  );
end;
$$;

revoke all on function private.record_final_hiring_history(
  public.final_hiring_decisions, text, uuid
) from public, anon, authenticated;
grant execute on function private.record_final_hiring_history(
  public.final_hiring_decisions, text, uuid
) to authenticated;

create or replace function public.submit_final_hiring_recommendation(
  p_submission_id uuid,
  p_recommendation text,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid;
  candidate_position_id uuid;
  candidate_stage_id uuid;
  candidate_status text;
  candidate_stage_type public.recruitment_stage_type;
  existing_decision public.final_hiring_decisions%rowtype;
  result_id uuid;
begin
  if (select private.current_staff_role()) <> 'hiring_manager' then
    raise exception 'Only a Hiring Manager can submit the final recommendation.' using errcode = '42501';
  end if;
  if p_recommendation not in ('hire', 'reject') then
    raise exception 'Choose Recommend hire or Recommend reject.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_note, ''))) not between 20 and 5000 then
    raise exception 'The recommendation reason must contain 20 to 5000 characters.' using errcode = '22023';
  end if;

  select profile.id into actor_id
  from public.staff_profiles profile
  where profile.id = (select auth.uid())
    and profile.is_active
    and profile.role = 'hiring_manager';
  if actor_id is null then
    raise exception 'Your Hiring Manager staff account is not active.' using errcode = '42501';
  end if;

  select candidate.position_id, candidate.current_stage_id, candidate.application_status
  into candidate_position_id, candidate_stage_id, candidate_status
  from public.cv_submissions candidate
  where candidate.id = p_submission_id;
  if not found then
    raise exception 'Candidate submission not found.' using errcode = 'P0002';
  end if;
  select stage.stage_type into candidate_stage_type
  from public.recruitment_stages stage where stage.id = candidate_stage_id;
  if candidate_status <> 'Active' or candidate_stage_type <> 'final_decision' then
    raise exception 'Only active candidates at Final Decision can be recommended.' using errcode = '23514';
  end if;

  perform set_config('app.final_decision_operation', 'allowed', true);
  select decision.* into existing_decision
  from public.final_hiring_decisions decision
  where decision.submission_id = p_submission_id
  for update;

  if found then
    if existing_decision.decision_status <> 'returned' then
      raise exception 'This recommendation is already awaiting approval or has been finalized.' using errcode = '23514';
    end if;
    perform private.record_final_hiring_history(
      existing_decision, 'Hiring Manager resubmitted recommendation', actor_id
    );
    update public.final_hiring_decisions
    set hiring_manager_id = actor_id,
        recommendation = p_recommendation,
        recommendation_note = trim(p_note),
        decision_status = 'pending_approval',
        recommended_at = now(),
        executive_id = null,
        executive_note = null,
        decided_at = null,
        final_outcome = null,
        version = version + 1
    where id = existing_decision.id
    returning id into result_id;
  else
    insert into public.final_hiring_decisions (
      submission_id, position_id, hiring_manager_id, recommendation, recommendation_note
    ) values (
      p_submission_id, candidate_position_id, actor_id, p_recommendation, trim(p_note)
    ) returning id into result_id;
  end if;

  return result_id;
end;
$$;

create or replace function public.review_final_hiring_recommendation(
  p_decision_id uuid,
  p_action text,
  p_note text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid;
  target_decision public.final_hiring_decisions%rowtype;
  candidate_stage_id uuid;
  candidate_status text;
  candidate_stage_type public.recruitment_stage_type;
  outcome text;
begin
  if (select private.current_staff_role()) <> 'management_user' then
    raise exception 'Only an Executive can review the final recommendation.' using errcode = '42501';
  end if;
  if p_action not in ('approve', 'return') then
    raise exception 'Choose Approve or Return for reconsideration.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_note, ''))) not between 20 and 5000 then
    raise exception 'The executive decision reason must contain 20 to 5000 characters.' using errcode = '22023';
  end if;

  select profile.id into actor_id
  from public.staff_profiles profile
  where profile.id = (select auth.uid())
    and profile.is_active
    and profile.role = 'management_user';
  if actor_id is null then
    raise exception 'Your Executive staff account is not active.' using errcode = '42501';
  end if;

  perform set_config('app.final_decision_operation', 'allowed', true);
  select decision.* into target_decision
  from public.final_hiring_decisions decision
  where decision.id = p_decision_id
  for update;
  if not found then
    raise exception 'Final hiring recommendation not found.' using errcode = 'P0002';
  end if;
  if target_decision.decision_status <> 'pending_approval' then
    raise exception 'Only a pending recommendation can be reviewed.' using errcode = '23514';
  end if;

  select candidate.current_stage_id, candidate.application_status
  into candidate_stage_id, candidate_status
  from public.cv_submissions candidate
  where candidate.id = target_decision.submission_id
  for update;
  select stage.stage_type into candidate_stage_type
  from public.recruitment_stages stage where stage.id = candidate_stage_id;
  if candidate_status <> 'Active' or candidate_stage_type <> 'final_decision' then
    raise exception 'The candidate is no longer active at Final Decision.' using errcode = '23514';
  end if;

  perform private.record_final_hiring_history(
    target_decision,
    case when p_action = 'approve' then 'Executive approved recommendation'
         else 'Executive returned recommendation' end,
    actor_id
  );

  if p_action = 'return' then
    update public.final_hiring_decisions
    set decision_status = 'returned',
        executive_id = actor_id,
        executive_note = trim(p_note),
        decided_at = now(),
        final_outcome = null,
        version = version + 1
    where id = target_decision.id;
    return jsonb_build_object(
      'id', target_decision.id,
      'decision_status', 'returned',
      'application_status', candidate_status
    );
  end if;

  outcome := case when target_decision.recommendation = 'hire' then 'Hired' else 'Rejected' end;
  update public.final_hiring_decisions
  set decision_status = 'approved',
      executive_id = actor_id,
      executive_note = trim(p_note),
      decided_at = now(),
      final_outcome = outcome,
      version = version + 1
  where id = target_decision.id;

  update public.cv_submissions
  set application_status = outcome
  where id = target_decision.submission_id;

  return jsonb_build_object(
    'id', target_decision.id,
    'decision_status', 'approved',
    'final_outcome', outcome,
    'application_status', outcome
  );
exception
  when unique_violation then
    raise exception 'This position already has an approved hire.' using errcode = '23505';
end;
$$;

revoke all on function public.submit_final_hiring_recommendation(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.review_final_hiring_recommendation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_final_hiring_recommendation(uuid, text, text)
  to authenticated;
grant execute on function public.review_final_hiring_recommendation(uuid, text, text)
  to authenticated;

-- HR and IT cannot bypass the recommendation/approval process at Final Decision.
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
  if p_status in ('Hired', 'Rejected') and stage_type = 'final_decision' then
    raise exception 'Final outcomes require an approved Executive decision.' using errcode = '23514';
  end if;
  update public.cv_submissions set application_status = p_status where id = p_submission_id
  returning jsonb_build_object(
    'id', id, 'current_stage_id', current_stage_id,
    'application_status', application_status
  ) into result;
  return result;
end;
$$;

revoke all on function public.set_candidate_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_candidate_status(uuid, text) to authenticated;

notify pgrst, 'reload schema';
