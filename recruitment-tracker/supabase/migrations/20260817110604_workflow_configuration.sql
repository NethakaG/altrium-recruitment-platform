-- Function 2: position-specific recruitment workflow configuration.

do $$
begin
  create type public.recruitment_stage_type as enum (
    'cv_review',
    'hr_screening',
    'hr_interview',
    'technical_assessment',
    'technical_interview',
    'hiring_manager_interview',
    'engineering_manager_interview',
    'executive_interview',
    'final_decision',
    'custom'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.positions
  add column if not exists workflow_configured boolean not null default false;

comment on column public.positions.workflow_configured is
  'True only after a complete CV Review-to-Final Decision workflow has been saved.';

alter table public.recruitment_stages
  add column if not exists stage_type public.recruitment_stage_type;

alter table public.recruitment_stages
  alter column stage_type set not null;

comment on column public.recruitment_stages.stage_type is
  'Stable workflow stage category. The name column stores the display label.';

create unique index if not exists recruitment_stages_standard_type_unique
  on public.recruitment_stages (position_id, stage_type)
  where stage_type <> 'custom';

create unique index if not exists recruitment_stages_custom_name_unique
  on public.recruitment_stages (position_id, lower(name))
  where stage_type = 'custom';

revoke all privileges on table public.recruitment_stages from public, anon, authenticated;
grant select on table public.recruitment_stages to authenticated;
grant insert (position_id, name, stage_order, stage_type) on table public.recruitment_stages to authenticated;
grant delete on table public.recruitment_stages to authenticated;

grant select (workflow_configured) on table public.positions to anon;
grant update (workflow_configured) on table public.positions to authenticated;

drop policy if exists "Active staff can view recruitment workflows" on public.recruitment_stages;
drop policy if exists "Workflow save can insert stages" on public.recruitment_stages;
drop policy if exists "Workflow save can delete stages" on public.recruitment_stages;
drop policy if exists "HR and IT can publish configured workflows" on public.positions;

create policy "Active staff can view recruitment workflows"
  on public.recruitment_stages
  for select
  to authenticated
  using ((select private.current_staff_role()) is not null);

create policy "Workflow save can insert stages"
  on public.recruitment_stages
  for insert
  to authenticated
  with check (
    current_setting('app.workflow_save', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

create policy "Workflow save can delete stages"
  on public.recruitment_stages
  for delete
  to authenticated
  using (
    current_setting('app.workflow_save', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
  );

create policy "HR and IT can publish configured workflows"
  on public.positions
  for update
  to authenticated
  using (
    current_setting('app.workflow_save', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and status = 'Open'
    and archived_at is null
  )
  with check (
    current_setting('app.workflow_save', true) = 'allowed'
    and (select private.current_staff_role()) in ('it_admin', 'hr_recruiter')
    and status = 'Open'
    and archived_at is null
    and workflow_configured = true
  );

create or replace function public.save_recruitment_workflow(
  p_position_id uuid,
  p_stages jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stage_count integer;
  result jsonb;
begin
  if (select private.current_staff_role()) not in ('it_admin', 'hr_recruiter') then
    raise exception 'Only IT Admin or HR can configure recruitment workflows.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_position_id::text, 0));

  perform 1
  from public.positions
  where id = p_position_id
    and status = 'Open'
    and archived_at is null;

  if not found then
    raise exception 'The position does not exist or is no longer open.' using errcode = 'P0002';
  end if;

  if p_stages is null or jsonb_typeof(p_stages) <> 'array' then
    raise exception 'Workflow stages must be supplied as an array.' using errcode = '22023';
  end if;

  stage_count := jsonb_array_length(p_stages);
  if stage_count < 2 then
    raise exception 'A workflow requires at least CV Review and Final Decision.' using errcode = '23514';
  end if;

  if p_stages -> 0 ->> 'stage_type' <> 'cv_review' then
    raise exception 'CV Review must be the first workflow stage.' using errcode = '23514';
  end if;

  if p_stages -> (stage_count - 1) ->> 'stage_type' <> 'final_decision' then
    raise exception 'Final Decision must be the last workflow stage.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_stages) as item
    where item ->> 'stage_type' not in (
      'cv_review', 'hr_screening', 'hr_interview', 'technical_assessment',
      'technical_interview', 'hiring_manager_interview',
      'engineering_manager_interview', 'executive_interview',
      'final_decision', 'custom'
    )
  ) then
    raise exception 'The workflow contains an unsupported stage type.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_stages) as item
    where item ->> 'stage_type' = 'custom'
      and char_length(trim(coalesce(item ->> 'name', ''))) = 0
  ) then
    raise exception 'Every custom stage requires a name.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from (
      select case
        when item ->> 'stage_type' = 'custom'
          then 'custom:' || lower(trim(item ->> 'name'))
        else item ->> 'stage_type'
      end as stage_key
      from jsonb_array_elements(p_stages) as item
    ) stage_keys
    group by stage_key
    having count(*) > 1
  ) then
    raise exception 'The same workflow stage cannot be used twice.' using errcode = '23505';
  end if;

  perform set_config('app.workflow_save', 'allowed', true);

  delete from public.recruitment_stages
  where position_id = p_position_id;

  insert into public.recruitment_stages (position_id, name, stage_order, stage_type)
  select
    p_position_id,
    case item ->> 'stage_type'
      when 'cv_review' then 'CV Review'
      when 'hr_screening' then 'HR Screening'
      when 'hr_interview' then 'HR Interview'
      when 'technical_assessment' then 'Technical Assessment'
      when 'technical_interview' then 'Technical Interview'
      when 'hiring_manager_interview' then 'Hiring Manager Interview'
      when 'engineering_manager_interview' then 'Engineering Manager Interview'
      when 'executive_interview' then 'Executive Interview'
      when 'final_decision' then 'Final Decision'
      else trim(item ->> 'name')
    end,
    ordinality::integer,
    (item ->> 'stage_type')::public.recruitment_stage_type
  from jsonb_array_elements(p_stages) with ordinality as stage(item, ordinality);

  update public.positions
  set workflow_configured = true
  where id = p_position_id;

  select jsonb_agg(
    jsonb_build_object(
      'id', id,
      'position_id', position_id,
      'name', name,
      'stage_order', stage_order,
      'stage_type', stage_type
    ) order by stage_order
  )
  into result
  from public.recruitment_stages
  where position_id = p_position_id;

  return result;
end;
$$;

revoke all on function public.save_recruitment_workflow(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_recruitment_workflow(uuid, jsonb) to authenticated;

-- Seed the two confirmed workflows without relying on generated position IDs.
insert into public.recruitment_stages (position_id, name, stage_order, stage_type)
select p.id, seed.name, seed.stage_order, seed.stage_type::public.recruitment_stage_type
from public.positions p
cross join (values
  ('CV Review', 1, 'cv_review'),
  ('HR Interview', 2, 'hr_interview'),
  ('Hiring Manager Interview', 3, 'hiring_manager_interview'),
  ('Final Decision', 4, 'final_decision')
) as seed(name, stage_order, stage_type)
where p.title = 'Marketing Intern'
  and p.archived_at is null
  and not exists (
    select 1 from public.recruitment_stages existing where existing.position_id = p.id
  );

insert into public.recruitment_stages (position_id, name, stage_order, stage_type)
select p.id, seed.name, seed.stage_order, seed.stage_type::public.recruitment_stage_type
from public.positions p
cross join (values
  ('CV Review', 1, 'cv_review'),
  ('HR Screening', 2, 'hr_screening'),
  ('Technical Assessment', 3, 'technical_assessment'),
  ('Technical Interview', 4, 'technical_interview'),
  ('Engineering Manager Interview', 5, 'engineering_manager_interview'),
  ('Executive Interview', 6, 'executive_interview'),
  ('Final Decision', 7, 'final_decision')
) as seed(name, stage_order, stage_type)
where p.title = 'Senior Software Engineer'
  and p.archived_at is null
  and not exists (
    select 1 from public.recruitment_stages existing where existing.position_id = p.id
  );

update public.positions p
set workflow_configured = true
where p.archived_at is null
  and exists (
    select 1
    from public.recruitment_stages first_stage
    where first_stage.position_id = p.id
      and first_stage.stage_order = 1
      and first_stage.stage_type = 'cv_review'
  )
  and exists (
    select 1
    from public.recruitment_stages last_stage
    where last_stage.position_id = p.id
      and last_stage.stage_type = 'final_decision'
      and last_stage.stage_order = (
        select max(stage_order)
        from public.recruitment_stages
        where position_id = p.id
      )
  );

drop policy if exists "Public can view open positions" on public.positions;
create policy "Public can view open positions"
  on public.positions
  for select
  to anon
  using (
    status = 'Open'
    and archived_at is null
    and workflow_configured = true
  );

notify pgrst, 'reload schema';
