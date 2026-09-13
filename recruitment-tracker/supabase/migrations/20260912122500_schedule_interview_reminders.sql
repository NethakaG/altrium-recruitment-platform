-- Prepare automatic reminder delivery. The job is intentionally inactive until
-- matching project_url and interview_cron_secret values are stored in Vault and
-- INTERVIEW_CRON_SECRET is configured on the Edge Function.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'dispatch-interview-email-reminders',
  '* * * * *',
  $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/send-interview-emails',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'interview_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    )
    where exists (select 1 from vault.decrypted_secrets where name = 'project_url')
      and exists (select 1 from vault.decrypted_secrets where name = 'interview_cron_secret');
  $job$
);

select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'dispatch-interview-email-reminders'),
  active := false
);
