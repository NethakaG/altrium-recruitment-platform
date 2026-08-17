-- Keep the public intake and automatic Gemini extraction on one reliable format.

alter table public.cv_submissions
  drop constraint if exists cv_submissions_mime_type_check,
  add constraint cv_submissions_mime_type_check check (mime_type = 'application/pdf');

update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf']
where id = 'candidate-cvs';

comment on column public.cv_submissions.mime_type is
  'PDF only. The public portal rejects Word documents so every accepted CV can use automatic extraction.';
