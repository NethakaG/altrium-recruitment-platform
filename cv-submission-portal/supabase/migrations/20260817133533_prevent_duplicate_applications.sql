-- One candidate email may submit only one application per position.
-- The same email remains free to apply to different positions.

create unique index if not exists cv_submissions_position_email_unique
  on public.cv_submissions (position_id, lower(btrim(candidate_email)))
  where candidate_email is not null;

comment on index public.cv_submissions_position_email_unique is
  'Prevents duplicate applications for the same normalized email and position.';
