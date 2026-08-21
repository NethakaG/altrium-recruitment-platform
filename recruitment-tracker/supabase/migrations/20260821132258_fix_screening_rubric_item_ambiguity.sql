-- Avoid a PL/pgSQL variable/SQL alias collision while preserving the
-- authorization, validation, locking, and RLS-gated write behavior.
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
  criterion_entry jsonb;
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

  for criterion_entry in
    select criteria_element.value
    from pg_catalog.jsonb_array_elements(p_criteria) as criteria_element(value)
  loop
    if jsonb_typeof(criterion_entry) <> 'object'
      or char_length(trim(coalesce(criterion_entry ->> 'id', ''))) = 0
      or char_length(trim(coalesce(criterion_entry ->> 'name', ''))) not between 2 and 80
      or char_length(trim(coalesce(criterion_entry ->> 'description', ''))) not between 10 and 500
      or coalesce(criterion_entry ->> 'weight', '') !~ '^[0-9]+$'
      or (criterion_entry ->> 'weight')::integer not between 5 and 80 then
      raise exception 'Every criterion requires an ID, name, description and valid weight.' using errcode = '23514';
    end if;
    total_weight := total_weight + (criterion_entry ->> 'weight')::integer;
  end loop;

  if total_weight <> 100 then
    raise exception 'Criterion weights must total exactly 100 percent.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_criteria) as duplicate_criterion(value)
    group by lower(trim(duplicate_criterion.value ->> 'id'))
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
        'id', lower(trim(criterion_element.value ->> 'id')),
        'name', trim(criterion_element.value ->> 'name'),
        'description', trim(criterion_element.value ->> 'description'),
        'weight', (criterion_element.value ->> 'weight')::integer
      ) order by criterion_element.ordinality)
      from pg_catalog.jsonb_array_elements(p_criteria)
        with ordinality as criterion_element(value, ordinality)
    ),
    p_shortlist_count,
    (select auth.uid())
  );

  update public.positions
  set rubric_configured = true
  where id = p_position_id;

  select jsonb_build_object(
    'position_id', rubric.position_id,
    'criteria', rubric.criteria,
    'shortlist_count', rubric.shortlist_count,
    'locked_at', rubric.locked_at
  ) into saved
  from public.position_screening_rubrics as rubric
  where rubric.position_id = p_position_id;

  return saved;
end;
$$;

revoke all on function public.save_position_screening_rubric(uuid, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.save_position_screening_rubric(uuid, jsonb, integer)
  to authenticated;
