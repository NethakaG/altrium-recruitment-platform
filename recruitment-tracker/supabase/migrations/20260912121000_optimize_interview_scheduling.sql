-- Follow-up from Supabase advisors: cover foreign keys, initialize the RPC
-- transaction marker once per statement, and consolidate SELECT policies.

create index if not exists interviews_stage_id_idx on public.interviews (stage_id);
create index if not exists interviews_created_by_idx on public.interviews (created_by);
create index if not exists interview_email_notifications_interview_id_idx
  on public.interview_email_notifications (interview_id);

drop policy if exists "Recruiters can view interviewer profiles" on public.interviewer_profiles;
drop policy if exists "Interviewers can view their own profile" on public.interviewer_profiles;
create policy "Permitted staff can view interviewer profiles"
  on public.interviewer_profiles for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or staff_id = (select auth.uid())
  );

drop policy if exists "Recruiters can view availability" on public.interviewer_availability;
drop policy if exists "Interviewers can view their availability" on public.interviewer_availability;
create policy "Permitted staff can view availability"
  on public.interviewer_availability for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interviewer_id and profile.staff_id = (select auth.uid())
    )
  );

drop policy if exists "Recruiters can view interviews" on public.interviews;
drop policy if exists "Interviewers can view assigned interviews" on public.interviews;
create policy "Permitted staff can view interviews"
  on public.interviews for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or exists (
      select 1 from public.interviewer_profiles profile
      where profile.id = interviewer_id and profile.staff_id = (select auth.uid())
    )
  );

drop policy if exists "Recruiters can view interview emails" on public.interview_email_notifications;
drop policy if exists "Interviewers can view their interview emails" on public.interview_email_notifications;
create policy "Permitted staff can view interview emails"
  on public.interview_email_notifications for select to authenticated
  using (
    (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    or exists (
      select 1
      from public.interviews interview
      join public.interviewer_profiles profile on profile.id = interview.interviewer_id
      where interview.id = interview_id and profile.staff_id = (select auth.uid())
    )
  );

drop policy if exists "Scheduling RPC can insert interviews" on public.interviews;
create policy "Scheduling RPC can insert interviews"
  on public.interviews for insert to authenticated
  with check (
    (select current_setting('app.interview_operation', true)) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

drop policy if exists "Scheduling RPC can update interviews" on public.interviews;
create policy "Scheduling RPC can update interviews"
  on public.interviews for update to authenticated
  using ((select current_setting('app.interview_operation', true)) = 'allowed')
  with check ((select current_setting('app.interview_operation', true)) = 'allowed');

drop policy if exists "Scheduling RPC can insert interview emails" on public.interview_email_notifications;
create policy "Scheduling RPC can insert interview emails"
  on public.interview_email_notifications for insert to authenticated
  with check (
    (select current_setting('app.interview_operation', true)) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

drop policy if exists "Scheduling RPC can update interview emails" on public.interview_email_notifications;
create policy "Scheduling RPC can update interview emails"
  on public.interview_email_notifications for update to authenticated
  using (
    (select current_setting('app.interview_operation', true)) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  )
  with check (
    (select current_setting('app.interview_operation', true)) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

notify pgrst, 'reload schema';
