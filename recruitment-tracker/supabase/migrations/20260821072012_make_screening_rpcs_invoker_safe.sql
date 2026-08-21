-- Replace exposed SECURITY DEFINER routines with RLS-gated SECURITY INVOKER routines.

revoke all on table public.position_screening_rubrics from authenticated;
grant select on table public.position_screening_rubrics to authenticated;
grant insert (position_id, criteria, shortlist_count, created_by)
  on table public.position_screening_rubrics to authenticated;

drop policy if exists "Rubric save can insert locked criteria" on public.position_screening_rubrics;
create policy "Rubric save can insert locked criteria"
  on public.position_screening_rubrics
  for insert
  to authenticated
  with check (
    current_setting('app.rubric_save', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and created_by = (select auth.uid())
    and exists (
      select 1 from public.positions
      where id = position_id
        and status = 'Open'
        and archived_at is null
        and workflow_configured = true
        and rubric_configured = false
    )
  );

grant update (rubric_configured) on table public.positions to authenticated;

drop policy if exists "Rubric save can publish position" on public.positions;
create policy "Rubric save can publish position"
  on public.positions
  for update
  to authenticated
  using (
    current_setting('app.rubric_save', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and status = 'Open'
    and archived_at is null
    and workflow_configured = true
    and rubric_configured = false
  )
  with check (
    current_setting('app.rubric_save', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and status = 'Open'
    and archived_at is null
    and workflow_configured = true
    and rubric_configured = true
  );

grant update (
  status, closed_at, screening_status, screening_error,
  screening_started_at, screening_completed_at
) on table public.positions to authenticated;

drop policy if exists "HR and IT can close open positions" on public.positions;
drop policy if exists "Screening begin can close position" on public.positions;
create policy "Screening begin can close position"
  on public.positions
  for update
  to authenticated
  using (
    current_setting('app.screening_begin', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and archived_at is null
    and (
      status = 'Open'
      or (
        status = 'Closed'
        and (
          screening_status = 'Failed'
          or (screening_status = 'Processing' and screening_started_at < now() - interval '10 minutes')
        )
      )
    )
  )
  with check (
    current_setting('app.screening_begin', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and status = 'Closed'
    and archived_at is null
    and screening_status = 'Processing'
    and rubric_configured = true
    and workflow_configured = true
  );

create or replace function public.save_position_screening_rubric(
  p_position_id uuid,
  p_criteria jsonb,
  p_shortlist_count integer default 3
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  total_weight integer := 0;
  saved jsonb;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can configure screening rubrics.' using errcode = '42501';
  end if;

  perform set_config('app.rubric_save', 'allowed', true);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_position_id::text, 1));

  perform 1
  from public.positions
  where id = p_position_id
    and status = 'Open'
    and archived_at is null
    and workflow_configured = true
    and rubric_configured = false;

  if not found then
    raise exception 'The rubric is already locked or this position is not ready.' using errcode = '23514';
  end if;

  if p_criteria is null or jsonb_typeof(p_criteria) <> 'array'
    or jsonb_array_length(p_criteria) not between 3 and 8 then
    raise exception 'A rubric requires between 3 and 8 criteria.' using errcode = '23514';
  end if;

  if p_shortlist_count not between 1 and 5 then
    raise exception 'The shortlist size must be between 1 and 5.' using errcode = '23514';
  end if;

  for item in select value from jsonb_array_elements(p_criteria)
  loop
    if jsonb_typeof(item) <> 'object'
      or char_length(trim(coalesce(item ->> 'id', ''))) = 0
      or char_length(trim(coalesce(item ->> 'name', ''))) not between 2 and 80
      or char_length(trim(coalesce(item ->> 'description', ''))) not between 10 and 500
      or coalesce(item ->> 'weight', '') !~ '^[0-9]+$'
      or (item ->> 'weight')::integer not between 5 and 80 then
      raise exception 'Every criterion requires an ID, name, description and valid weight.' using errcode = '23514';
    end if;
    total_weight := total_weight + (item ->> 'weight')::integer;
  end loop;

  if total_weight <> 100 then
    raise exception 'Criterion weights must total exactly 100 percent.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_criteria) item
    group by lower(trim(item ->> 'id'))
    having count(*) > 1
  ) then
    raise exception 'Criterion IDs must be unique.' using errcode = '23505';
  end if;

  insert into public.position_screening_rubrics (
    position_id, criteria, shortlist_count, created_by
  ) values (
    p_position_id,
    (
      select jsonb_agg(jsonb_build_object(
        'id', lower(trim(item ->> 'id')),
        'name', trim(item ->> 'name'),
        'description', trim(item ->> 'description'),
        'weight', (item ->> 'weight')::integer
      ) order by ordinality)
      from jsonb_array_elements(p_criteria) with ordinality as criterion(item, ordinality)
    ),
    p_shortlist_count,
    (select auth.uid())
  );

  update public.positions
  set rubric_configured = true
  where id = p_position_id;

  select jsonb_build_object(
    'position_id', position_id,
    'criteria', criteria,
    'shortlist_count', shortlist_count,
    'locked_at', locked_at
  ) into saved
  from public.position_screening_rubrics
  where position_id = p_position_id;

  return saved;
end;
$$;

create or replace function public.begin_position_screening(p_position_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.positions%rowtype;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can close and screen positions.' using errcode = '42501';
  end if;

  perform set_config('app.screening_begin', 'allowed', true);

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

notify pgrst, 'reload schema';
