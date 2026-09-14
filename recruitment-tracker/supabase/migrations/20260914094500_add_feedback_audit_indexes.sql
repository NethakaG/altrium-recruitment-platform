-- Cover audit-user foreign keys used by feedback history and review lookups.
create index if not exists interview_feedback_reviewed_by_idx
  on public.interview_feedback (reviewed_by);
create index if not exists interview_feedback_history_changed_by_idx
  on public.interview_feedback_history (changed_by);
