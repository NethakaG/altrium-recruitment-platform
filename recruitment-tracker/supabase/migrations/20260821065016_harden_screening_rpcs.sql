-- Permit recovery from a background worker that was terminated by a hard runtime limit,
-- and cover the rubric creator foreign key reported by the performance advisor.

create index if not exists position_screening_rubrics_created_by_idx
  on public.position_screening_rubrics (created_by);

create or replace function public.begin_position_screening(p_position_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.positions%rowtype;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can close and screen positions.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_position_id::text, 2));

  select * into target
  from public.positions
  where id = p_position_id and archived_at is null
  for update;

  if not found then raise exception 'Position not found.' using errcode = 'P0002'; end if;
  if target.workflow_configured is not true or target.rubric_configured is not true then
    raise exception 'Complete and lock the workflow and screening rubric first.' using errcode = '23514';
  end if;
  if target.status = 'Closed'
    and target.screening_status <> 'Failed'
    and not (
      target.screening_status = 'Processing'
      and target.screening_started_at < now() - interval '10 minutes'
    ) then
    raise exception 'This position has already been closed.' using errcode = '23514';
  end if;
  if target.status not in ('Open', 'Closed') then
    raise exception 'This position cannot be screened from its current state.' using errcode = '23514';
  end if;

  update public.positions
  set status = 'Closed',
      closed_at = coalesce(closed_at, now()),
      screening_status = 'Processing',
      screening_error = null,
      screening_started_at = now(),
      screening_completed_at = null
  where id = p_position_id;

  return jsonb_build_object('position_id', p_position_id, 'screening_status', 'Processing');
end;
$$;

revoke all on function public.begin_position_screening(uuid) from public, anon, authenticated;
grant execute on function public.begin_position_screening(uuid) to authenticated;
