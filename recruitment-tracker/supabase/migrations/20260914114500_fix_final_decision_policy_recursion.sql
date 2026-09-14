-- Avoid circular RLS evaluation between cv_submissions and interviews while
-- preserving final-stage evidence visibility for Hiring Managers and Executives.

create or replace function private.can_view_final_candidate_interviews(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select private.current_staff_role()) in ('hiring_manager', 'management_user')
    and exists (
      select 1
      from public.cv_submissions candidate
      join public.recruitment_stages stage on stage.id = candidate.current_stage_id
      where candidate.id = p_submission_id
        and stage.stage_type = 'final_decision'
    );
$$;

revoke all on function private.can_view_final_candidate_interviews(uuid)
  from public, anon, authenticated;
grant execute on function private.can_view_final_candidate_interviews(uuid)
  to authenticated;

drop policy if exists "Permitted staff can view interviews" on public.interviews;
create policy "Permitted staff can view interviews"
  on public.interviews for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interviewer_id and profile.staff_id = (select auth.uid())
    )
    or (select private.can_view_final_candidate_interviews(submission_id))
  );

notify pgrst, 'reload schema';
